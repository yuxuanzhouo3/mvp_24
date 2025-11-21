# PayPal Webhook 500 错误修复报告

## 问题总结

用户报告：PayPal webhook (PAYMENT.CAPTURE.COMPLETED) 返回 500 错误，导致：
- ❌ 支付记录已创建（transaction_id = Order ID）
- ❌ 订阅表（subscriptions）没有记录
- ❌ 用户会员时间未更新

## 根本原因分析

### 主要原因：支付记录查询失败

**场景**：
1. `/api/payment/onetime/create` 保存支付记录，使用 `transaction_id = Order ID`（例如：`20F91223YD296473M`）
2. PayPal webhook 发送 `PAYMENT.CAPTURE.COMPLETED` 事件，携带 Capture ID（例如：`4BW04676D8118933F`）
3. Webhook 处理尝试用 Capture ID 查询支付记录 → **失败**（因为 transaction_id 存储的是 Order ID，不是 Capture ID）
4. 由于无法找到支付记录，无法提取 `metadata.days` 字段
5. 虽然有备选逻辑根据金额推断天数，但后续订阅创建仍可能失败

### 次要原因：Order ID 提取不完整

PayPal PAYMENT.CAPTURE.COMPLETED webhook 的 Order ID 位置：
```json
{
  "id": "CAPTURE_ID",
  "supplementary_data": {
    "related_ids": {
      "order_id": "ORDER_ID"  // ← 需要的字段
    }
  }
}
```

但不同的 PayPal 事件格式可能不一致，导致 `supplementary_data.related_ids.order_id` 为空。

### 第三个原因：user_id 过滤过严

Strategy 2 (按 Order ID 查询) 会同时过滤 `user_id`，但如果 webhook 中提取的 userId 与支付记录中的 user_id 不匹配，会导致查询失败。

## 实施的修复

### 修复 1：改进 PayPal Order ID 提取

**位置**：`lib/payment/webhook-handler.ts` 第 478-492 行

```typescript
// ✅ 原来：只从一个位置提取
if (data.supplementary_data?.related_ids?.order_id) {
  paypalOrderId = data.supplementary_data.related_ids.order_id;
}

// ✅ 修复：多个位置提取，有备选方案
if (data.supplementary_data?.related_ids?.order_id) {
  paypalOrderId = data.supplementary_data.related_ids.order_id;
} else if (data.links && data.links.length > 0) {
  // 备选方案：从links中查找order_id
  const orderLink = data.links.find((l: any) =>
    l.rel === 'up' && (l.href?.includes('/orders/') || l.href?.includes('/checkouts/'))
  );
  if (orderLink?.href) {
    const match = orderLink.href.match(/\/orders\/([A-Z0-9]+)/);
    if (match?.[1]) {
      paypalOrderId = match[1];
    }
  }
}
```

**益处**：
- 支持多种 PayPal 事件数据格式
- 如果 supplementary_data 不完整，可从 links 中提取
- 更好的错误日志记录 (`paypalOrderId: "NOT_FOUND"`)

### 修复 2：改进支付记录查询策略 (Strategy 2)

**位置**：`lib/payment/webhook-handler.ts` 第 720-779 行

```typescript
// ✅ 原来：只尝试一次查询（带 user_id 过滤）
if (paypalOrderId && userId) {
  const { data: paymentData2 } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("transaction_id", paypalOrderId)
    .eq("user_id", userId)  // ❌ 过滤过严
    .maybeSingle();
}

// ✅ 修复：两阶段查询
// 第一步：用 user_id 过滤
if (userId) {
  const { data: result } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("transaction_id", paypalOrderId)
    .eq("user_id", userId)
    .maybeSingle();
  paymentData2 = result;
}

// 第二步：如果第一步失败，不带 user_id 再试一次
if (!paymentData2 && paypalOrderId) {
  const { data: result } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("transaction_id", paypalOrderId)
    .maybeSingle();
  paymentData2 = result;
}
```

**益处**：
- 如果 webhook 中提取的 userId 与支付记录中的 user_id 不匹配，仍能找到支付记录
- 有日志记录记录了来自何处查找到支付记录
- 更加鲁棒的查询策略

### 修复 3：添加关键安全检查

**位置**：`lib/payment/webhook-handler.ts` 第 2580-2594 行

```typescript
// ✅ 安全检查：如果状态是active但仍没有subscription，这是错误
if (status === "active" && !subscription) {
  logError(
    "Critical: Failed to create or update subscription in active status",
    new Error("Subscription is undefined after creation attempt"),
    {
      operationId,
      userId,
      subscriptionId,
      status,
      provider,
    }
  );
  return false;  // ← 返回 false，导致 webhook 返回 500，触发告警
}
```

**益处**：
- 防止订阅为空的情况下继续处理
- 有明确的错误日志，便于诊断
- 确保 webhook 在真正失败时返回 500

## 修复过程时间线

| 步骤 | 内容 | 状态 |
|------|------|------|
| 1 | 移除已删除的 user_profiles 表查询 | ✅ 完成 |
| 2 | 实现 4 层支付记录查询策略 | ✅ 完成 |
| 3 | 改进 PayPal Order ID 提取 | ✅ 完成 |
| 4 | 添加 Strategy 2 两阶段查询 | ✅ 完成 |
| 5 | 添加关键安全检查 | ✅ 完成 |

## 预期效果

### 修复后流程

```
1. PAYMENT.CAPTURE.COMPLETED webhook 到达
   ↓
2. 提取 Order ID （多个来源）
   ↓
3. 查询支付记录（4 层策略）
   ├─ Strategy 1: transaction_id == Capture ID → 可能失败
   ├─ Strategy 2: transaction_id == Order ID → ✅ 现在有两阶段查询
   ├─ Strategy 3: user + amount + time → 备选方案
   └─ Strategy 4: out_trade_no (Alipay)
   ↓
4. 从 metadata 读取 days，或根据金额推断
   ↓
5. 创建或更新订阅记录 ← 安全检查确保成功
   ↓
6. 更新支付记录状态为 completed
   ↓
7. 返回 200 成功
```

