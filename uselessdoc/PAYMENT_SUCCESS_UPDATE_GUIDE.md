# 支付成功后更新用户订阅状态完整指南

## 📋 概览

当用户支付宝支付成功后，系统需要更新用户的订阅状态。这个过程涉及以下几个关键步骤：

```
用户支付 → 支付宝回调 → 签名验证 → Webhook处理 → 更新用户状态
```

---

## 🔄 完整流程

### 1️⃣ **支付创建阶段** (`/api/payment/onetime/create`)

用户选择套餐并发起支付：

```typescript
// 创建支付
const result = await provider.createPayment({
  amount: 30, // 金额
  currency: "CNY",
  description: "专业版 - 月付",
  userId: user.id,
});

// 返回支付链接给前端
// 支付宝返回 HTML 表单
```

**此阶段会创建 `pending` 状态的支付记录：**

| 字段             | 值        | 说明     |
| ---------------- | --------- | -------- |
| `status`         | `pending` | 等待支付 |
| `payment_method` | `alipay`  | 支付方式 |
| `user_id`        | `xxx`     | 用户 ID  |
| `amount`         | `30`      | 支付金额 |
| `currency`       | `CNY`     | 货币类型 |

---

### 2️⃣ **支付宝回调阶段** (`/api/payment/webhook/alipay`)

支付宝在用户完成支付后，会向你的服务器发送异步通知：

```typescript
// 支付宝POST请求到这个endpoint
POST / api / payment / webhook / alipay;
// 参数包含：
// - out_trade_no: 订单号
// - trade_no: 支付宝交易号
// - trade_status: 交易状态 (TRADE_SUCCESS/TRADE_FINISHED)
// - total_amount: 支付金额
// - sign: 签名
```

**关键步骤：**

```typescript
// 1. 收集参数
const params: Record<string, string> = {};
searchParams.forEach((value, key) => {
  params[key] = value;
});

// 2. 验证签名
const isValidSignature = verifyAlipaySignature(
  params,
  process.env.ALIPAY_ALIPAY_PUBLIC_KEY
);

if (!isValidSignature) {
  return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
}

// 3. 检查支付状态
const tradeStatus = params.trade_status;
if (tradeStatus !== "TRADE_SUCCESS" && tradeStatus !== "TRADE_FINISHED") {
  return NextResponse.json({ status: "ignored" });
}

// 4. 处理webhook事件
const webhookHandler = WebhookHandler.getInstance();
const success = await webhookHandler.processWebhook(
  "alipay",
  tradeStatus,
  params
);
```

---

### 3️⃣ **Webhook 处理阶段** (`WebhookHandler.processWebhook`)

这是**最关键的步骤**，负责更新用户订阅状态：

```typescript
// 1. 根据支付宝提供商提取数据
const subscriptionId = data.out_trade_no; // 订单号
const userId = data.passback_params?.userId; // 用户ID
const amount = parseFloat(data.total_amount);
const currency = "CNY";

// 2. 更新或创建订阅
const success = await this.updateSubscriptionStatus(
  userId, // 用户ID
  subscriptionId, // 订单号
  "active", // 订阅状态
  "alipay", // 支付方式
  amount, // 金额
  currency // 货币
);
```

---

### 4️⃣ **更新用户状态** (`updateSubscriptionStatus`)

根据你的地区配置，使用不同的数据库更新：

#### **中国地区 - CloudBase 更新**

```typescript
const db = getDatabase(); // CloudBase实例

// 1. 更新用户pro状态
await db.collection("web_users").doc(userId).update({
  pro: true, // 激活专业版
  subscription_id: subscriptionId,
  subscription_provider: "alipay",
  updated_at: now.toISOString(),
});

// 2. 记录支付
await db.collection("payments").add({
  user_id: userId,
  subscription_id: subscriptionId,
  amount: amount,
  currency: currency,
  status: "completed", // 改为completed
  payment_method: "alipay",
  transaction_id: subscriptionId,
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
});
```

#### **国际地区 - Supabase 更新**

