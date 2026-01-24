# PayPal Webhook 500 错误诊断报告

## 问题概述

从日志看到两次 PayPal Webhook 调用都失败了：

```
Nov 20 23:22:56.51  POST  500  /api/payment/webhook/paypal  "Failed to process PayPal webhook"
Nov 20 23:22:15.43  POST  ---  /api/payment/webhook/paypal  "Failed to process PayPal webhook"
```

但是前面有成功的调用：

```
Nov 20 23:22:40.14  POST  200  /api/payment/webhook/paypal
"[2025-11-20T15:22:41.569Z] INFO: Webhook processed successfully"
```

这说明 **webhook 处理逻辑有问题，并不是配置问题**。

## 数据流分析

### 成功的流程

```
1. 23:22:30 → POST /api/payment/onetime/create ✅
   "One-time payment created successfully"

2. 23:22:40 → POST /api/payment/webhook/paypal ✅
   "Webhook processed successfully"

3. 23:22:40 → GET /api/payment/onetime/confirm ✅
   "One-time payment confirmed successfully"

4. 23:22:43 → GET /api/profile ✅
   返回用户信息 (但会员日期是 2029 年)
```

### 失败的流程

```
1. 23:22:15 → POST /api/payment/webhook/paypal ❌
   "Failed to process PayPal webhook"

2. 23:22:56 → POST /api/payment/webhook/paypal ❌
   "Failed to process PayPal webhook"
```

## 根本原因分析

### 问题1：userId 或 subscriptionId 未找到

**文件**: `lib/payment/webhook-handler.ts` 第 612-628 行

```typescript
if (!userId || !subscriptionId) {
  logError(
    `Missing userId or subscriptionId for ${provider} payment`,
    undefined,
    {
      provider,
      subscriptionId,
      userId,
      dataStructure: { /* ... */ },
    }
  );
  return false;  // ❌ 返回 false，导致 500 错误
}
```

当 webhook 数据中没有以下字段时会失败：
- `purchase_units[0].custom_id` 或 `reference_id`（一次性支付）
- `custom_id`（直接字段）
- 无法从 subscriptionId 查询到用户

### 问题2：支付记录未找到

**文件**: `lib/payment/webhook-handler.ts` 第 634-696 行

Webhook 尝试通过 `transaction_id` 查找支付记录：

```typescript
const { data: paymentData } = await supabaseAdmin
  .from("payments")
  .select("*")
  .eq("transaction_id", subscriptionId)  // ❌ 问题：subscriptionId 格式可能不对
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
```

**可能的问题**：
- Webhook 中的 `subscriptionId` 格式与 payments 表中的 `transaction_id` 不匹配
- PayPal 返回的 ID 类型不同（OrderId vs SubscriptionId vs CaptureId）

### 问题3：缺少必要的 billing_cycle 信息

**文件**: `lib/payment/webhook-handler.ts` 第 630-633 行

```typescript
// ✅ 新增：从payments表读取已存储的天数信息
// ⚠️ 注意：如果支付记录中没有 metadata.days 或 billing_cycle
```

Webhook 需要从数据库中读取之前存储的 `days` 或 `billing_cycle` 信息来计算过期时间。

**如果支付记录未找到，webhook 会失败**。

## 关键代码位置

### 1. Webhook 入口

**文件**: `app/api/payment/webhook/paypal/route.ts`

```typescript
// 第 87-99 行
const webhookHandler = WebhookHandler.getInstance();
const success = await webhookHandler.processWebhook(
  "paypal",
  eventType,
  webhookData
);

if (success) {
  return NextResponse.json({ status: "success" });
} else {
  console.error("Failed to process PayPal webhook");
  return NextResponse.json({ error: "Processing failed" }, { status: 500 });
}
```

### 2. 数据提取

**文件**: `lib/payment/webhook-handler.ts` 第 494-585 行

处理 `CHECKOUT.ORDER.APPROVED` 事件时的数据结构：

```typescript
case "CHECKOUT.ORDER.APPROVED":
  // 尝试从以下位置获取 userId:
  // 1. purchase_units[0].custom_id
  // 2. purchase_units[0].reference_id
  // 3. captures[0].custom_id
  // 4. data.custom_id
  // 5. 从 subscriptionId 查询数据库

  if (!userId || !subscriptionId) {
    return false;  // ❌ 导致 500 错误
  }
```

### 3. 支付记录查询

**文件**: `lib/payment/webhook-handler.ts` 第 676-696 行

```typescript
// Supabase 查询
const { data: paymentData } = await supabaseAdmin
  .from("payments")
  .select("*")
  .eq("transaction_id", subscriptionId)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
```

## 可能的原因 (按优先级)

### 1️⃣ 高优先级：数据不匹配

Webhook 中的 `subscriptionId` 可能是不同格式：
- 可能是 Order ID (以 `I-` 开头 for subscriptions, 或订单ID for one-time)
- 可能是 Capture ID
- 可能是 Billing Agreement ID

但 payments 表中存储的 `transaction_id` 格式不同。

**修复方法**：
```typescript
// 需要尝试多种 ID 格式查询
const paymentResults = await supabaseAdmin
  .from("payments")
  .select("*")
  .or(
    `transaction_id.eq.${subscriptionId},` +
    `transaction_id.eq.${captureId},` +
    `metadata->>paypal_order_id.eq.${orderId}`
  )
  .order("created_at", { ascending: false })
  .limit(1);
```

