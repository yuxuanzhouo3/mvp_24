# 会员到期时间异常诊断报告

## 问题描述

显示 **会员到期时间：2029年4月9日**

这说明用户的订阅 `current_period_end` 被设置为了 2029 年，可能的原因：

1. 支付时计算年份时出错
2. 数据库中有异常数据
3. 时间戳计算逻辑错误

## 数据获取流程

### 国际版 (INTL) - Supabase

**文件**: `app/api/profile/route.ts` 第 146-163 行

```typescript
// 国际版获取会员到期时间的流程
let membershipExpiresAt = user.user_metadata?.membership_expires_at; // 优先从用户元数据获取

try {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: subscriptions, error: subError } = await supabaseAdmin
    .from("subscriptions")
    .select("current_period_end")
    .eq("user_id", userId)
    .eq("status", "active")
    .single();  // ❌ 潜在问题：如果有多条 active 记录会出错

  if (!subError && subscriptions?.current_period_end) {
    membershipExpiresAt = subscriptions.current_period_end;  // ← 这个值来自 subscriptions 表
  }
} catch (error) {
  // 读取失败，使用用户元数据中的值
}
```

## 时间设置来源

### 1. `/api/payment/confirm` 确认支付时

**文件**: `app/api/payment/confirm/route.ts` 第 102-107 行

```typescript
const currentPeriodEnd = new Date(now);
if (billingCycle === "yearly") {
  currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
} else {
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
}

// 更新到数据库
await supabaseAdmin
  .from("subscriptions")
  .update({
    current_period_end: currentPeriodEnd.toISOString(),
    // ...
  })
```

### 2. Webhook 处理时

**文件**: `lib/payment/webhook-handler.ts`

在 webhook 处理中也会更新 `current_period_end`，需要检查其中的时间计算逻辑。

## 可能的根本原因

### 根因1：年份计算错误

```typescript
// ❌ 错误示例
const now = new Date();
const expiresAt = new Date(now);
expiresAt.setFullYear(expiresAt.getFullYear() + 1);  // 可能导致意外结果
```

如果 `now` 的日期和月份某些情况下会导致年份错误。

### 根因2：日期边界问题

```typescript
// 如果当前是某些月份的最后一天，加一个月可能会有问题
const now = new Date("2024-01-31");
const expiresAt = new Date(now);
expiresAt.setMonth(expiresAt.getMonth() + 1);  // 可能变成 "2024-03-02" 而不是 "2024-02-29"
```

### 根因3：Webhook 中的时间计算

需要检查 webhook-handler.ts 中是否有不正确的时间加算。

## 诊断步骤

### 步骤1：检查数据库中的实际数据

```sql
-- 查询用户的订阅记录
SELECT
  id,
  user_id,
  plan_id,
  status,
  current_period_start,
  current_period_end,
  created_at,
  updated_at
FROM subscriptions
WHERE user_id = '用户ID'
ORDER BY created_at DESC
LIMIT 5;
```

### 步骤2：检查浏览器缓存

用户缓存中可能存储了错误的时间：

```javascript
// 打开浏览器控制台执行
const cached = localStorage.getItem("supabase-user-cache");
console.log("缓存数据:", JSON.parse(cached));
```

### 步骤3：检查时间计算逻辑

```typescript
// 在 Node.js 中测试
const now = new Date("2024-11-20T12:00:00Z");
const expiresAt = new Date(now);
expiresAt.setMonth(expiresAt.getMonth() + 1);
console.log("计算结果:", expiresAt.toISOString());

// 结果应该是 2024-12-20，不应该是 2029-...
```

## 修复方案

### 方案1：使用更安全的日期计算

```typescript
// ✅ 安全的方式：使用 date-fns 或类似库
import { addMonths, addYears } from "date-fns";

const now = new Date();
const expiresAt = billingCycle === "yearly"
  ? addYears(now, 1)
  : addMonths(now, 1);

const expiresAtIso = expiresAt.toISOString();
```

### 方案2：验证时间范围

