# CloudBase 订阅表更新 - 调试指南

## 🔍 问题诊断步骤

subscriptions 集合没有数据，可能原因有：

1. ❌ 条件 `status === "active"` 不满足
2. ❌ CloudBase 查询出错
3. ❌ add() 或 update() 操作失败
4. ❌ 异常被捕获但没有显示
5. ❌ 集合权限问题

---

## 📋 检查清单

### 步骤 1：检查支付成功日志

支付成功后，**立即查看服务器日志**，寻找以下关键日志：

```
[INFO] Creating/updating subscription in CloudBase
[INFO] No existing subscription found, creating new one
[INFO] Subscription data to insert
[INFO] Subscription created successfully
```

**如果看不到这些日志**，说明代码没有执行到这里。

### 步骤 2：检查是否到达了正确的代码分支

查找这条日志：

```
[INFO] Updating subscription status in CloudBase
```

**如果看不到这条日志**，说明：

- 支付成功回调没有被执行
- 或者 `isChinaRegion()` 返回 false

### 步骤 3：检查 status 变量的值

在日志中查找 `status` 的值：

```
[INFO] Updating subscription status in CloudBase
{
  operationId,
  userId,
  subscriptionId,
  status: "active",  ← 这里应该是 "active"
  provider,
}
```

**如果 `status` 不是 "active"**，那么 `if (status === "active")` 条件会不满足。

### 步骤 4：查看是否有错误日志

搜索这些错误日志：

```
[ERROR] Error creating new subscription in CloudBase
[ERROR] Error querying existing subscriptions in CloudBase
[ERROR] Error processing subscription update in CloudBase
[WARN] Subscription update failed but continuing
```

**如果有错误，那就是真正的问题所在**。

---

## 🛠️ 快速测试方法

### 方法 1：添加临时日志

在 webhook-handler.ts 的 `updateSubscriptionStatusCloudBase` 方法最后添加：

```typescript
logInfo("🔍 DEBUG: 支付处理完成", {
  operationId,
  userId,
  subscriptionId,
  status,
  provider,
  isChinaCheck: isChinaRegion(),
});
```

### 方法 2：手动测试 CloudBase 操作

在浏览器控制台测试 CloudBase 操作：

```javascript
// 测试添加数据
db.collection("subscriptions")
  .add({
    user_id: "test_user_123",
    plan_id: "pro",
    status: "active",
    provider_subscription_id: "test_order_123",
    provider: "alipay",
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    ).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  .then((res) => {
    console.log("✅ 插入成功:", res.id);
  })
  .catch((err) => {
    console.error("❌ 插入失败:", err);
  });
```

如果这个测试成功，说明 CloudBase 连接正常，问题在于代码逻辑。

### 方法 3：验证集合权限

在 CloudBase 控制台检查 `subscriptions` 集合的权限设置：

```
权限类型:
  - 创建: ✅ 允许所有用户 或 仅 Admin
  - 更新: ✅ 允许所有用户 或 仅 Admin
  - 查询: ✅ 允许所有用户 或 仅 Admin
```

---

## 📊 常见问题排查表

| 现象                                                | 可能原因                    | 检查方法                           |
| --------------------------------------------------- | --------------------------- | ---------------------------------- |
| 没看到任何日志                                      | 支付回调没执行              | 检查 webhook endpoint 是否收到请求 |
| 看到"Creating/updating"但没有"created successfully" | add() 失败                  | 查看错误日志                       |
| 看到错误日志但集合仍为空                            | 权限或数据格式问题          | 手动测试 add() 操作                |
| 看到"Subscription created"但集合为空                | CloudBase UI 延迟或查询错误 | 刷新页面或检查集合权限             |

---

## 🔧 可能的解决方案

### 解决方案 1：检查字段名拼写

确保字段名完全正确：

```typescript
// ✅ 正确
{
  user_id: userId,        // ← 是 user_id 不是 userId
  plan_id: "pro",         // ← 是 plan_id 不是 planId
  status: "active",
  provider_subscription_id: subscriptionId,  // ← 是下划线
  created_at: now_iso,
  updated_at: now_iso,
}
```

### 解决方案 2：检查数据类型

所有字段必须是正确的类型：

