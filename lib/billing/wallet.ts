import { getDatabase } from "@/lib/cloudbase-service";
import { isChinaRegion } from "@/lib/config/region";
import { coercePlanId, getPlanQuotaSettings, type PlanId } from "@/lib/plan-quota-settings";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  CreditBucketBreakdown,
  CreditUsageStats,
  CreditWalletSnapshot,
} from "./types";

const WALLET_COLLECTION = "credit_wallets";
const LEDGER_COLLECTION = "credit_ledger";
const USAGE_COLLECTION = "ai_usage_events";

function currentTimeZone() {
  return isChinaRegion() ? "Asia/Shanghai" : "UTC";
}

function missingCloudbaseCollection(error: any) {
  const message = String(error?.message || "");
  const code = String(error?.code || "");
  return (
    message.includes("Db or Table not exist") ||
    message.includes("DATABASE_COLLECTION_NOT_EXIST") ||
    code.includes("DATABASE_COLLECTION_NOT_EXIST")
  );
}

async function ensureCollection(name: string) {
  const db = getDatabase();
  try {
    await db.collection(name).limit(1).get();
  } catch (error: any) {
    if (!missingCloudbaseCollection(error)) throw error;
    await db.createCollection(name);
  }
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "string" ? Number(value) : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getMonthParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: currentTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return { year, month, day };
}

export function getCurrentBillingMonthKey(date = new Date()) {
  const { year, month } = getMonthParts(date);
  return `${year}-${month}`;
}

export function getCurrentBillingDayKey(date = new Date()) {
  const { year, month, day } = getMonthParts(date);
  return `${year}-${month}-${day}`;
}

function buildWalletSnapshot(row: any, fallback?: Partial<CreditWalletSnapshot>): CreditWalletSnapshot {
  return {
    userId:
      typeof (row?.user_id ?? row?.userId) === "string"
        ? String(row?.user_id ?? row?.userId)
        : fallback?.userId || "",
    planId: coercePlanId(row?.plan_id ?? row?.planId ?? fallback?.planId),
    monthKey:
      typeof (row?.month_key ?? row?.monthKey) === "string"
        ? String(row?.month_key ?? row?.monthKey)
        : fallback?.monthKey || getCurrentBillingMonthKey(),
    monthlyGrantTotal: Math.max(
      0,
      Math.floor(
        toNumber(row?.monthly_grant_total ?? row?.monthlyGrantTotal, fallback?.monthlyGrantTotal || 0)
      )
    ),
    monthlyGrantBalance: Math.max(
      0,
      Math.floor(
        toNumber(
          row?.monthly_grant_balance ?? row?.monthlyGrantBalance,
          fallback?.monthlyGrantBalance || 0
        )
      )
    ),
    rechargeBalance: Math.max(
      0,
      Math.floor(toNumber(row?.recharge_balance ?? row?.rechargeBalance, fallback?.rechargeBalance || 0))
    ),
    bonusBalance: Math.max(
      0,
      Math.floor(toNumber(row?.bonus_balance ?? row?.bonusBalance, fallback?.bonusBalance || 0))
    ),
    frozenCredits: Math.max(
      0,
      Math.floor(toNumber(row?.frozen_credits ?? row?.frozenCredits, fallback?.frozenCredits || 0))
    ),
    lifetimeCredited: Math.max(
      0,
      Math.floor(
        toNumber(row?.lifetime_credited ?? row?.lifetimeCredited, fallback?.lifetimeCredited || 0)
      )
    ),
    lifetimeDebited: Math.max(
      0,
      Math.floor(toNumber(row?.lifetime_debited ?? row?.lifetimeDebited, fallback?.lifetimeDebited || 0))
    ),
    updatedAt:
      typeof (row?.updated_at ?? row?.updatedAt) === "string"
        ? String(row?.updated_at ?? row?.updatedAt)
        : fallback?.updatedAt ?? null,
  };
}

