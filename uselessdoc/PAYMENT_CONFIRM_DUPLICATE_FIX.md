# 支付确认重复订单修复

## 问题描述

用户完成 PayPal 支付后，账单历史中会出现两条记录：

- 一条 "已支付"（completed）
- 一条 "待支付"（pending）

## 根本原因

在支付流程中，有两个地方都在插入支付记录：

1. **`/api/payment/create`** - 创建支付时插入 `pending` 状态记录
2. **`/api/payment/confirm`** - 用户返回后**再次插入** `completed` 状态记录

这导致数据库中有两条记录：

- 第一条：pending（创建支付时）
- 第二条：completed（确认支付时）← **这是问题所在**

## 正确流程

应该是：

1. **创建支付** → 插入 `pending` 记录
2. **确认支付** → **更新** 现有记录为 `completed`，而不是插入新记录

## 修复方案

修改 `/api/payment/confirm/route.ts`：

### 之前的错误逻辑

```typescript
// 直接插入新记录 ❌
await supabaseAdmin.from("payments").insert({
  user_id: userId,
  subscription_id: subscription.id,
  amount: confirmation.amount,
  currency: confirmation.currency,
  status: "completed",
  payment_method: paymentMethod,
  transaction_id: confirmation.transactionId,
});
```

### 修复后的正确逻辑

```typescript
// 1. 先查找是否有现有的支付记录
const { data: existingPayment } = await supabaseAdmin
  .from("payments")
  .select("id, status")
  .eq("user_id", userId)
  .in("status", ["pending", "completed"])
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (existingPayment && existingPayment.status === "pending") {
  // 2. 更新现有记录 ✅
  await supabaseAdmin
    .from("payments")
    .update({
      status: "completed",
      transaction_id: confirmation.transactionId,
      amount: confirmation.amount,
      currency: confirmation.currency,
    })
    .eq("id", existingPayment.id);
} else if (!existingPayment) {
  // 3. 只在没有记录时才插入（兜底）
  await supabaseAdmin.from("payments").insert({...});
}
```

## 测试步骤

1. 清理现有的重复记录：

   ```bash
   npx tsx scripts/cleanup-duplicate-payment-records.ts --execute
   ```

2. 测试新的支付流程：
   - 点击订阅按钮 → 创建 pending 记录
   - 完成 PayPal 支付 → 更新为 completed
   - 检查账单历史 → 应该只有一条记录

## 预期结果

修复后：

- ✅ 每次支付只有**一条**记录
- ✅ 状态从 `pending` → `completed`
- ✅ 账单历史显示正确
- ✅ 即使 webhook 和用户确认同时到达，也不会重复

## 部署状态

- ✅ 代码已修复
- ✅ 构建成功
- ✅ 已部署到生产环境
- 🔗 https://mvp-24-main-6ibatmhoi-8086k-as-projects.vercel.app

---

修复日期：2025 年 11 月 1 日