```typescript
{
  user_id: "string",                    // ✅ 字符串
  plan_id: "string",                    // ✅ 字符串
  status: "string",                     // ✅ 字符串
  provider_subscription_id: "string",   // ✅ 字符串
  current_period_start: "timestamp",    // ✅ ISO字符串或Date对象
  current_period_end: "timestamp",      // ✅ ISO字符串或Date对象
}
```

### 解决方案 3：使用 serverDate

如果 CloudBase 不接受 ISO 字符串，改用 serverDate：

```typescript
import { serverDate } from "tcb-js-sdk";

const subscriptionData = {
  user_id: userId,
  plan_id: "pro",
  status: "active",
  provider_subscription_id: subscriptionId,
  provider,
  current_period_start: serverDate(), // CloudBase 自动设置服务器时间
  current_period_end: serverDate(),
  created_at: serverDate(),
  updated_at: serverDate(),
};
```

### 解决方案 4：检查 CloudBase 数据库连接

在 `updateSubscriptionStatusCloudBase` 开头添加：

```typescript
try {
  // 测试数据库连接
  const testQuery = await db.collection("subscriptions").limit(1).get();

  logInfo("CloudBase connection test", {
    operationId,
    connected: true,
    testDataCount: testQuery.data ? testQuery.data.length : 0,
  });
} catch (testError) {
  logError("CloudBase connection test failed", testError as Error, {
    operationId,
  });
  return false;
}
```

---

## 📝 调试日志示例

### ✅ 成功的情况下应该看到：

```
[INFO] Updating subscription status in CloudBase
{
  operationId: "sub_update_xxx",
  userId: "user_123",
  subscriptionId: "2024xxx",
  status: "active",
  provider: "alipay"
}

[INFO] User profile found in CloudBase
{
  operationId: "sub_update_xxx",
  userId: "user_123",
  currentPro: false
}

[BUSINESS] cloudbase_user_profile_updated
{
  operationId: "sub_update_xxx",
  subscriptionId: "2024xxx",
  status: "active",
  provider: "alipay",
  pro: true
}

[INFO] Creating/updating subscription in CloudBase
{
  operationId: "sub_update_xxx",
  userId: "user_123",
  subscriptionId: "2024xxx",
  provider: "alipay"
}

[INFO] No existing subscription found, creating new one
{
  operationId: "sub_update_xxx",
  userId: "user_123",
  subscriptionId: "2024xxx",
  provider: "alipay"
}

[INFO] Subscription data to insert
{
  operationId: "sub_update_xxx",
  data: {
    user_id: "user_123",
    plan_id: "pro",
    status: "active",
    provider_subscription_id: "2024xxx",
    provider: "alipay",
    current_period_start: "2024-11-08T...",
    current_period_end: "2024-12-08T...",
    created_at: "2024-11-08T...",
    updated_at: "2024-11-08T..."
  }
}

[INFO] Subscription created successfully
{
  operationId: "sub_update_xxx",
  subscriptionId: "sub_abc123",  // ← 新创建的订阅ID
  insertedData: {...}
}

[BUSINESS] cloudbase_subscription_created
{
  operationId: "sub_update_xxx",
  subscriptionId: "sub_abc123",
  planId: "pro",
  provider: "alipay"
}
```

### ❌ 如果看到错误：

```
[ERROR] Error creating new subscription in CloudBase
{
  operationId: "sub_update_xxx",
  userId: "user_123",
  subscriptionId: "2024xxx",
  attemptedData: {...},
  error: "Collection subscriptions does not exist"  ← 真正的错误信息
}
```

---

## 💡 下一步

1. ✅ 重启应用
2. ✅ 再次进行支付测试
3. ✅ **立即检查日志**（不要等）
4. ✅ 将完整的日志输出告诉我
5. ✅ 特别注意错误日志 `[ERROR]` 和 `[WARN]`

---

## 📞 需要我帮助？

如果还是没有数据，请提供：

1. ✅ **完整的日志输出**（从支付开始到结束）
2. ✅ **任何 [ERROR] 或 [WARN] 日志**
3. ✅ **CloudBase 控制台中 subscriptions 集合的结构**
4. ✅ **CloudBase 权限设置的截图**
