# 支付宝支付流程验证指南

## 📋 快速检查清单

支付成功后，按以下步骤验证用户状态是否正确更新：

---

## 1️⃣ 检查 Webhook 日志

### 支付成功后应该看到的日志信息：

```
[INFO] Processing webhook: alipay TRADE_SUCCESS
[INFO] Webhook data:
  outTradeNo: "2024xxx"
  userId: "user_abc123"  ✅ 关键：userId应该被正确提取
  amount: 30
  currency: "CNY"

[INFO] Updating subscription status in CloudBase/Supabase
  userId: "user_abc123"
  subscriptionId: "2024xxx"
  status: "active"
  provider: "alipay"

[BUSINESS] payment_success_processed
  userId: "user_abc123"
  provider: "alipay"
  subscriptionId: "2024xxx"
  amount: 30
  currency: "CNY"
```

**如果日志中 userId 为空，说明 passback_params 没有被正确传递**

---

## 2️⃣ 检查用户数据库状态

### CloudBase（中国地区）

```javascript
// 在支付成功后运行
const db = cloudbase.database();
db.collection("web_users")
  .where({
    _id: "user_abc123", // 用实际的userId替换
  })
  .get()
  .then((res) => {
    console.log("用户数据：", res.data[0]);
    // 应该看到：
    // {
    //   _id: "user_abc123",
    //   pro: true,  ✅ 应该为 true
    //   subscription_id: "2024xxx",
    //   subscription_provider: "alipay",
    //   updated_at: "2024-11-08T..."
    // }
  });
```

### Supabase（国际地区）

```sql
-- 检查用户资料
SELECT id, subscription_plan, subscription_status, updated_at
FROM user_profiles
WHERE id = 'user_abc123';
-- 应该看到：
-- id | subscription_plan | subscription_status | updated_at
-- user_abc123 | pro | active | 2024-11-08...

-- 检查订阅记录
SELECT id, user_id, plan_id, status, provider_subscription_id, created_at
FROM subscriptions
WHERE user_id = 'user_abc123'
ORDER BY created_at DESC
LIMIT 1;
-- 应该看到：
-- id | user_id | plan_id | status | provider_subscription_id | created_at
-- sub_xxx | user_abc123 | pro | active | 2024xxx | 2024-11-08...

-- 检查支付记录
SELECT id, user_id, subscription_id, amount, currency, status, payment_method, transaction_id, created_at
FROM payments
WHERE user_id = 'user_abc123'
ORDER BY created_at DESC
LIMIT 1;
-- 应该看到：
-- id | user_id | subscription_id | amount | currency | status | payment_method | transaction_id | created_at
-- pay_xxx | user_abc123 | sub_xxx | 30 | CNY | completed | alipay | 2024xxx | 2024-11-08...
```

---

## 3️⃣ 完整的测试场景

### 🧪 测试场景 1：完整支付流程

#### 步骤 1：发起支付

```bash
# 调用支付创建API
POST /api/payment/onetime/create
Authorization: Bearer <user_token>
Content-Type: application/json

{
  "method": "alipay",
  "billingCycle": "monthly"
}
```

**应该返回：**

```json
{
  "success": true,
  "paymentId": "2024xxx",
  "paymentUrl": "<form>...</form>", // HTML表单
  "currency": "CNY",
  "amount": 30
}
```

#### 步骤 2：查看创建的支付记录

应该在数据库中看到 `status = "pending"` 的支付记录：

```sql
SELECT * FROM payments WHERE transaction_id = '2024xxx';
-- 应该看到 status: "pending"
```

#### 步骤 3：完成支付

使用支付宝沙箱环境完成支付，或者在生产环境中实际支付。

#### 步骤 4：检查支付是否被更新为 completed

```sql
SELECT status FROM payments WHERE transaction_id = '2024xxx';
-- 应该看到 status: "completed"
```

#### 步骤 5：检查用户订阅状态

```sql
-- CloudBase
db.collection("web_users").doc("user_abc123").get();
// 应该看到 pro: true

-- Supabase
SELECT subscription_plan FROM user_profiles WHERE id = 'user_abc123';
// 应该看到 subscription_plan: "pro"
```

---

### 🧪 测试场景 2：验证 passback_params 被正确传递

#### 模拟支付宝回调（用于测试）

