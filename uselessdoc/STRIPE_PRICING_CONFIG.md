# Stripe 价格 ID 配置完成

## 🎉 配置概况

已成功配置 Stripe 价格 ID，支持完整的订阅支付流程。

## 📋 配置的价格

| 计划类型     | 计费周期 | 价格 ID                          | 金额       | 描述           |
| ------------ | -------- | -------------------------------- | ---------- | -------------- |
| PRO_MONTHLY  | 月度     | `price_1SM3P5PvVD9JAxvV7R489iAe` | $9.99/月   | 专业版月度订阅 |
| PRO_ANNUAL   | 年度     | `price_1SM3PwPvVD9JAxvVT7bkEWQo` | $99.99/年  | 专业版年度订阅 |
| TEAM_MONTHLY | 月度     | `price_1SM3QdPvVD9JAxvVE0dfa5Ah` | $29.99/月  | 团队版月度订阅 |
| TEAM_ANNUAL  | 年度     | `price_1SM3REPvVD9JAxvVozy241eV` | $299.99/年 | 团队版年度订阅 |

## 🔧 环境变量配置

在 `.env.local` 中已添加：

```env
# Stripe价格ID配置
STRIPE_PRO_MONTHLY_PRICE_ID=price_1SM3P5PvVD9JAxvV7R489iAe
STRIPE_PRO_ANNUAL_PRICE_ID=price_1SM3PwPvVD9JAxvVT7bkEWQo
STRIPE_TEAM_MONTHLY_PRICE_ID=price_1SM3QdPvVD9JAxvVE0dfa5Ah
STRIPE_TEAM_ANNUAL_PRICE_ID=price_1SM3REPvVD9JAxvVozy241eV
```

## ⚙️ 代码实现

### 1. 价格 ID 映射

```typescript
const priceMap: Record<string, Record<string, string>> = {
  pro: {
    monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
    yearly: process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
  },
  team: {
    monthly: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID,
    yearly: process.env.STRIPE_TEAM_ANNUAL_PRICE_ID,
  },
};
```

### 2. Checkout 会话配置

- **模式**: `subscription` (订阅模式)
- **价格**: 使用预定义的价格 ID
- **元数据**: 包含用户 ID、计划类型、计费周期

### 3. Webhook 事件处理

支持以下 Stripe 事件：

- `checkout.session.completed` - 结账完成
- `customer.subscription.created` - 订阅创建
- `customer.subscription.updated` - 订阅更新
- `customer.subscription.deleted` - 订阅删除
- `invoice.payment_succeeded` - 发票支付成功
- `invoice.payment_failed` - 发票支付失败

## 🚀 工作流程

1. **用户选择计划** → 前端调用支付 API
2. **创建 Checkout 会话** → 使用价格 ID 生成支付链接
3. **用户完成支付** → Stripe 处理支付
4. **Webhook 通知** → 服务器接收支付确认
5. **状态更新** → 更新用户订阅状态
6. **服务激活** → 用户获得相应权限

## 📊 价格策略

- **专业版**: $9.99/月 或 $99.99/年 (节省 16.7%)
- **团队版**: $29.99/月 或 $299.99/年 (节省 16.7%)

年度订阅提供约 17%的折扣，鼓励长期订阅。

## 🔍 测试建议

1. **本地测试**: 使用 Stripe 测试密钥
2. **Webhook 测试**: 配置本地 tunnel 或使用 Stripe CLI
3. **价格验证**: 确认价格 ID 与 Stripe 控制台一致
4. **订阅流程**: 测试完整的新订阅和续费流程

## ⚠️ 注意事项

1. **价格 ID 唯一性**: 每个价格 ID 在 Stripe 中是唯一的
2. **环境隔离**: 生产和测试环境使用不同的价格 ID
3. **货币单位**: Stripe 使用分为单位，代码已处理转换
4. **时区**: 所有时间戳使用 UTC

## 🎯 下一步

Stripe 价格配置已完成！现在可以：

1. **测试支付流程** - 验证价格和订阅功能
2. **配置 webhook** - 设置服务器回调（生产环境）
3. **添加 PayPal 价格** - 配置 PayPal 的计划 ID
4. **用户界面优化** - 显示价格和折扣信息

系统现在支持完整的 Stripe 订阅支付！🎉
