import { getDatabase } from "@/lib/cloudbase-service";
import { isChinaRegion } from "@/lib/config/region";
import { supabaseAdmin } from "@/lib/supabase-admin";

export interface ActiveSubscriptionSnapshot {
  planId: string | null;
  currentPeriodEnd?: string | null;
  provider?: string | null;
  providerSubscriptionId?: string | null;
  transactionId?: string | null;
}

const KNOWN_PLAN_IDS = new Set(["free", "basic", "pro", "enterprise"]);

export function normalizePlanId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return KNOWN_PLAN_IDS.has(normalized) ? normalized : null;
}

function parseDateMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export async function getActiveSubscriptionSnapshot(
  userId: string
): Promise<ActiveSubscriptionSnapshot | null> {
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  if (isChinaRegion()) {
    const db = getDatabase();
    const _ = db.command;
    const result = await db
      .collection("subscriptions")
      .where({
        user_id: userId,
        status: "active",
        current_period_end: _.gte(nowIso),
      })
      .orderBy("current_period_end", "desc")
      .limit(1)
      .get();

    const row = result?.data?.[0];
    if (!row) {
      return null;
    }

    const endMs = parseDateMs(row.current_period_end);
    if (endMs === null || endMs <= nowMs) {
      return null;
    }

    return {
      planId: normalizePlanId(row.plan_id || row.plan),
      currentPeriodEnd: row.current_period_end || null,
      provider: row.provider || null,
      providerSubscriptionId: row.provider_subscription_id || null,
      transactionId: row.transaction_id || null,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "plan_id, plan, current_period_end, provider, provider_subscription_id, transaction_id"
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .gte("current_period_end", nowIso)
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && (error as any)?.code !== "PGRST116") {
    throw error;
  }
  if (!data) {
    return null;
  }

  const endMs = parseDateMs(data.current_period_end);
  if (endMs === null || endMs <= nowMs) {
    return null;
  }

  return {
    planId: normalizePlanId(data.plan_id || data.plan),
    currentPeriodEnd: data.current_period_end || null,
    provider: data.provider || null,
    providerSubscriptionId: data.provider_subscription_id || null,
    transactionId: data.transaction_id || null,
  };
}