```bash
# 发送测试webhook
POST /api/payment/webhook/alipay?
  out_trade_no=test_2024_001
  trade_no=2024001
  trade_status=TRADE_SUCCESS
  total_amount=30.00
  passback_params=user_abc123
  sign=<计算的签名>
  sign_type=RSA2
```

**检查服务器日志：**

```
[INFO] Webhook data:
  outTradeNo: "test_2024_001"
  userId: "user_abc123"  ✅ 应该能看到userId
  amount: 30
  currency: "CNY"
```

---

## 4️⃣ 常见测试问题

### ❌ 问题 1：userId 为空

**检查点：**

1. 支付创建时是否传递了 userId

   ```typescript
   // 在 /api/payment/onetime/create 中应该看到
   order = {
     userId: user.id,  // ✅ userId应该存在
     amount: 30,
     ...
   }
   ```

2. AlipayProvider 中是否添加了 passback_params

   ```typescript
   // 在 buildAlipayOrder 中应该看到
   bizContent = {
     ...
     passback_params: order.userId || "",  // ✅ 应该被设置
   }
   ```

3. Webhook 中是否正确提取 passback_params
   ```typescript
   // 在 webhook-handler.ts 中应该看到
   userId = data.passback_params || ""; // ✅ 应该能正确读取
   ```

### ❌ 问题 2：订阅状态没有更新

**检查点：**

1. 数据库连接是否正常
2. 用户 ID 是否正确
3. 检查错误日志
   ```
   [ERROR] Error updating subscription status
   [ERROR] Failed to update user profile
   ```

### ❌ 问题 3：重复记录支付

这是正常的，系统已经有幂等性检查。同一个 transaction_id 不会被重复处理。

---

## 📊 状态转换验证表

| 步骤     | 检查点                            | 状态前    | 状态后      | 备注         |
| -------- | --------------------------------- | --------- | ----------- | ------------ |
| 支付创建 | payments.status                   | -         | `pending`   | 支付还未完成 |
| 支付创建 | user_profiles.subscription_plan   | `free`    | `free`      | 用户状态不变 |
| 支付完成 | payments.status                   | `pending` | `completed` | ✅ 关键      |
| 支付完成 | subscriptions.status              | -         | `active`    | 创建新订阅   |
| 支付完成 | user_profiles.subscription_plan   | `free`    | `pro`       | ✅ 关键      |
| 支付完成 | user_profiles.subscription_status | `free`    | `active`    | ✅ 关键      |

---

## 🔍 深度调试指南

### 如果支付后状态没有更新，按以下顺序检查：

#### 1. 检查 Webhook 是否被调用

```typescript
// 在 webhook-handler.ts 的 processWebhook 方法开头添加日志
logInfo(`🔔 Webhook received from ${provider}`, {
  provider,
  eventType,
  eventData,
  timestamp: new Date().toISOString(),
});
```

**查看服务器日志，应该看到这条日志**

#### 2. 检查签名验证是否通过

```typescript
// 在 /api/payment/webhook/alipay 中检查签名验证
if (!isValidSignature) {
  console.error("❌ 签名验证失败！", {
    params,
    publicKey: process.env.ALIPAY_ALIPAY_PUBLIC_KEY?.substring(0, 50),
  });
  return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
}
console.log("✅ 签名验证通过");
```

#### 3. 检查数据提取是否正确

```typescript
// 在 handleAlipayEvent 中检查
console.log("🔍 Extracted data:", {
  subscriptionId,
  userId,
  amount,
  currency,
});

if (!userId || !subscriptionId) {
  console.error("❌ 缺少关键参数！", {
    hasUserId: !!userId,
    hasSubscriptionId: !!subscriptionId,
    rawData: data,
  });
}
```

#### 4. 检查数据库操作是否成功

```typescript
// 在 updateSubscriptionStatus 中检查
logInfo("📝 Starting subscription status update", {
  userId,
  subscriptionId,
  status,
  provider,
  region: isChinaRegion() ? "CloudBase" : "Supabase",
});

// 操作后
if (success) {
  logInfo("✅ Subscription status updated successfully", {...});
} else {
  logError("❌ Failed to update subscription status", {...});
}
```

---

## 📞 需要支持？

如果按照上述步骤检查后仍有问题，请提供：

1. ✅ 完整的 Webhook 日志（包含 timestamp）
2. ✅ 数据库中的支付记录
3. ✅ 用户的订阅状态
4. ✅ 环境配置（中国/国际）
5. ✅ 错误信息

这样可以更快定位问题！
