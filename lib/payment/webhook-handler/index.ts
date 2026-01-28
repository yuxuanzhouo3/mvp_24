/**
 * Webhook Handler - 统一 webhook 处理器
 * 模块化重构版本
 */

import { logError, logInfo, logWarn } from "../../logger";
import {
  generateEventId,
  getProcessedEvent,
  recordEvent,
  markEventProcessed,
} from "./event-store";
import {
  handlePayPalEvent,
  handleStripeEvent,
  handleAlipayEvent,
  handleWechatEvent,
} from "./providers";

// 重新导出类型
export * from "./types";

/**
 * WebhookHandler 类
 * 提供统一的 webhook 处理接口
 */
export class WebhookHandler {
  private static instance: WebhookHandler;

  static getInstance(): WebhookHandler {
    if (!WebhookHandler.instance) {
      WebhookHandler.instance = new WebhookHandler();
    }
    return WebhookHandler.instance;
  }

  /**
   * 处理 webhook 事件
   */
  async processWebhook(
    provider: string,
    eventType: string,
    eventData: any
  ): Promise<boolean> {
    const startTime = Date.now();

    try {
      // 生成事件ID
      const eventId = generateEventId(provider, eventData);

      logInfo(`Processing webhook: ${provider} ${eventType}`, {
        eventId,
        provider,
        eventType,
        livemode: eventData.livemode,
      });

      // 检查事件是否已处理（幂等性）
      const existingEvent = await getProcessedEvent(eventId);
      if (existingEvent) {
        logInfo(`Webhook event already processed, skipping`, { eventId });
        return true;
      }

      // 记录事件
      await recordEvent(eventId, provider, eventType, eventData);

      // 根据提供商和事件类型处理
      const success = await this.handleEvent(provider, eventType, eventData);

      // 标记为已处理
      if (success) {
        await markEventProcessed(eventId);
        logInfo(`Webhook processed successfully`, {
          eventId,
          provider,
          eventType,
          duration: `${Date.now() - startTime}ms`,
        });
      } else {
        logError(`Webhook processing failed`, undefined, {
          eventId,
          provider,
          eventType,
          duration: `${Date.now() - startTime}ms`,
        });
      }

      return success;
    } catch (error) {
      logError(`Webhook processing error`, error as Error, {
        provider,
        eventType,
        duration: `${Date.now() - startTime}ms`,
      });
      return false;
    }
  }

  /**
   * 处理具体事件
   */
  private async handleEvent(
    provider: string,
    eventType: string,
    eventData: any
  ): Promise<boolean> {
    try {
      switch (provider) {
        case "paypal":
          return await handlePayPalEvent(eventType, eventData);
        case "stripe":
          return await handleStripeEvent(eventType, eventData);
        case "alipay":
          return await handleAlipayEvent(eventType, eventData);
        case "wechat":
          return await handleWechatEvent(eventType, eventData);
        default:
          logWarn(`Unknown provider: ${provider}`, { eventType, eventData });
          return false;
      }
    } catch (error) {
      logError(`Error handling ${provider} event`, error as Error, {
        provider,
        eventType,
      });
      return false;
    }
  }
}

// 导出便捷函数
export function getWebhookHandler(): WebhookHandler {
  return WebhookHandler.getInstance();
}
