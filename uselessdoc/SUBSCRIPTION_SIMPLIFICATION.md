# 订阅计划简化 - 移除团队版

## 📋 修改概述

已成功移除团队版（Team）订阅，现在系统只支持两种订阅计划：

- **Free（免费版）**：基础功能
- **Pro（专业版）**：完整功能访问

## 🔧 修改的文件

### 1. 前端组件

#### `components/payment/subscription-plans.tsx`

- ✅ 移除了团队版计划定义
- ✅ 更新 `PLAN_HIERARCHY` 只包含 `free` 和 `pro`
- ✅ 修改布局从 3 列改为 2 列（`md:grid-cols-2`）
- ✅ 移除团队版的卡片显示

#### `components/payment/subscription-plans.tsx` 主要改动：

```typescript
// 之前
const PLAN_HIERARCHY = {
  free: 0,
  pro: 1,
  team: 2, // ❌ 已移除
};

// 现在
const PLAN_HIERARCHY = {
  free: 0,
  pro: 1,
};
```

### 2. 后端 API

#### `app/api/payment/create/route.ts`

- ✅ 更新 `PLAN_HIERARCHY` 移除团队版
- ✅ 所有计划验证逻辑自动适配新的计划结构

#### `app/payment/page.tsx`

- ✅ 移除团队版价格配置
- ✅ 只保留 `free` 和 `pro` 两个计划

### 3. 支付提供商配置

#### `lib/architecture-modules/layers/third-party/payment/providers/abstract/paypal-provider.ts`

- ✅ 移除 `teamMonthlyPlanId` 和 `teamAnnualPlanId` 配置
- ✅ 更新 `PayPalConfig` 接口
- ✅ 简化 `getPlanId` 方法，只处理 `pro` 计划

```typescript
// PayPalConfig 接口
export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  proMonthlyPlanId: string;
  proAnnualPlanId: string;
  // teamMonthlyPlanId: string;  // ❌ 已移除
  // teamAnnualPlanId: string;   // ❌ 已移除
  environment: "sandbox" | "production";
}
```

#### `lib/architecture-modules/layers/third-party/payment/providers/abstract/stripe-provider.ts`

- ✅ 移除团队版 Stripe Price ID 配置
- ✅ 更新 `getPriceId` 方法

### 4. 类型定义

#### `lib/architecture-modules/core/types.ts`

- ✅ 更新 `SubscriptionPlan` 接口，移除团队版定义

```typescript
export interface SubscriptionPlan {
  pro: {
    price: { monthly: number; yearly: number };
    features: string[];
  };
  // team: { ... }  // ❌ 已移除
}
```

#### `lib/architecture-modules/config/env-loader.ts`

- ✅ 更新默认订阅计划配置
- ✅ 移除团队版默认价格

## 💰 当前定价结构

### Pro（专业版）

- **月付**：$9.99/月
- **年付**：$99.99/年（节省 17%）

### 功能特性

从翻译文件中定义的功能特性（`lib/i18n/translations/`）：

- 无限制使用所有 AI 模型
- 优先支持
- 自定义设置
- 高级功能访问

## 🔒 防重复支付增强

同时也实现了防重复支付机制：

### 前端防护

1. **状态检查**：使用 `isProcessing` 状态防止按钮重复点击
2. **幂等性键**：每个支付请求生成唯一的 `idempotencyKey`
3. **请求追踪**：使用 `useRef` 追踪进行中的请求
4. **延迟清理**：支付完成后 3 秒才清理幂等性键

### 后端防护

1. **数据库检查**：检查最近 5 条相同金额的支付记录
2. **时间窗口**：2 分钟内的相同支付被视为重复
3. **状态无关**：不仅检查 `pending` 状态，所有状态都检查
4. **错误代码**：返回 `DUPLICATE_PAYMENT_REQUEST` 错误码

## 🗑️ 环境变量清理

以下环境变量不再需要（可选移除）：

```bash
# PayPal 团队版配置（不再使用）
PAYPAL_TEAM_MONTHLY_PLAN_ID
PAYPAL_TEAM_ANNUAL_PLAN_ID

# Stripe 团队版配置（不再使用）
STRIPE_TEAM_MONTHLY_PRICE_ID
STRIPE_TEAM_ANNUAL_PRICE_ID
```

**注意**：这些变量可以保留在 `.env.local` 中，不会影响系统运行，但不会被使用。

## 📊 数据库清理

### 清理重复支付记录

已创建清理脚本：`scripts/cleanup-duplicate-payments.ts`

使用方法：

```bash
# 预览模式（不实际删除）
npm run cleanup-payments

# 确认删除模式
npm run cleanup-payments -- --confirm
```

**功能**：

- 自动检测重复支付记录
- 保留最早的支付记录
- 删除后续的重复记录
- 支持预览和确认两种模式

### 处理现有团队版订阅

如果数据库中有现有的团队版订阅：

1. **迁移方案 A**：将所有 `team` 订阅降级为 `pro`

```sql
UPDATE subscriptions
SET plan_id = 'pro'
WHERE plan_id = 'team';
```

2. **迁移方案 B**：保留团队版订阅直到到期
   - 不影响现有订阅
   - 新用户只能选择 Pro 或 Free
   - 团队版订阅到期后自动降级

## ✅ 验证清单

- [x] 前端订阅计划显示只有 2 个选项
- [x] 支付流程只支持 Pro 和 Free
- [x] PayPal 配置移除团队版 Plan ID
- [x] Stripe 配置移除团队版 Price ID
- [x] 类型定义更新
- [x] 无编译错误
- [x] 防重复支付机制已实现

## 🎯 下一步建议

1. **测试支付流程**

   - 测试 Pro 月付订阅
   - 测试 Pro 年付订阅
   - 验证防重复支付功能

2. **更新文档**

   - 更新用户文档，说明只有两个计划
   - 更新定价页面的营销内容

3. **数据库清理**（可选）

   - 运行清理脚本移除重复支付
   - 决定如何处理现有团队版订阅

4. **监控**
   - 观察支付成功率
   - 监控是否还有重复支付出现

## 📝 注意事项

- ⚠️ 如果你的 PayPal/Stripe 仍然配置了团队版 Plan ID，这些不会被使用
- ⚠️ 用户界面现在使用 2 列布局展示计划（Free 和 Pro）
- ⚠️ 所有价格验证逻辑已更新为只认可 `free` 和 `pro`
- ⚠️ 建议在生产环境部署前进行完整的支付流程测试

## 🐛 故障排除

### 如果看到 "Unsupported plan type: team" 错误

这意味着系统中还有代码尝试创建团队版订阅。检查：

1. 前端是否有缓存的旧代码
2. 数据库中是否有待处理的团队版支付
3. 本地存储是否缓存了团队版选择

### 如果支付失败

1. 检查 PayPal/Stripe 的 Pro Plan ID 是否正确配置
2. 确认环境变量正确加载（重启开发服务器）
3. 查看浏览器控制台和服务器日志的详细错误

---

**更新日期**：2025 年 10 月 29 日
**版本**：2.0 - 简化订阅模式
