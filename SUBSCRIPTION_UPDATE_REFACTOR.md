# 支付订阅更新函数统一重构

## 问题分析

之前在 WeChat webhook 和其他地方存在重复的订阅表更新逻辑：
- WeChat webhook 中有 STEP 2 和 STEP 3 的订阅更新代码
- WebhookHandler 中的 `createOrUpdateSubscriptionCloudBase` 也在做类似的事情
- Alipay webhook 通过 WebhookHandler 间接更新
- 代码重复导致维护困难、容易不一致

## 解决方案

### 1. 创建统一函数
**文件**: `app/api/payment/lib/update-cloudbase-subscription.ts`

功能：
- 获取用户现有订阅（如果存在）
- 计算新的到期时间（基于现有订阅或从现在开始）
- 更新或创建 subscriptions 记录（源数据）
- 同步 web_users 记录（派生数据）

### 2. WeChat Webhook 集成
**文件**: `app/api/payment/webhook/wechat/route.ts`

改动：
```typescript
// 导入统一函数
import { updateCloudbaseSubscription } from "@/app/api/payment/lib/update-cloudbase-subscription";

// 替换原有的 STEP 2 和 STEP 3 逻辑
const subscriptionResult = await updateCloudbaseSubscription({
  userId,
  days,
  transactionId: paymentData.transaction_id,
  currentDate,
});
```

## 代码示例

```typescript
// 函数签名
export interface SubscriptionUpdateInput {
  userId: string;
  days: number; // 订阅天数（30 或 365）
  transactionId: string; // 本地交易ID
  subscriptionId?: string; // 第三方平台的订阅ID（可选）
  provider?: string; // 支付提供商（alipay, wechat等）
  currentDate?: Date; // 当前时间（默认为now）
}

// 返回结果
export interface SubscriptionUpdateResult {
  success: boolean;
  subscriptionId?: string;
  expiresAt?: Date;
  error?: string;
}
```

## 日志和追踪

函数内部使用 logInfo 和 logError 记录所有操作，便于调试和审计：
- 订阅查询
- 到期时间计算
- 数据库更新
- 错误情况

## 后续改进

建议继续重构：
1. 将 `lib/payment/webhook-handler/subscription-db.ts` 中的 `createOrUpdateSubscriptionCloudBase` 
   重构为使用 `updateCloudbaseSubscription`
2. 这样可以完全消除重复代码，所有支付方式都使用同一套逻辑

## 编译验证

✅ 编译成功
- WeChat webhook 正确导入和使用函数
- TypeScript 类型检查通过
- 打包和路由生成成功