## 测试步骤

### 1. 验证日志输出

在 PayPal webhook 处理日志中，应该看到：

```
🔍 Querying Supabase for payment record (INTL mode)
  provider: "paypal"
  paypalOrderId: "20F91223YD296473M"  // ✅ 能提取
  subscriptionId: "4BW04676D8118933F"
  userId: "user-123"

Strategy 1: transaction_id not found, trying paypalOrderId
  paypalOrderId: "20F91223YD296473M"

✅ Strategy 2: Found PayPal payment using paypalOrderId
  paymentId: "payment-456"
  orderId: "20F91223YD296473M"
  metadata.days: 30

📝 Creating new subscription:
  userId: "user-123"
  daysToAdd: 30
  currentPeriodEnd: "2025-12-20T15:22:41.569Z"

✅ New subscription created in Supabase:
  subscriptionId: "sub-789"
  currentPeriodEnd: "2025-12-20T15:22:41.569Z"

✅ Supabase subscription status update completed
```

### 2. 验证数据库

```sql
-- 1. 检查支付记录是否存在
SELECT * FROM payments
WHERE transaction_id = '20F91223YD296473M'
ORDER BY created_at DESC
LIMIT 1;

-- 2. 检查订阅记录是否创建
SELECT * FROM subscriptions
WHERE user_id = 'user-123'
ORDER BY created_at DESC
LIMIT 1;

-- 3. 验证时间是否正确（应该在 30-31 天内）
SELECT
  EXTRACT(DAY FROM (current_period_end - NOW())) as days_remaining,
  current_period_end,
  status
FROM subscriptions
WHERE user_id = 'user-123'
ORDER BY created_at DESC
LIMIT 1;
```

### 3. 端到端测试

```bash
# 模拟 PAYMENT.CAPTURE.COMPLETED webhook
curl -X POST https://your-domain.com/api/payment/webhook/paypal \
  -H "Content-Type: application/json" \
  -H "paypal-transmission-sig: test-sig" \
  -H "paypal-transmission-id: test-123" \
  -H "paypal-transmission-time: 2025-11-20T15:22:40Z" \
  -H "paypal-cert-url: https://api.sandbox.paypal.com/cert" \
  -H "paypal-auth-algo: SHA256withRSA" \
  -d '{
    "event_type": "PAYMENT.CAPTURE.COMPLETED",
    "resource": {
      "id": "4BW04676D8118933F",
      "status": "COMPLETED",
      "amount": {
        "value": "9.99",
        "currency_code": "USD"
      },
      "supplementary_data": {
        "related_ids": {
          "order_id": "20F91223YD296473M"
        }
      },
      "custom_id": "user-123"
    }
  }'

# 预期返回：200 OK
# 预期日志：subscription created successfully
```

## 关键改进总结

| 方面 | 改进前 | 改进后 |
|------|--------|--------|
| Order ID 提取 | 单一来源 | 多个来源 + 备选方案 |
| 支付记录查询 | 3 层策略 | 4 层策略 + 两阶段查询 |
| 错误诊断 | 泛泛的错误日志 | 详细的分层日志和标记 |
| 安全性 | 无检查 | 订阅创建完整性检查 |
| user_id 匹配 | 严格过滤 | 灵活匹配 + 备选方案 |

## 后续建议

### 短期（立即）
1. ✅ 部署修复代码
2. ✅ 监控 webhook 日志，确认是否仍有 500 错误
3. ✅ 验证新支付是否正确创建订阅记录

### 中期（本周）
1. 📊 检查历史数据：是否有支付记录但无对应订阅的情况
   ```sql
   SELECT COUNT(*) FROM payments p
   WHERE status = 'completed'
     AND NOT EXISTS (
       SELECT 1 FROM subscriptions s
       WHERE s.user_id = p.user_id
         AND s.provider_subscription_id = p.transaction_id
     );
   ```

2. 🔧 对于历史数据，可以运行补偿脚本：
   ```sql
   -- 找出没有订阅的已完成支付
   SELECT p.*, NULL as subscription
   FROM payments p
   WHERE p.status = 'completed'
     AND p.provider = 'paypal'
     AND NOT EXISTS (
       SELECT 1 FROM subscriptions s
       WHERE s.user_id = p.user_id
     );

   -- 为这些支付创建订阅记录
   ```

### 长期（1-2 周）
1. 📈 添加 webhook 处理监控和告警
2. 🧪 添加单元测试，覆盖所有查询策略
3. 📝 更新文档，说明 webhook 处理流程

## 文件修改汇总

### `lib/payment/webhook-handler.ts`

| 行号范围 | 修改内容 | 影响 |
|---------|---------|------|
| 478-492 | 改进 PayPal Order ID 提取 | 更好的 Order ID 识别 |
| 720-779 | 改进 Strategy 2 查询 | 更好的支付记录查找 |
| 2580-2594 | 添加安全检查 | 更早发现错误 |

## 总结

本修复针对 PayPal webhook 500 错误问题，从三个方面进行改进：

1. **信息提取**: 更鲁棒的 Order ID 提取，支持多种数据格式
2. **数据查询**: 更灵活的支付记录查询，即使 user_id 不匹配也能找到
3. **错误检测**: 更早发现问题，提供清晰的错误信息

这些修复应该能够：
- ✅ 解决大多数现有 webhook 500 错误
- ✅ 提高 webhook 处理的鲁棒性
- ✅ 改进错误诊断和日志记录
