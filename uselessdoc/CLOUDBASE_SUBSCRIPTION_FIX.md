# CloudBase 订阅表更新修复

## 🔴 发现的问题

支付宝支付成功后，CloudBase 中的 `subscriptions` 集合**没有被创建或更新**，导致订阅记录不存在。

### 问题代码

原来的代码只更新了用户表和支付表，**缺少订阅表的更新**：

```typescript
// ❌ 原代码只做了这两件事
1. 更新 web_users (pro: true)
2. 创建/更新 payments

// ❌ 没做这件事
// 创建/更新 subscriptions
```

---

## ✅ 应用的修复

已在 `lib/payment/webhook-handler.ts` 的 `updateSubscriptionStatusCloudBase` 方法中添加**订阅表的创建/更新逻辑**。

### 修复内容

在更新用户表后，添加以下代码：

```typescript
// 创建或更新订阅记录（如果状态为active）
if (status === "active") {
  logInfo("Creating/updating subscription in CloudBase", {
    operationId,
    userId,
    subscriptionId,
    provider,
  });

  // 检查是否已有活跃订阅
  const existingSubQuery = await db
    .collection("subscriptions")
    .where({
      user_id: userId,
      status: "active",
    })
    .limit(1)
    .get();

  const now_iso = now.toISOString();
  const current_period_end = new Date(
    now.getTime() + 30 * 24 * 60 * 60 * 1000
  ).toISOString(); // 30天后

  if (existingSubQuery.data && existingSubQuery.data.length > 0) {
    // 更新现有订阅
    const existingSubscription = existingSubQuery.data[0];
    await db.collection("subscriptions").doc(existingSubscription._id).update({
      status,
      provider_subscription_id: subscriptionId,
      provider,
      updated_at: now_iso,
    });
  } else {
    // 创建新订阅
    const subscriptionData = {
      user_id: userId,
      plan_id: "pro", // 默认使用pro计划
      status,
      provider_subscription_id: subscriptionId,
      provider,
      current_period_start: now_iso,
      current_period_end,
      created_at: now_iso,
      updated_at: now_iso,
    };

    await db.collection("subscriptions").add(subscriptionData);
  }
}
```

---

## 📊 现在的完整流程

```
支付成功 (TRADE_SUCCESS)
    ↓
handleAlipayEvent()
    ↓
handlePaymentSuccess()
    ↓
updateSubscriptionStatus()
    ↓
isChinaRegion() = true → updateSubscriptionStatusCloudBase()
    ↓
1️⃣ 更新 web_users
   pro: true
   subscription_id: "xxx"
   subscription_provider: "alipay"
   ✅ 已存在
    ↓
2️⃣ 创建/更新 subscriptions (✅ 新增)
   user_id: "user_123"
   plan_id: "pro"
   status: "active"
   provider_subscription_id: "xxx"
   provider: "alipay"
   current_period_start: "2024-11-08T..."
   current_period_end: "2024-12-08T..." (30天后)
   ✅ 现在会被创建！
    ↓
3️⃣ 创建/更新 payments
   user_id: "user_123"
   subscription_id: "xxx"
   amount: 30
   currency: "CNY"
   status: "completed"
   payment_method: "alipay"
   transaction_id: "xxx"
   ✅ 已存在
    ↓
订阅状态更新完成！
```

---

## 🧪 验证修复

支付成功后，检查 CloudBase：

### 1. 检查用户表

```javascript
db.collection("web_users")
  .doc("user_123")
  .get()
  .then((res) => {
    console.log(res.data);
    // 应该看到：
    // {
    //   pro: true,  ✅
    //   subscription_id: "xxx",
    //   subscription_provider: "alipay"
    // }
  });
```

### 2. 检查订阅表 ✅ 现在会有数据了

```javascript
db.collection("subscriptions")
  .where({
    user_id: "user_123",
    status: "active",
  })
  .get()
  .then((res) => {
    console.log(res.data);
    // 应该看到：
    // [{
    //   _id: "sub_xxx",
    //   user_id: "user_123",
    //   plan_id: "pro",
    //   status: "active",
    //   provider_subscription_id: "xxx",
    //   provider: "alipay",
    //   current_period_start: "2024-11-08T...",
    //   current_period_end: "2024-12-08T...",
    //   created_at: "2024-11-08T...",
    //   updated_at: "2024-11-08T..."
    // }]
  });
```

### 3. 检查支付表

```javascript
db.collection("payments")
  .where({
    user_id: "user_123",
    status: "completed",
  })
  .get()
  .then((res) => {
    console.log(res.data);
    // 应该看到支付记录
  });
```

---

## 📋 订阅表结构说明

`subscriptions` 集合应该包含以下字段：

| 字段                       | 类型      | 说明                                              |
| -------------------------- | --------- | ------------------------------------------------- |
| `_id`                      | String    | 文档 ID（自动生成）                               |
| `user_id`                  | String    | 用户 ID                                           |
| `plan_id`                  | String    | 计划 ID（通常是 "pro"）                           |
| `status`                   | String    | 订阅状态（"active", "cancelled", "suspended" 等） |
| `provider_subscription_id` | String    | 支付商的订阅 ID（支付宝订单号）                   |
| `provider`                 | String    | 支付商（"alipay", "paypal", "stripe", "wechat"）  |
| `current_period_start`     | Timestamp | 订阅周期开始时间                                  |
| `current_period_end`       | Timestamp | 订阅周期结束时间                                  |
| `created_at`               | Timestamp | 创建时间                                          |
| `updated_at`               | Timestamp | 更新时间                                          |

---

## 🚀 后续测试

完成代码修改后：

1. ✅ 重启应用
2. ✅ 测试支付宝支付流程
3. ✅ 支付成功后检查 CloudBase 数据
4. ✅ 验证 subscriptions 集合中是否有数据

---

## 📝 如果仍有问题

### 检查清单

- [ ] CloudBase 中 `subscriptions` 集合是否存在？
- [ ] 集合中是否有对应的字段？
- [ ] 支付后是否有错误日志？
- [ ] 检查日志中 `Creating new subscription` 或 `Updating existing subscription` 的日志？

### 常见错误

**❌ 错误 1：集合不存在**

```
Error: Collection "subscriptions" does not exist
```

**解决**：在 CloudBase 控制台创建 subscriptions 集合

**❌ 错误 2：字段类型不匹配**

```
Error: Field "status" expects String, got Object
```

**解决**：确保所有字段都是正确的数据类型

**❌ 错误 3：权限问题**

```
Error: Permission denied
```

**解决**：检查 CloudBase 的数据库权限设置

---

## 📞 需要帮助？

如果修复后仍有问题，请提供：

1. ✅ 支付成功后的完整日志
2. ✅ CloudBase 中的错误信息
3. ✅ subscriptions 集合的结构定义
4. ✅ 用户在 web_users 中的数据
