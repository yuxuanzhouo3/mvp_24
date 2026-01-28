# 国际版（Supabase）订阅架构说明

## 数据库设计

由于 `user_profiles` 表已被删除，订阅相关信息现在完全存储在以下表中：

### 核心表结构

```sql
-- subscriptions 表（核心）
- id: UUID (主键)
- user_id: UUID (来自 Supabase auth.users)
- plan_id: TEXT (pro/team)
- status: TEXT (active/canceled/past_due/unpaid)
- current_period_start: TIMESTAMP (订阅开始时间)
- current_period_end: TIMESTAMP ⭐ 订阅过期时间（关键字段）
- provider: TEXT (paypal/stripe/alipay/wechat)
- provider_subscription_id: TEXT (支付提供商的订阅ID)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP

-- payments 表（辅助）
- id: UUID (主键)
- user_id: UUID
- subscription_id: UUID (外键关联subscriptions)
- amount: DECIMAL
- currency: TEXT
- status: TEXT (pending/completed/failed/refunded)
- payment_method: TEXT
- transaction_id: TEXT (用于webhook匹配)
- metadata: JSONB (可选，存储计费周期等信息)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

## 支付流程

### 1. 直接支付确认 API (`/api/payment/confirm`)
当用户在前端确认支付时：

```
用户 → confirm API → 验证支付 → 更新 subscriptions 表
                     ↓
              current_period_end = now + 30/365 days
```

**关键更新逻辑：**
```typescript
// confirm/route.ts
const currentPeriodEnd = new Date(now);
if (billingCycle === "yearly") {
  currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
} else {
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
}

// 更新subscriptions表
await supabaseAdmin
  .from("subscriptions")
  .update({
    current_period_end: currentPeriodEnd.toISOString(),
    // ... 其他字段
  })
```

### 2. Webhook 处理 (`/api/payment/webhook/*`)
当支付提供商（PayPal、Stripe等）发送webhook时：

```
PayPal/Stripe Webhook → 验证签名 → WebhookHandler.processWebhook()
                          ↓
                  updateSubscriptionStatusSupabase()
                          ↓
                    更新 subscriptions 表
                  + 更新 payments 表
```

**webhook中的更新逻辑：**
```typescript
// webhook-handler.ts - updateSubscriptionStatusSupabase()
const daysToAdd = days || 30; // 从payments.metadata中读取
const currentPeriodEnd = new Date(
  now.getTime() + daysToAdd * 24 * 60 * 60 * 1000
).toISOString();

await supabaseAdmin
  .from("subscriptions")
  .update({
    status: "active",
    current_period_end: currentPeriodEnd,
    provider_subscription_id: subscriptionId,
    updated_at: now.toISOString(),
  })
  .eq("id", existingSubscription.id);
```

## 获取用户订阅信息

前端应该直接查询 `subscriptions` 表，而不是 `user_profiles`：

```typescript
// ✅ 正确的做法
const { data: subscription } = await supabase
  .from("subscriptions")
  .select("*")
  .eq("user_id", userId)
  .eq("status", "active")
  .maybeSingle();

// 检查订阅是否过期
const isExpired = new Date() > new Date(subscription.current_period_end);

// ❌ 错误的做法（user_profiles 表已删除）
// const { data: profile } = await supabase.from("user_profiles")...
```

## 数据一致性保证

### 防止重复支付
1. **confirm API** - 通过 `existingSubscription` 检查是否已有活跃订阅
2. **webhook** - 通过 deduplication 机制（EventId）防止重复处理
3. **payments表** - 通过 `transaction_id` 和 `status` 检查重复

### 订阅延期逻辑
- **定期支付（Stripe）** - 覆盖 `current_period_end`
- **一次性支付（支付宝、微信、PayPal）** - 从现有期限延长（如果未过期）

```typescript
if (provider === "paypal" && existingEnd > now) {
  // 从现有期限延长
  newPeriodEnd = new Date(
    existingEnd.getTime() + daysNum * 24 * 60 * 60 * 1000
  ).toISOString();
} else {
  // 从现在开始重新计算
  newPeriodEnd = new Date(
    now.getTime() + daysNum * 24 * 60 * 60 * 1000
  ).toISOString();
}
```

## 迁移历史

| 迁移文件 | 变更 |
|---------|------|
| 20241201000000 | 初始schema（包含user_profiles） |
| 20251030000000 | 尝试添加subscription_expires_at到user_profiles |
| 20251119000001 | 删除user_profiles表 |
| 后续修改 | 改为直接使用subscriptions.current_period_end |

## 关键注意事项

1. ⚠️ **user_profiles 表已不存在** - 所有用户信息应从auth.users和subscriptions表获取
2. ✅ **subscriptions.current_period_end** 是订阅过期时间的唯一来源
3. ✅ **payments.metadata.days** 包含此次支付增加的天数（用于webhook处理）
4. ✅ **provider_subscription_id** 存储来自支付提供商的订阅ID，用于webhook匹配

## 故障排查

### 问题：支付后订阅时间没有增加

**可能原因：**
1. ❌ 试图更新已删除的 user_profiles 表
2. ❌ subscriptions 表的 current_period_end 没有更新
3. ❌ payments.metadata 中缺少 days 信息

**解决：**
- 确保更新逻辑针对的是 subscriptions 表
- 检查 payments.metadata 是否包含 days 字段
- 查看 webhook-handler.ts 中的日志

### 问题：webhook 重复处理订阅

**解决：**
- 检查 webhook_events 表中是否已有相同 eventId 的记录
- 查看 deduplication 逻辑是否正确识别 eventId