```typescript
// 1. 创建订阅记录
const { data: subscription } = await supabaseAdmin
  .from("subscriptions")
  .insert({
    user_id: userId,
    plan_id: "pro", // 计划类型
    status: "active",
    provider_subscription_id: subscriptionId,
    current_period_start: now.toISOString(),
    current_period_end: new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000
    ).toISOString(), // 30天后
  })
  .select()
  .single();

// 2. 更新用户资料
await supabaseAdmin
  .from("user_profiles")
  .update({
    subscription_plan: "pro",
    subscription_status: "active",
    updated_at: now.toISOString(),
  })
  .eq("id", userId);

// 3. 记录支付
await supabaseAdmin.from("payments").insert({
  user_id: userId,
  subscription_id: subscription.id,
  amount: amount,
  currency: currency,
  status: "completed",
  payment_method: "alipay",
  transaction_id: subscriptionId,
});
```

---

## 🎯 关键点总结

### ✅ **用户状态更新内容**

| 字段                  | 变化                    | 说明             |
| --------------------- | ----------------------- | ---------------- |
| `subscription_status` | `pending` → `active`    | 订阅状态变为激活 |
| `subscription_plan`   | `free` → `pro`          | 升级到专业版     |
| `pro` (CloudBase)     | `false` → `true`        | 专业版标记       |
| `payment.status`      | `pending` → `completed` | 支付标记为已完成 |

### ⚠️ **常见问题排查**

#### 问题 1：支付成功但用户状态没有更新

**原因排查：**

1. ❌ 签名验证失败 → 检查 `ALIPAY_ALIPAY_PUBLIC_KEY` 是否正确
2. ❌ userId 为空 → 创建支付时没有传递 userId
3. ❌ Webhook 未触发 → 检查支付宝回调地址配置
4. ❌ 数据库连接失败 → 检查 CloudBase/Supabase 配置

**解决方案：**

```typescript
// 在webhook中添加日志
console.log("Webhook data:", {
  out_trade_no: params.out_trade_no,
  userId: params.passback_params?.userId,
  trade_status: params.trade_status,
  total_amount: params.total_amount,
});

// 检查数据库操作结果
if (!success) {
  console.error("Failed to update subscription status");
  // 返回failure给支付宝
  return new NextResponse("failure");
}
```

#### 问题 2：重复记录支付

**原因：** Webhook 被调用多次

**解决方案：** 系统已实现幂等性检查：

```typescript
// 检查是否已处理过这个事件
const existingEvent = await this.getProcessedEvent(eventId);
if (existingEvent) {
  return true; // 已处理，直接返回成功
}

// 记录事件
await this.recordEvent(eventId, provider, eventType, eventData);
```

---

## 🔍 验证支付成功

支付成功后验证用户状态：

```typescript
// 中国地区 - CloudBase
const userProfile = await db
  .collection("web_users")
  .where({ _id: userId })
  .get();

console.log("User subscription status:", userProfile.data[0].pro); // 应为 true

// 国际地区 - Supabase
const { data: profile } = await supabaseAdmin
  .from("user_profiles")
  .select("subscription_plan, subscription_status")
  .eq("id", userId)
  .single();

console.log("Subscription:", profile.subscription_plan); // 应为 "pro"
console.log("Status:", profile.subscription_status); // 应为 "active"
```

---

## 📊 状态流转图

```
创建支付
    ↓
payment.status = "pending"
user.subscription_status = "free" (保持不变)
    ↓
用户支付 (支付宝完成)
    ↓
Webhook回调
    ↓
签名验证成功
    ↓
updateSubscriptionStatus()
    ↓
payment.status = "completed" ✓
subscription.status = "active"   ✓
user.subscription_plan = "pro"   ✓
    ↓
用户可以使用专业版功能
```

---

## 🚀 快速检查清单

- [ ] 支付宝的 notifyUrl 已正确配置：`${APP_URL}/api/payment/alipay/notify`
- [ ] 支付宝公钥 `ALIPAY_ALIPAY_PUBLIC_KEY` 已正确设置
- [ ] 创建支付时传递了 `userId` 参数
- [ ] Webhook 签名验证逻辑正确
- [ ] CloudBase/Supabase 数据库连接正常
- [ ] 用户表/集合有 `subscription_status` 或 `pro` 字段
- [ ] 支付表中有 `status` 字段用于跟踪支付状态
