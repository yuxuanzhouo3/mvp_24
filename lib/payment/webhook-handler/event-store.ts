/**
 * Webhook Event Store
 * 事件存储和幂等性检查
 */

import { supabaseAdmin } from "../../supabase-admin";
import { getDatabase } from "../../auth-utils";
import { isChinaRegion } from "../../config/region";
import { logError, logInfo } from "../../logger";
import type { WebhookEvent, WebhookProvider } from "./types";

/**
 * 生成事件唯一ID
 */
export function generateEventId(provider: string, eventData: any): string {
  let uniqueKey = "";

  switch (provider) {
    case "paypal":
      // PayPal修复：优先使用 transmissionId（最可靠的唯一标识）
      if (eventData._paypal_transmission_id) {
        uniqueKey = eventData._paypal_transmission_id;
      } else {
        uniqueKey =
          eventData.id || eventData.resource?.id || JSON.stringify(eventData);
      }
      break;
    case "stripe":
      uniqueKey =
        eventData.id ||
        eventData.data?.object?.id ||
        JSON.stringify(eventData);
      break;
    case "alipay":
      uniqueKey =
        eventData.out_trade_no ||
        eventData.trade_no ||
        JSON.stringify(eventData);
      break;
    case "wechat":
      uniqueKey =
        eventData.out_trade_no ||
        eventData.transaction_id ||
        JSON.stringify(eventData);
      break;
    default:
      uniqueKey = JSON.stringify(eventData);
  }

  return `${provider}_${uniqueKey}`;
}

/**
 * 检查事件是否已处理
 */
export async function getProcessedEvent(
  eventId: string
): Promise<WebhookEvent | null> {
  try {
    if (isChinaRegion()) {
      // CloudBase 用户
      const db = getDatabase();
      const result = await db
        .collection("webhook_events")
        .where({
          id: eventId,
          processed: true,
        })
        .get();

      if (result.data && result.data.length > 0) {
        return result.data[0];
      }
      return null;
    } else {
      // Supabase 用户
      const { data, error } = await supabaseAdmin
        .from("webhook_events")
        .select("*")
        .eq("id", eventId)
        .eq("processed", true)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        logError("Error checking processed event", error, { eventId });
        return null;
      }

      return data;
    }
  } catch (error) {
    logError("Error getting processed event", error as Error, { eventId });
    return null;
  }
}

/**
 * 记录webhook事件
 */
export async function recordEvent(
  eventId: string,
  provider: string,
  eventType: string,
  eventData: any
): Promise<void> {
  try {
    if (isChinaRegion()) {
      // CloudBase 用户
      const db = getDatabase();

      // 先检查是否存在
      const existing = await db
        .collection("webhook_events")
        .where({ id: eventId })
        .get();

      if (existing.data && existing.data.length > 0) {
        // 更新现有记录
        await db
          .collection("webhook_events")
          .doc(existing.data[0]._id)
          .update({
            provider,
            event_type: eventType,
            event_data: eventData,
            processed: false,
            updated_at: new Date().toISOString(),
          });
      } else {
        // 创建新记录
        await db.collection("webhook_events").add({
          id: eventId,
          provider,
          event_type: eventType,
          event_data: eventData,
          processed: false,
          created_at: new Date().toISOString(),
        });
      }
    } else {
      // Supabase 用户
      const { error } = await supabaseAdmin.from("webhook_events").upsert({
        id: eventId,
        provider,
        event_type: eventType,
        event_data: eventData,
        processed: false,
        created_at: new Date().toISOString(),
      });

      if (error) {
        logError("Error recording webhook event", error, {
          eventId,
          provider,
          eventType,
        });
        throw error;
      }
    }
  } catch (error) {
    logError("Error recording webhook event", error as Error, {
      eventId,
      provider,
      eventType,
    });
    throw error;
  }
}

/**
 * 标记事件为已处理
 */
export async function markEventProcessed(eventId: string): Promise<void> {
  try {
    if (isChinaRegion()) {
      // CloudBase 用户
      const db = getDatabase();

      const result = await db
        .collection("webhook_events")
        .where({ id: eventId })
        .get();

      if (result.data && result.data.length > 0) {
        await db.collection("webhook_events").doc(result.data[0]._id).update({
          processed: true,
          processed_at: new Date().toISOString(),
        });
      }
    } else {
      // Supabase 用户
      const { error } = await supabaseAdmin
        .from("webhook_events")
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
        })
        .eq("id", eventId);

      if (error) {
        logError("Error marking event processed", error, { eventId });
      }
    }
  } catch (error) {
    logError("Error marking event processed", error as Error, { eventId });
  }
}