export function getAvailableCredits(wallet: CreditWalletSnapshot | null | undefined) {
  if (!wallet) return 0;
  return wallet.monthlyGrantBalance + wallet.bonusBalance + wallet.rechargeBalance;
}

export function allocateCreditBuckets(
  wallet: CreditWalletSnapshot,
  credits: number
): CreditBucketBreakdown {
  let remaining = Math.max(0, Math.floor(credits));
  const monthlyGrant = Math.min(wallet.monthlyGrantBalance, remaining);
  remaining -= monthlyGrant;
  const bonus = Math.min(wallet.bonusBalance, remaining);
  remaining -= bonus;
  const recharge = Math.min(wallet.rechargeBalance, remaining);
  return { monthlyGrant, bonus, recharge };
}

function applyBreakdownDebit(
  wallet: CreditWalletSnapshot,
  breakdown: CreditBucketBreakdown,
  frozenDelta: number,
  lifetimeDebitedDelta = 0,
  lifetimeCreditedDelta = 0
): CreditWalletSnapshot {
  return {
    ...wallet,
    monthlyGrantBalance: Math.max(0, wallet.monthlyGrantBalance - breakdown.monthlyGrant),
    bonusBalance: Math.max(0, wallet.bonusBalance - breakdown.bonus),
    rechargeBalance: Math.max(0, wallet.rechargeBalance - breakdown.recharge),
    frozenCredits: Math.max(0, wallet.frozenCredits + frozenDelta),
    lifetimeDebited: Math.max(0, wallet.lifetimeDebited + lifetimeDebitedDelta),
    lifetimeCredited: Math.max(0, wallet.lifetimeCredited + lifetimeCreditedDelta),
    updatedAt: new Date().toISOString(),
  };
}

function applyBreakdownCredit(
  wallet: CreditWalletSnapshot,
  breakdown: CreditBucketBreakdown,
  frozenDelta: number,
  lifetimeCreditedDelta = 0
): CreditWalletSnapshot {
  return {
    ...wallet,
    monthlyGrantBalance: Math.max(0, wallet.monthlyGrantBalance + breakdown.monthlyGrant),
    bonusBalance: Math.max(0, wallet.bonusBalance + breakdown.bonus),
    rechargeBalance: Math.max(0, wallet.rechargeBalance + breakdown.recharge),
    frozenCredits: Math.max(0, wallet.frozenCredits + frozenDelta),
    lifetimeCredited: Math.max(0, wallet.lifetimeCredited + lifetimeCreditedDelta),
    updatedAt: new Date().toISOString(),
  };
}

