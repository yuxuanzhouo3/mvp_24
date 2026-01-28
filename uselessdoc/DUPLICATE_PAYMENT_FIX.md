# 支付订单重复问题修复总结

## 问题描述

用户在支付页面点击一个订阅按钮后，系统会创建两个相同的订单记录，导致账单历史中出现重复的支付记录。

## 问题原因分析

经过分析代码，发现了以下几个导致订单重复的原因：

### 1. **PayPal Webhook 重复触发**

- PayPal 可能会多次发送同一个 `PAYMENT.SALE.COMPLETED` 事件
- 之前的幂等性检查不够严格，未能完全防止重复处理

### 2. **支付创建时的并发问题**

- 用户快速点击订阅按钮时，可能在短时间内发送多个支付请求
- 之前的重复检查窗口期较长（5 分钟），且只检查了部分状态

### 3. **Webhook 处理重复创建记录**

- 在支付创建时已插入 `pending` 状态的记录
- Webhook 处理时可能再次创建新的 `completed` 记录，而不是更新现有记录

## 修复方案

### 修复 1: 增强 Webhook 幂等性检查

**文件**: `lib/payment/webhook-handler.ts`

**改进内容**:

- 在记录支付之前，首先检查是否已存在 `completed` 状态的相同 `transaction_id` 记录
- 如果已存在已完成的支付，直接跳过，避免重复创建
- 添加详细的日志记录，方便追踪问题

```typescript
// 关键代码片段
const { data: existingCompletedPayment } = await supabaseAdmin
  .from("payments")
  .select("id, status, created_at")
  .eq("transaction_id", subscriptionId)
  .eq("status", "completed")
  .maybeSingle();

if (existingCompletedPayment) {
  // 跳过重复记录
  return true;
}
```

### 修复 2: 优化支付创建防重复检查

**文件**: `app/api/payment/create/route.ts`

**改进内容**:

- 将检查窗口从 5 分钟缩短到 1 分钟，更快速地检测重复请求
- 只检查 `pending` 和 `completed` 状态的支付记录
- 如果 1 分钟内存在相同的支付请求，返回 429 状态码并提示等待时间
- 增加了更严格的错误处理

```typescript
// 关键改进
const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
const { data: recentPayments } = await supabaseAdmin
  .from("payments")
  .select("id, status, created_at, transaction_id")
  .eq("user_id", userId)
  .eq("amount", Number(amount))
  .eq("currency", currency)
  .eq("payment_method", method)
  .gte("created_at", oneMinuteAgo)
  .in("status", ["pending", "completed"])
  .order("created_at", { ascending: false })
  .limit(1);
```

### 修复 3: 数据库层面防护

**文件**:

- `scripts/add-payment-unique-constraint.sql` (SQL 脚本)
- `scripts/cleanup-duplicate-payment-records.ts` (TypeScript 清理脚本)

**改进内容**:

- 创建数据库迁移脚本，添加 `(transaction_id, user_id)` 唯一约束
- 提供清理现有重复记录的工具脚本
- 添加索引以提高查询性能

## 使用说明

### 步骤 1: 清理现有重复记录

首先，运行检查脚本查看当前有多少重复记录（不会删除）：

```powershell
npx tsx scripts/cleanup-duplicate-payment-records.ts
```

确认无误后，执行清理：

```powershell
npx tsx scripts/cleanup-duplicate-payment-records.ts --execute
```

### 步骤 2: 添加数据库约束（可选）

如果需要从数据库层面彻底防止重复，可以执行 SQL 迁移脚本：

1. 连接到 Supabase 数据库
2. 按照 `scripts/add-payment-unique-constraint.sql` 中的说明逐步执行

**注意**: 在添加唯一约束之前，必须确保已经清理了所有重复记录。

### 步骤 3: 部署代码修复

将修复后的代码部署到生产环境：

```powershell
npm run build
# 部署到 Vercel 或其他平台
```

## 测试验证

### 1. 测试快速点击

- 在支付页面快速连续点击订阅按钮
- 预期：第二次点击应该被拒绝，显示 "You have a recent payment request" 错误

### 2. 测试 Webhook 重复

- 使用 PayPal Sandbox 触发支付
- 手动重新发送相同的 webhook 事件
- 预期：第二次 webhook 应该被识别为重复并跳过

### 3. 检查支付历史

- 完成一笔支付后，检查账单历史
- 预期：只显示一条支付记录

## 预防措施

### 前端防护（建议补充）

在前端也添加防重复点击逻辑：

```typescript
// 示例代码（建议添加到支付组件中）
const [isProcessing, setIsProcessing] = useState(false);

const handlePayment = async () => {
  if (isProcessing) {
    return; // 防止重复点击
  }

  setIsProcessing(true);
  try {
    // 调用支付 API
  } finally {
    setIsProcessing(false);
  }
};
```

### 监控和告警

- 定期检查 `payments` 表中是否有新的重复记录
- 监控 webhook 处理日志，关注 "duplicate" 相关的警告

## 影响范围

- ✅ 不影响现有正常的支付流程
- ✅ 向后兼容，不会破坏已完成的支付
- ✅ 只是加强了防重复机制
- ⚠️ 用户在 1 分钟内只能发起一次相同金额的支付请求

## 相关文件

### 修改的文件

- `lib/payment/webhook-handler.ts` - Webhook 幂等性增强
- `app/api/payment/create/route.ts` - 支付创建防重复优化

### 新增的文件

- `scripts/cleanup-duplicate-payment-records.ts` - 重复记录清理工具
- `scripts/add-payment-unique-constraint.sql` - 数据库约束脚本
- `DUPLICATE_PAYMENT_FIX.md` - 本文档

## 后续优化建议

1. **添加前端防抖** - 在支付按钮上添加 loading 状态和防抖逻辑
2. **用户通知优化** - 当检测到重复请求时，给用户更友好的提示
3. **监控仪表板** - 创建监控面板实时查看支付状态和重复情况
4. **自动化测试** - 添加集成测试覆盖重复支付场景

## 联系方式

如有问题，请联系开发团队或查看相关文档。