### 2️⃣ 中优先级：custom_id 未设置

创建支付时可能没有正确设置 `custom_id` (用户ID)。

**检查点**：
- `/api/payment/onetime/create` 是否正确设置了 custom_id？
- PayPal 是否接收并保存了这个字段？

### 3️⃣ 中优先级：缓存问题

第二次 webhook 可能是 PayPal 重试，此时的数据结构可能不同。

## 解决方案

### 方案1：改进 userId/subscriptionId 提取逻辑

```typescript
// lib/payment/webhook-handler.ts 第 612-628 行
if (!userId || !subscriptionId) {
  // 不要立即返回 false，而是记录详细日志
  logError(
    `Missing userId or subscriptionId for ${provider} payment`,
    undefined,
    {
      provider,
      subscriptionId,
      userId,
      eventType,
      resourceId: eventData.resource?.id,
      allKeys: Object.keys(eventData).join(", "),
      purchaseUnits: eventData.purchase_units?.length || 0,
      captures: eventData.captures?.length || 0,
      // 记录完整数据以便调试
      raw: JSON.stringify(eventData).substring(0, 500)
    }
  );
  return false;
}
```

### 方案2：改进支付记录查询

```typescript
// lib/payment/webhook-handler.ts 第 676-683 行

// 修复：尝试多种 ID 匹配方式
let paymentData = null;

// 首先尝试 transaction_id 精确匹配
const { data: exactMatch } = await supabaseAdmin
  .from("payments")
  .select("*")
  .eq("transaction_id", subscriptionId)
  .limit(1)
  .maybeSingle();

if (exactMatch) {
  paymentData = exactMatch;
} else {
  // 其次尝试从 metadata 中查找 PayPal 相关 IDs
  const { data: metadataMatches } = await supabaseAdmin
    .from("payments")
    .select("*")
    .or(
      `metadata->>paypal_order_id.eq.${subscriptionId},` +
      `metadata->>paypal_capture_id.eq.${subscriptionId},` +
      `metadata->>paypal_billing_agreement_id.eq.${subscriptionId}`
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (metadataMatches && metadataMatches.length > 0) {
    paymentData = metadataMatches[0];
    logInfo("Found payment via metadata", { subscriptionId, userId });
  }
}

if (!paymentData) {
  logWarn(`Payment record not found for webhook`, {
    provider,
    subscriptionId,
    userId,
  });
  // 仍然可以继续，但需要从 webhook 数据中获取天数
}
```

### 方案3：添加详细日志

在 `/api/payment/webhook/paypal/route.ts` 添加更多日志：

```typescript
try {
  const webhookData = JSON.parse(body);
  const eventType = webhookData.event_type;

  console.log("🔍 [PAYPAL WEBHOOK] Parsed webhook data:", {
    eventType,
    resourceId: webhookData.resource?.id,
    customId: webhookData.resource?.custom_id ||
              webhookData.resource?.purchase_units?.[0]?.custom_id,
    purchaseUnits: webhookData.resource?.purchase_units?.length || 0,
    captures: webhookData.resource?.captures?.length || 0,
  });

  // ... 其他代码
} catch (error) {
  console.error("🔴 [PAYPAL WEBHOOK] ERROR:", {
    error: error instanceof Error ? error.message : String(error),
    bodyLength: body.length,
    bodyPreview: body.substring(0, 500),
  });
  // ...
}
```

## 测试步骤

1. **启用详细日志**
   - 设置环境变量 `LOG_LEVEL=debug`
   - 查看 webhook 处理的每一步日志

2. **模拟 Webhook**
   ```bash
   curl -X POST http://localhost:3000/api/payment/webhook/paypal \
     -H "Content-Type: application/json" \
     -H "paypal-transmission-sig: test" \
     -H "paypal-transmission-id: test-123" \
     -H "paypal-transmission-time: 2025-11-20T00:00:00Z" \
     -H "paypal-cert-url: https://api.sandbox.paypal.com/cert" \
     -H "paypal-auth-algo: SHA256withRSA" \
     -d '{
       "event_type": "CHECKOUT.ORDER.APPROVED",
       "resource": {
         "id": "test-order-123",
         "custom_id": "test-user-id",
         "purchase_units": [{
           "custom_id": "test-user-id",
           "amount": {"value": "9.99", "currency_code": "USD"}
         }]
       }
     }'
   ```

3. **检查数据库**
   ```sql
   -- 查看最近的 payments 记录
   SELECT * FROM payments
   WHERE user_id = 'test-user-id'
   ORDER BY created_at DESC LIMIT 5;

   -- 检查 transaction_id 格式
   SELECT DISTINCT transaction_id FROM payments
   WHERE transaction_id LIKE '%I-%' OR transaction_id LIKE '%2V%'
   LIMIT 10;
   ```

## 总结

| 项目 | 状态 | 优先级 |
|------|------|--------|
| 数据提取逻辑 | ⚠️ 可能不完整 | 高 |
| 支付记录查询 | ⚠️ 可能不匹配 | 高 |
| 日志信息 | ❌ 不足 | 中 |
| 错误处理 | ⚠️ 太简单 | 中 |

**立即行动**：
1. 添加更详细的日志以找出 webhook 失败的具体原因
2. 改进支付记录查询逻辑（支持多种 ID 格式）
3. 测试 webhook 处理边界情况
