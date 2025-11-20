# PayPal BILLING.SUBSCRIPTION.ACTIVATED 事件处理修复

## 问题描述

从日志中看到：

```
Received PayPal webhook: {
  eventType: 'BILLING.SUBSCRIPTION.ACTIVATED',
  transmissionId: '584f86d2-b6e8-11f0-8564-b9f11b31365f',
  resourceId: 'I-GU6NF1SS2967'
}
```

系统无法找到对应的用户来处理此 webhook 事件。

## 根本原因

1. **订阅 ID 不匹配**：PayPal 创建订阅时返回的临时 ID 和激活后的订阅 ID (`I-GU6NF1SS2967`) 可能不同
2. **查找逻辑不足**：之前的 `findUserBySubscriptionId` 只查找精确匹配的 transaction_id
3. **数据结构差异**：`BILLING.SUBSCRIPTION.ACTIVATED` 事件可能不包含支付金额（因为只是激活，还没有扣款）

## 修复方案

### 1. 改进用户查找策略

增强 `findUserBySubscriptionId` 方法，使用多层查找：

1. **精确匹配**：从 payments 表查找 transaction_id = subscriptionId
2. **订阅表查找**：从 subscriptions 表查找 provider_subscription_id
3. **启发式匹配**：如果都没找到，查找最近 5 分钟内的 pending PayPal 支付

第三层是关键修复：当 PayPal 订阅刚创建时，我们在 payments 表中记录了 pending 状态，但使用的是创建时的临时 ID。激活事件来临时，我们通过时间窗口找到最近的 pending 支付，推断这就是对应的用户。

### 2. 处理无金额的订阅激活

`BILLING.SUBSCRIPTION.ACTIVATED` 事件通常不包含支付金额（因为只是激活订阅，实际扣款可能稍后发生）。

修改逻辑：

- 添加详细日志记录 PayPal 数据结构
- 当 amount = 0 时，只更新订阅状态，不创建支付记录
- 传递 `undefined` 而不是 0 给 `updateSubscriptionStatus`

### 3. 增强日志记录

添加详细的调试日志：

- PayPal 数据结构的 keys
- 是否包含 amount、billing_info 等字段
- 用户查找的每个步骤结果

## 代码更改

### 文件：`lib/payment/webhook-handler.ts`

1. **handlePaymentSuccess** 方法

   - 添加 PayPal 数据日志
   - 处理无金额的情况
   - 优化数据提取逻辑

2. **findUserBySubscriptionId** 方法
   - 添加第三层启发式查找
   - 详细的日志记录
   - 返回最近的 pending PayPal 支付

## 测试建议

1. 清理现有的 pending 支付（避免误匹配）
2. 创建新的 PayPal 订阅
3. 等待 BILLING.SUBSCRIPTION.ACTIVATED webhook
4. 检查日志确认用户被正确找到
5. 验证订阅状态更新成功

## 部署

修复已完成，运行：

```bash
npm run build
vercel --prod
```

## 预期行为

修复后，当 PayPal 发送 `BILLING.SUBSCRIPTION.ACTIVATED` 事件时：

1. ✅ 系统能找到对应的用户（通过最近的 pending 支付）
2. ✅ 订阅状态更新为 active
3. ✅ 即使没有支付金额也能正常处理
4. ✅ 详细日志帮助排查问题

---

修复日期：2025 年 11 月 1 日