function createDefaultWallet(userId: string, planId: PlanId, monthlyGrant: number): CreditWalletSnapshot {
  return {
    userId,
    planId,
    monthKey: getCurrentBillingMonthKey(),
    monthlyGrantTotal: monthlyGrant,
    monthlyGrantBalance: monthlyGrant,
    rechargeBalance: 0,
    bonusBalance: 0,
    frozenCredits: 0,
    lifetimeCredited: monthlyGrant,
    lifetimeDebited: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function reconcileMonthlyGrantBalance(params: {
  existing: CreditWalletSnapshot;
  planId: PlanId;
  currentMonthKey: string;
  monthlyGrant: number;
  spentThisMonth?: number;
}) {
  const { existing, planId, currentMonthKey } = params;
  const monthlyGrant = Math.max(0, Math.floor(params.monthlyGrant));
  const spentThisMonth = Math.max(0, Math.floor(toNumber(params.spentThisMonth, 0)));

  if (existing.monthKey !== currentMonthKey) {
    const next = {
      ...existing,
      planId,
      monthKey: currentMonthKey,
      monthlyGrantTotal: monthlyGrant,
      monthlyGrantBalance: monthlyGrant,
      updatedAt: new Date().toISOString(),
      lifetimeCredited: existing.lifetimeCredited + monthlyGrant,
    };
    return {
      next,
      grantDelta: monthlyGrant,
      revokedGrantCredits: 0,
    };
  }

  if (monthlyGrant > existing.monthlyGrantTotal) {
    const grantDelta = monthlyGrant - existing.monthlyGrantTotal;
    const next = {
      ...existing,
      planId,
      monthKey: currentMonthKey,
      monthlyGrantTotal: monthlyGrant,
      monthlyGrantBalance: existing.monthlyGrantBalance + grantDelta,
      lifetimeCredited: existing.lifetimeCredited + grantDelta,
      updatedAt: new Date().toISOString(),
    };
    return {
      next,
      grantDelta,
      revokedGrantCredits: 0,
    };
  }

  if (monthlyGrant < existing.monthlyGrantTotal) {
    const nextGrantBalance = Math.min(
      existing.monthlyGrantBalance,
      Math.max(0, monthlyGrant - spentThisMonth)
    );
    const next = {
      ...existing,
      planId,
      monthKey: currentMonthKey,
      monthlyGrantTotal: monthlyGrant,
      monthlyGrantBalance: nextGrantBalance,
      updatedAt: new Date().toISOString(),
    };
    return {
      next,
      grantDelta: 0,
      revokedGrantCredits: Math.max(0, existing.monthlyGrantBalance - nextGrantBalance),
    };
  }

  return {
    next:
      existing.planId === planId
        ? existing
        : {
            ...existing,
            planId,
            updatedAt: new Date().toISOString(),
          },
    grantDelta: 0,
    revokedGrantCredits: 0,
  };
}

export async function getRawCreditWallet(userId: string): Promise<CreditWalletSnapshot | null> {
  if (isChinaRegion()) {
    try {
      await ensureCollection(WALLET_COLLECTION);
      const result = await getDatabase().collection(WALLET_COLLECTION).where({ user_id: userId }).limit(1).get();
      const row = Array.isArray(result?.data) ? result.data[0] : null;
      return row ? buildWalletSnapshot(row) : null;
    } catch (error) {
      console.error("[billing-wallet] CloudBase fetch failed:", error);
      return null;
    }
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("credit_wallets")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("[billing-wallet] Supabase fetch failed:", error);
      return null;
    }
    return data ? buildWalletSnapshot(data) : null;
  } catch (error) {
    console.error("[billing-wallet] Supabase fetch exception:", error);
    return null;
  }
}

export async function saveRawCreditWallet(wallet: CreditWalletSnapshot): Promise<void> {
  if (isChinaRegion()) {
    await ensureCollection(WALLET_COLLECTION);
    const db = getDatabase();
    const existing = await db.collection(WALLET_COLLECTION).where({ user_id: wallet.userId }).limit(1).get();
    const base = {
      user_id: wallet.userId,
      plan_id: wallet.planId,
      month_key: wallet.monthKey,
      monthly_grant_total: wallet.monthlyGrantTotal,
      monthly_grant_balance: wallet.monthlyGrantBalance,
      recharge_balance: wallet.rechargeBalance,
      bonus_balance: wallet.bonusBalance,
      frozen_credits: wallet.frozenCredits,
      lifetime_credited: wallet.lifetimeCredited,
      lifetime_debited: wallet.lifetimeDebited,
      updated_at: new Date().toISOString(),
    };
    if (Array.isArray(existing?.data) && existing.data.length > 0) {
      await db.collection(WALLET_COLLECTION).doc(existing.data[0]._id).update(base);
    } else {
      await db.collection(WALLET_COLLECTION).add({
        ...base,
        created_at: new Date().toISOString(),
      });
    }
    return;
  }

  const { error } = await supabaseAdmin.from("credit_wallets").upsert(
    {
      user_id: wallet.userId,
      plan_id: wallet.planId,
      month_key: wallet.monthKey,
      monthly_grant_total: wallet.monthlyGrantTotal,
      monthly_grant_balance: wallet.monthlyGrantBalance,
      recharge_balance: wallet.rechargeBalance,
      bonus_balance: wallet.bonusBalance,
      frozen_credits: wallet.frozenCredits,
      lifetime_credited: wallet.lifetimeCredited,
      lifetime_debited: wallet.lifetimeDebited,
    },
    { onConflict: "user_id" }
  );
  if (error) {
    throw error;
  }
}

export async function addCreditLedgerEntry(params: {
  userId: string;
  direction: string;
  entryType: string;
  credits: number;
  balanceAfter?: number;
  idempotencyKey?: string;
  requestId?: string;
  relatedUsageEventId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const payload = {
    user_id: params.userId,
    direction: params.direction,
    entry_type: params.entryType,
    credits: Math.floor(Math.max(0, params.credits)),
    balance_after:
      typeof params.balanceAfter === "number" ? Math.floor(Math.max(0, params.balanceAfter)) : null,
    idempotency_key: params.idempotencyKey || null,
    request_id: params.requestId || null,
    related_usage_event_id: params.relatedUsageEventId || null,
    metadata: params.metadata || {},
    created_at: new Date().toISOString(),
  };

  if (isChinaRegion()) {
    await ensureCollection(LEDGER_COLLECTION);
    const db = getDatabase();
    if (params.idempotencyKey) {
      const existing = await db
        .collection(LEDGER_COLLECTION)
        .where({ idempotency_key: params.idempotencyKey })
        .limit(1)
        .get();
      if (Array.isArray(existing?.data) && existing.data.length > 0) {
        return;
      }
    }
    await db.collection(LEDGER_COLLECTION).add(payload);
    return;
  }

  const { error } = await supabaseAdmin.from("credit_ledger").insert(payload);
  if (error && error.code !== "23505") {
    throw error;
  }
}

export async function getUsageEventByRequestId(requestId: string): Promise<any | null> {
  if (!requestId) return null;
  if (isChinaRegion()) {
    await ensureCollection(USAGE_COLLECTION);
    const result = await getDatabase().collection(USAGE_COLLECTION).where({ request_id: requestId }).limit(1).get();
    const row = Array.isArray(result?.data) ? result.data[0] : null;
    return row || null;
  }

  const { data, error } = await supabaseAdmin
    .from("ai_usage_events")
    .select("*")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) {
    console.error("[billing-wallet] fetch usage event failed:", error);
    return null;
  }
  return data || null;
}

export async function upsertUsageEvent(requestId: string, payload: Record<string, unknown>): Promise<any | null> {
  if (isChinaRegion()) {
    await ensureCollection(USAGE_COLLECTION);
    const db = getDatabase();
    const existing = await db.collection(USAGE_COLLECTION).where({ request_id: requestId }).limit(1).get();
    if (Array.isArray(existing?.data) && existing.data.length > 0) {
      const docId = existing.data[0]._id;
      const { _id, ...updatePayload } = payload;
      await db.collection(USAGE_COLLECTION).doc(docId).update({
        ...updatePayload,
        updated_at: new Date().toISOString(),
      });
      const refreshed = await db.collection(USAGE_COLLECTION).doc(docId).get();
      return Array.isArray(refreshed?.data) ? refreshed.data[0] : null;
    }
    await db.collection(USAGE_COLLECTION).add({
      request_id: requestId,
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const inserted = await db.collection(USAGE_COLLECTION).where({ request_id: requestId }).limit(1).get();
    return Array.isArray(inserted?.data) ? inserted.data[0] : null;
  }

  const { error } = await supabaseAdmin.from("ai_usage_events").upsert(
    {
      request_id: requestId,
      ...payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "request_id" }
  );
  if (error) {
    throw error;
  }
  return getUsageEventByRequestId(requestId);
}

export async function ensureCreditWallet(
  userId: string,
  rawPlanId: string
): Promise<CreditWalletSnapshot> {
  const planId = coercePlanId(rawPlanId);
  const quota = await getPlanQuotaSettings(planId);
  const monthlyGrant = Math.max(0, quota.monthlyCreditGrant || 0);
  const currentMonthKey = getCurrentBillingMonthKey();
  const existing = await getRawCreditWallet(userId);

  if (!existing) {
    console.log(`[billing-wallet] Creating new wallet for user ${userId}, plan ${planId}, grant ${monthlyGrant}`);
    const wallet = createDefaultWallet(userId, planId, monthlyGrant);
    try {
      await saveRawCreditWallet(wallet);
      console.log(`[billing-wallet] Successfully saved wallet for user ${userId}`);
    } catch (error) {
      console.error(`[billing-wallet] Failed to save wallet for user ${userId}:`, error);
      throw error;
    }
    if (monthlyGrant > 0) {
      await addCreditLedgerEntry({
        userId,
        direction: "credit",
        entryType: "monthly_grant",
        credits: monthlyGrant,
        balanceAfter: getAvailableCredits(wallet),
        idempotencyKey: `monthly-grant:${userId}:${currentMonthKey}:${planId}`,
        metadata: { planId, monthKey: currentMonthKey },
      });
    }
    return wallet;
  }

  const spentThisMonth =
    existing.monthKey === currentMonthKey && monthlyGrant < existing.monthlyGrantTotal
      ? (await getCreditUsageStats(userId)).spentThisMonth
      : 0;
  const { next, grantDelta, revokedGrantCredits } = reconcileMonthlyGrantBalance({
    existing,
    planId,
    currentMonthKey,
    monthlyGrant,
    spentThisMonth,
  });

  if (
    next.planId !== existing.planId ||
    next.monthKey !== existing.monthKey ||
    next.monthlyGrantBalance !== existing.monthlyGrantBalance ||
    next.monthlyGrantTotal !== existing.monthlyGrantTotal
  ) {
    await saveRawCreditWallet(next);
    if (grantDelta > 0) {
      await addCreditLedgerEntry({
        userId,
        direction: "credit",
        entryType: existing.monthKey === currentMonthKey ? "plan_upgrade_grant" : "monthly_grant",
        credits: grantDelta,
        balanceAfter: getAvailableCredits(next),
        idempotencyKey: `monthly-grant:${userId}:${currentMonthKey}:${planId}`,
        metadata: { planId, monthKey: currentMonthKey },
      });
    }
    if (revokedGrantCredits > 0) {
      await addCreditLedgerEntry({
        userId,
        direction: "debit",
        entryType: "quota_sync_revoke",
        credits: revokedGrantCredits,
        balanceAfter: getAvailableCredits(next),
        idempotencyKey: `quota-sync-revoke:${userId}:${currentMonthKey}:${planId}:${monthlyGrant}`,
        metadata: {
          planId,
          monthKey: currentMonthKey,
          previousGrant: existing.monthlyGrantTotal,
          currentGrant: monthlyGrant,
        },
      });
    }
    return next;
  }

  return existing;
}

export async function grantRechargeCredits(params: {
  userId: string;
  credits: number;
  planId?: string;
  entryType?: string;
  idempotencyKey?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}): Promise<CreditWalletSnapshot> {
  const planId = coercePlanId(params.planId || "free");
  const wallet = await ensureCreditWallet(params.userId, planId);
  const credits = Math.max(0, Math.floor(params.credits));
  if (credits <= 0) return wallet;
  const next = {
    ...wallet,
    rechargeBalance: wallet.rechargeBalance + credits,
    lifetimeCredited: wallet.lifetimeCredited + credits,
    updatedAt: new Date().toISOString(),
  };
  await saveRawCreditWallet(next);
  await addCreditLedgerEntry({
    userId: params.userId,
    direction: "credit",
    entryType: params.entryType || "recharge",
    credits,
    balanceAfter: getAvailableCredits(next),
    idempotencyKey: params.idempotencyKey,
    requestId: params.requestId,
    metadata: params.metadata,
  });
  return next;
}

export async function getCreditWalletSnapshot(
  userId: string,
  planId = "free"
): Promise<CreditWalletSnapshot> {
  return ensureCreditWallet(userId, planId);
}

export async function getCreditUsageStats(userId: string): Promise<CreditUsageStats> {
  const monthKey = getCurrentBillingMonthKey();
  const dayKey = getCurrentBillingDayKey();

  if (isChinaRegion()) {
    try {
      await ensureCollection(USAGE_COLLECTION);
      const result = await getDatabase().collection(USAGE_COLLECTION).where({ user_id: userId, status: "charged" }).limit(500).get();
      const rows = Array.isArray(result?.data) ? result.data : [];
      let spentThisMonth = 0;
      let spentToday = 0;
      let chargedRequestsThisMonth = 0;
      for (const row of rows) {
        const createdAt = typeof row?.created_at === "string" ? row.created_at : "";
        const charged = Math.max(0, Math.floor(toNumber(row?.credits_charged ?? row?.creditsCharged, 0)));
        if (createdAt.includes(monthKey)) {
          spentThisMonth += charged;
          chargedRequestsThisMonth += 1;
        }
        if (createdAt.includes(dayKey)) {
          spentToday += charged;
        }
      }
      return { spentThisMonth, spentToday, chargedRequestsThisMonth };
    } catch (error) {
      console.error("[billing-wallet] CloudBase usage stats failed:", error);
      return { spentThisMonth: 0, spentToday: 0, chargedRequestsThisMonth: 0 };
    }
  }

  try {
    const monthStart = `${monthKey}-01T00:00:00.000Z`;
    const { data, error } = await supabaseAdmin
      .from("ai_usage_events")
      .select("credits_charged, created_at")
      .eq("user_id", userId)
      .eq("status", "charged")
      .gte("created_at", monthStart);
    if (error) {
      console.error("[billing-wallet] Supabase usage stats failed:", error);
      return { spentThisMonth: 0, spentToday: 0, chargedRequestsThisMonth: 0 };
    }
    let spentThisMonth = 0;
    let spentToday = 0;
    let chargedRequestsThisMonth = 0;
    for (const row of data || []) {
      const charged = Math.max(0, Math.floor(toNumber((row as any)?.credits_charged, 0)));
      const createdAt = typeof (row as any)?.created_at === "string" ? String((row as any).created_at) : "";
      spentThisMonth += charged;
      chargedRequestsThisMonth += 1;
      if (createdAt.includes(dayKey)) {
        spentToday += charged;
      }
    }
    return { spentThisMonth, spentToday, chargedRequestsThisMonth };
  } catch (error) {
    console.error("[billing-wallet] Supabase usage stats exception:", error);
    return { spentThisMonth: 0, spentToday: 0, chargedRequestsThisMonth: 0 };
  }
}

export async function freezeCredits(params: {
  userId: string;
  planId: string;
  credits: number;
  requestId: string;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string; wallet?: CreditWalletSnapshot; breakdown?: CreditBucketBreakdown }> {
  const wallet = await ensureCreditWallet(params.userId, params.planId);
  const credits = Math.max(0, Math.floor(params.credits));
  if (credits <= 0) {
    return { success: true, wallet, breakdown: { monthlyGrant: 0, bonus: 0, recharge: 0 } };
  }

  if (getAvailableCredits(wallet) < credits) {
    return { success: false, error: "Insufficient credits", wallet };
  }

  const existingEvent = await getUsageEventByRequestId(params.requestId);
  if (existingEvent && String(existingEvent?.status || "") !== "released") {
    return {
      success: true,
      wallet,
      breakdown: existingEvent?.wallet_breakdown || existingEvent?.walletBreakdown || undefined,
    };
  }

  const breakdown = allocateCreditBuckets(wallet, credits);
  const next = applyBreakdownDebit(wallet, breakdown, credits);
  await saveRawCreditWallet(next);
  await addCreditLedgerEntry({
    userId: params.userId,
    direction: "freeze",
    entryType: "usage_reservation",
    credits,
    balanceAfter: getAvailableCredits(next),
    idempotencyKey: `freeze:${params.requestId}`,
    requestId: params.requestId,
    metadata: { ...(params.metadata || {}), breakdown },
  });
  return { success: true, wallet: next, breakdown };
}

export async function releaseFrozenCredits(params: {
  userId: string;
  requestId: string;
  breakdown: CreditBucketBreakdown;
  credits: number;
  metadata?: Record<string, unknown>;
}): Promise<CreditWalletSnapshot> {
  const wallet = await getRawCreditWallet(params.userId);
  if (!wallet) {
    throw new Error("Credit wallet not found");
  }
  const next = applyBreakdownCredit(wallet, params.breakdown, -Math.max(0, Math.floor(params.credits)));
  await saveRawCreditWallet(next);
  await addCreditLedgerEntry({
    userId: params.userId,
    direction: "release",
    entryType: "usage_release",
    credits: params.credits,
    balanceAfter: getAvailableCredits(next),
    idempotencyKey: `release:${params.requestId}`,
    requestId: params.requestId,
    metadata: { ...(params.metadata || {}), breakdown: params.breakdown },
  });
  return next;
}

export async function settleFrozenCredits(params: {
  userId: string;
  requestId: string;
  reservedCredits: number;
  actualCredits: number;
  reservedBreakdown: CreditBucketBreakdown;
  metadata?: Record<string, unknown>;
}): Promise<{ wallet: CreditWalletSnapshot; releasedCredits: number }> {
  const wallet = await getRawCreditWallet(params.userId);
  if (!wallet) {
    throw new Error("Credit wallet not found");
  }

  const reservedCredits = Math.max(0, Math.floor(params.reservedCredits));
  const actualCredits = Math.max(0, Math.floor(params.actualCredits));
  const releasedCredits = Math.max(0, reservedCredits - actualCredits);
  let next: CreditWalletSnapshot = {
    ...wallet,
    frozenCredits: Math.max(0, wallet.frozenCredits - reservedCredits),
    lifetimeDebited: wallet.lifetimeDebited + actualCredits,
    updatedAt: new Date().toISOString(),
  };

  if (releasedCredits > 0) {
    const releaseBreakdown = allocateBreakdownSlice(params.reservedBreakdown, releasedCredits);
    next = applyBreakdownCredit(next, releaseBreakdown, 0);
    await addCreditLedgerEntry({
      userId: params.userId,
      direction: "release",
      entryType: "usage_release",
      credits: releasedCredits,
      balanceAfter: getAvailableCredits(next),
      idempotencyKey: `release:${params.requestId}`,
      requestId: params.requestId,
      metadata: { ...(params.metadata || {}), breakdown: releaseBreakdown },
    });
  }

  await saveRawCreditWallet(next);
  await addCreditLedgerEntry({
    userId: params.userId,
    direction: "debit",
    entryType: "usage_charge",
    credits: actualCredits,
    balanceAfter: getAvailableCredits(next),
    idempotencyKey: `debit:${params.requestId}`,
    requestId: params.requestId,
    metadata: { ...(params.metadata || {}), breakdown: params.reservedBreakdown },
  });

  return { wallet: next, releasedCredits };
}

function allocateBreakdownSlice(
  breakdown: CreditBucketBreakdown,
  credits: number
): CreditBucketBreakdown {
  let remaining = Math.max(0, Math.floor(credits));
  const monthlyGrant = Math.min(breakdown.monthlyGrant, remaining);
  remaining -= monthlyGrant;
  const bonus = Math.min(breakdown.bonus, remaining);
  remaining -= bonus;
  const recharge = Math.min(breakdown.recharge, remaining);
  return { monthlyGrant, bonus, recharge };
}