```typescript
// ✅ 添加验证
const currentPeriodEnd = new Date(now);
if (billingCycle === "yearly") {
  currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
} else {
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
}

// 验证：过期时间应该在 1 个月到 1.1 年之间
const diffInMs = currentPeriodEnd.getTime() - now.getTime();
const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

if (diffInDays < 25 || diffInDays > 400) {
  console.warn("⚠️ 警告：过期时间计算异常", {
    now: now.toISOString(),
    expiresAt: currentPeriodEnd.toISOString(),
    diffInDays
  });
  // 返回错误而不是继续
  throw new Error("Subscription expiry calculation error");
}
```

### 方案3：多条记录处理

```typescript
// ❌ 问题代码：.single() 假设只有一条记录
const { data: subscriptions, error: subError } = await supabaseAdmin
  .from("subscriptions")
  .select("current_period_end")
  .eq("user_id", userId)
  .eq("status", "active")
  .single();  // 如果有多条会出错

// ✅ 修复：处理多条记录
const { data: subscriptions, error: subError } = await supabaseAdmin
  .from("subscriptions")
  .select("current_period_end")
  .eq("user_id", userId)
  .eq("status", "active")
  .order("current_period_end", { ascending: false })
  .limit(1);  // 获取最晚过期的

if (!subError && subscriptions?.length > 0) {
  membershipExpiresAt = subscriptions[0].current_period_end;
}
```

## 立即检查清单

- [ ] 查看 subscriptions 表中用户的 current_period_end 值
- [ ] 检查 `/api/profile` 返回的 membership_expires_at
- [ ] 清除浏览器 localStorage（包括 supabase-user-cache）
- [ ] 刷新页面重新获取数据
- [ ] 检查 confirm/route.ts 中的时间计算是否有逻辑错误
- [ ] 检查 webhook-handler.ts 中的时间计算逻辑
- [ ] 查看最近的支付记录，看时间是何时被设置为 2029 的

## 相关文件

| 文件 | 作用 | 重点检查 |
|------|------|---------|
| `app/api/profile/route.ts` | 获取会员到期时间 | 156-163 行 |
| `app/api/payment/confirm/route.ts` | 确认支付，设置到期时间 | 102-107 行 |
| `lib/payment/webhook-handler.ts` | Webhook 处理，更新到期时间 | 时间加算逻辑 |
| `lib/auth-state-manager-intl.ts` | 缓存用户信息 | 缓存是否正确 |

## 时间验证公式

```javascript
// 检查时间是否合理（在今天到一年零一个月内）
const now = new Date();
const expiresAt = new Date("2029-04-09");  // 页面显示的时间

const diffMs = expiresAt - now;
const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365);

console.log(`相差年数: ${diffYears.toFixed(2)} 年`);

if (diffYears > 1.5 || diffYears < 0.5) {
  console.warn("❌ 时间异常！应该在 0.8-1.1 年范围内");
} else {
  console.log("✅ 时间正常");
}
```

## 快速测试

在浏览器控制台运行：

```javascript
// 1. 检查缓存
const cached = JSON.parse(localStorage.getItem("supabase-user-cache") || "{}");
console.log("缓存中的过期时间:", cached.user?.membership_expires_at);

// 2. 调用 API 获取最新数据
fetch("/api/profile", {
  headers: {
    authorization: `Bearer ${yourToken}`
  }
})
.then(r => r.json())
.then(data => {
  console.log("API 返回的过期时间:", data.membership_expires_at);
  console.log("完整响应:", data);
});

// 3. 检查时间差异
const expiresAt = new Date("2029-04-09");
const now = new Date();
console.log("相差天数:", Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24)));
```

## 总结

**最可能的原因**：
1. 支付时时间计算出错（年份加 5 年而非 1 年）
2. 或者 webhook 处理时时间计算错误
3. 需要检查 confirm/route.ts 和 webhook-handler.ts 中的 `setFullYear()` 或 `setMonth()` 调用

**建议优先级**：
1. 🔴 高：修复时间计算逻辑（添加验证）
2. 🟡 中：处理多条订阅记录的情况
3. 🟡 中：迁移到 date-fns 库进行日期运算
4. 🟢 低：添加自动化测试确保时间计算正确
