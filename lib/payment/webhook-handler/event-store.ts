/**
 * Webhook Event Store
 * 事件存储和幂等性检查
 */

import { supabaseAdmin } from "../../supabase-admin";
import { getDatabase } from "../../cloudbase-service";
import { isChinaRegion } from "../../config/region";
import { logError } from "../../logger";
import type { WebhookEvent } from "./types";

const IN_FLIGHT_WINDOW_MS = 2 * 60 * 1000;

export interface EventReservation {
  shouldProcess: boolean;
  alreadyProcessed: boolean;
  inProgress: boolean;
}

function isInFlight(createdAt: unknown): boolean {
  if (typeof createdAt !== "string") {
    return false;
  }

  const createdAtMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) {
    return false;
  }

  return Date.now() - createdAtMs < IN_FLIGHT_WINDOW_MS;
}

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
 * 预占事件处理权（幂等 + 并发保护）
 */
export async function reserveEvent(
  eventId: string,
  provider: string,
  eventType: string,
  eventData: any
): Promise<EventReservation> {
  if (isChinaRegion()) {
    return reserveEventCloudBase(eventId, provider, eventType, eventData);
  }
  return reserveEventSupabase(eventId, provider, eventType, eventData);
}

async function reserveEventCloudBase(
  eventId: string,
  provider: string,
  eventType: string,
  eventData: any
): Promise<EventReservation> {
  const nowIso = new Date().toISOString();
  const db = getDatabase();

  const existing = await db
    .collection("webhook_events")
    .where({ id: eventId })
    .limit(1)
    .get();

  const existingEvent = existing.data?.[0];
  if (!existingEvent) {
    await db.collection("webhook_events").add({
      id: eventId,
      provider,
      event_type: eventType,
      event_data: eventData,
      processed: false,
      created_at: nowIso,
      updated_at: nowIso,
    });
    return { shouldProcess: true, alreadyProcessed: false, inProgress: false };
  }

  if (existingEvent.processed === true) {
    return { shouldProcess: false, alreadyProcessed: true, inProgress: false };
  }

  const createdAt = existingEvent.created_at || existingEvent.updated_at;
  if (isInFlight(createdAt)) {
    return { shouldProcess: false, alreadyProcessed: false, inProgress: true };
  }

  await db.collection("webhook_events").doc(existingEvent._id).update({
    provider,
    event_type: eventType,
    event_data: eventData,
    processed: false,
    created_at: nowIso,
    updated_at: nowIso,
  });

  return { shouldProcess: true, alreadyProcessed: false, inProgress: false };
}

async function reserveEventSupabase(
  eventId: string,
  provider: string,
  eventType: string,
  eventData: any
): Promise<EventReservation> {
  const nowIso = new Date().toISOString();
  const insertPayload = {
    id: eventId,
    provider,
    event_type: eventType,
    event_data: eventData,
    processed: false,
    created_at: nowIso,
  };

  const { error: insertError } = await supabaseAdmin
    .from("webhook_events")
    .insert(insertPayload);

  if (!insertError) {
    return { shouldProcess: true, alreadyProcessed: false, inProgress: false };
  }

  if (insertError.code !== "23505") {
    logError("Error reserving webhook event", insertError, {
      eventId,
      provider,
      eventType,
    });
    throw insertError;
  }

  const { data: existingEvent, error: existingError } = await supabaseAdmin
    .from("webhook_events")
    .select("processed, created_at")
    .eq("id", eventId)
    .maybeSingle();

  if (existingError && existingError.code !== "PGRST116") {
    logError("Error reading existing webhook event", existingError, {
      eventId,
      provider,
      eventType,
    });
    throw existingError;
  }

  if (!existingEvent) {
    return { shouldProcess: true, alreadyProcessed: false, inProgress: false };
  }

  if (existingEvent.processed === true) {
    return { shouldProcess: false, alreadyProcessed: true, inProgress: false };
  }

  const staleBeforeIso = new Date(Date.now() - IN_FLIGHT_WINDOW_MS).toISOString();
  const { data: claimedEvent, error: claimError } = await supabaseAdmin
    .from("webhook_events")
    .update({
      provider,
      event_type: eventType,
      event_data: eventData,
      processed: false,
      created_at: nowIso,
    })
    .eq("id", eventId)
    .eq("processed", false)
    .lte("created_at", staleBeforeIso)
    .select("id")
    .maybeSingle();

  if (claimError && claimError.code !== "PGRST116") {
    logError("Error claiming stale webhook event", claimError, {
      eventId,
      provider,
      eventType,
    });
    throw claimError;
  }

  if (claimedEvent?.id) {
    return { shouldProcess: true, alreadyProcessed: false, inProgress: false };
  }

  return { shouldProcess: false, alreadyProcessed: false, inProgress: true };
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
      const nowIso = new Date().toISOString();

      // 先检查是否存在
      const existing = await db
        .collection("webhook_events")
        .where({ id: eventId })
        .get();

      if (existing.data && existing.data.length > 0) {
        // 更新现有记录
        const existingEvent = existing.data[0];
        await db
          .collection("webhook_events")
          .doc(existingEvent._id)
          .update({
            provider,
            event_type: eventType,
            event_data: eventData,
            // 不要把 processed=true 的事件重置为 false
            processed: existingEvent.processed === true ? true : false,
            updated_at: nowIso,
          });
      } else {
        // 创建新记录
        await db.collection("webhook_events").add({
          id: eventId,
          provider,
          event_type: eventType,
          event_data: eventData,
          processed: false,
          created_at: nowIso,
          updated_at: nowIso,
        });
      }
    } else {
      // Supabase 用户
      const { error } = await supabaseAdmin.from("webhook_events").upsert(
        {
          id: eventId,
          provider,
          event_type: eventType,
          event_data: eventData,
          processed: false,
          created_at: new Date().toISOString(),
        },
        {
          onConflict: "id",
          ignoreDuplicates: true,
        }
      );

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
