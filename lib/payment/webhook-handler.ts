/**
 * Webhook Handler - 统一 webhook 处理器
 *
 * 此文件现在作为向后兼容的重新导出模块。
 * 实际实现已移至 ./webhook-handler/ 目录下的模块化文件中。
 *
 * 模块结构:
 * - types.ts - 类型定义
 * - event-store.ts - 事件存储和幂等性检查
 * - subscription-db.ts - 订阅数据库操作
 * - payment-success.ts - 支付成功处理
 * - stripe.ts - Stripe 特定处理
 * - providers.ts - 各支付提供商事件处理
 * - index.ts - 主入口和 WebhookHandler 类
 */

// 重新导出所有内容以保持向后兼容
export * from "./webhook-handler/index";
export { WebhookHandler, getWebhookHandler } from "./webhook-handler/index";
