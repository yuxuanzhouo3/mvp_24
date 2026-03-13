import { aiRouter } from "@/lib/ai/router";
import type { AIMessage } from "@/lib/ai/types";
import { coercePlanId, getPlanQuotaSettings } from "@/lib/plan-quota-settings";
import type {
  BillingComputation,
  BillingMetricKey,
  CreditChargeContext,
  CreditQuotaSnapshot,
  CreditReservationResult,
  CreditReservationFailureCode,
  CreditSettlementResult,
  CreditWalletSnapshot,
} from "./types";
import { getBillingSettings } from "./settings";
import { getModelCatalogEntry } from "./catalog";
import {
  addCreditLedgerEntry,
  ensureCreditWallet,
  freezeCredits,
  getAvailableCredits,
  getCreditUsageStats,
  getCurrentBillingMonthKey,
  getRawCreditWallet,
  getUsageEventByRequestId,
  releaseFrozenCredits,
  settleFrozenCredits,
  upsertUsageEvent,
} from "./wallet";
import type { CreditBucketBreakdown } from "./types";

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "string" ? Number(value) : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeMetrics(raw: Record<string, number | undefined>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(raw)
      .map(([key, value]) => [key, Math.max(0, toNumber(value, 0))] as const)
      .filter(([, value]) => value > 0)
  );
}

function parseBreakdown(raw: any): CreditBucketBreakdown {
  return {
    monthlyGrant: Math.max(0, Math.floor(toNumber(raw?.monthlyGrant ?? raw?.monthly_grant, 0))),
    bonus: Math.max(0, Math.floor(toNumber(raw?.bonus, 0))),
    recharge: Math.max(0, Math.floor(toNumber(raw?.recharge, 0))),
  };
}

function buildQuotaSnapshot(params: {
  monthlyCreditGrant: number;
  dailyCreditCap: number;
  spentThisMonth: number;
  spentToday: number;
}): CreditQuotaSnapshot {
  const monthlyGrant = Math.max(0, Math.floor(toNumber(params.monthlyCreditGrant, 0)));
  const dailyCreditCap = Math.max(0, Math.floor(toNumber(params.dailyCreditCap, 0)));
  const spentThisMonth = Math.max(0, Math.floor(toNumber(params.spentThisMonth, 0)));
  const spentToday = Math.max(0, Math.floor(toNumber(params.spentToday, 0)));

  return {
    monthlyGrant,
    dailyCreditCap,
    spentThisMonth,
    spentToday,
    remainingThisMonth: Math.max(0, monthlyGrant - spentThisMonth),
    remainingToday: dailyCreditCap > 0 ? Math.max(0, dailyCreditCap - spentToday) : 0,
  };
}

export function buildCreditReservationErrorPayload(result: CreditReservationResult) {
  const required = Math.max(0, Math.floor(toNumber(result.computation?.credits, 0)));
  const balance = Math.max(0, getAvailableCredits(result.wallet));
  const shortfall = Math.max(0, required - balance);
  const quota = result.quotaSnapshot;
  const failureCode: CreditReservationFailureCode =
    result.failureCode || "insufficient_credits";

  if (failureCode === "daily_credit_cap_exceeded") {
    const spentToday = Math.max(0, Math.floor(toNumber(quota?.spentToday, 0)));
    const dailyCap = Math.max(0, Math.floor(toNumber(quota?.dailyCreditCap, 0)));

    return {
      error: "Daily credit cap exceeded",
      code: failureCode,
      message:
        dailyCap > 0
          ? `Today's credit limit has been reached (${spentToday}/${dailyCap}). Try again tomorrow or upgrade your plan.`
          : "Today's credit limit has been reached. Try again tomorrow or upgrade your plan.",
      credits: {
        required,
        balance,
        shortfall,
      },
      quota: quota || null,
      action: "retry_tomorrow_or_upgrade",
    };
  }

  if (failureCode === "reservation_failed") {
    return {
      error: "Credit reservation failed",
      code: failureCode,
      message: "Unable to reserve credits right now. Please retry in a moment.",
      credits: {
        required,
        balance,
        shortfall,
      },
      quota: quota || null,
      action: "retry",
    };
  }

  return {
    error: "Insufficient credits",
    code: "insufficient_credits",
    message:
      required > 0
        ? `Not enough credits for this request. Need ${required}, available ${balance}. Try a cheaper model or add more credits.`
        : "Not enough credits for this request. Try a cheaper model or add more credits.",
    credits: {
      required,
      balance,
      shortfall,
    },
    quota: quota || null,
    action: "upgrade_or_top_up",
  };
}

export async function computeBillingForModel(params: {
  modelKey: string;
  metrics: Record<string, number>;
}): Promise<BillingComputation> {
  const model = await getModelCatalogEntry(params.modelKey);
  const settings = await getBillingSettings(model.region);
  const metrics = normalizeMetrics(params.metrics);
  const components = model.pricingRules
    .map((rule) => {
      const quantity = Math.max(0, toNumber(metrics[rule.metricKey], 0));
      if (quantity <= 0 || rule.price <= 0 || rule.unitSize <= 0) return null;
      const rawUnits = quantity / rule.unitSize;
      const units = rule.rounding === "none" ? rawUnits : Math.ceil(rawUnits);
      const cost = units * rule.price;
      return {
        metricKey: rule.metricKey,
        quantity,
        unitSize: rule.unitSize,
        units,
        price: rule.price,
        cost,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const costAmount = components.reduce((sum, item) => sum + item.cost, 0);
  const credits =
    costAmount <= 0
      ? 0
      : Math.max(
          settings.minimumChargeCredits,
          Math.ceil(costAmount * settings.profitMultiplier * settings.creditExchangeRate)
        );

  return {
    model,
    settings,
    metrics,
    components,
    costAmount,
    credits,
  };
}

async function countTokensWithFallback(messages: AIMessage[], modelKey: string): Promise<number> {
  try {
    const provider = await aiRouter.getProviderForModel(modelKey);
    return Math.max(0, provider.countTokens(messages, modelKey));
  } catch {
    const chars = messages.reduce((sum, item) => sum + String(item.content || "").length, 0);
    return Math.max(1, Math.ceil(chars / 4));
  }
}

export async function estimateTextMetrics(params: {
  messages: AIMessage[];
  modelKey: string;
  maxTokens?: number;
}) {
  const inputTokens = await countTokensWithFallback(params.messages, params.modelKey);
  const requestedMaxTokens = Math.max(1, Math.floor(params.maxTokens || 1024));
  // Reserve a realistic first-response budget instead of the full model max.
  // Actual usage is settled after streaming completes, so over-reserving here
  // can block short free-tier chats before the model is even called.
  const conservativeOutputBudget = Math.min(
    1800,
    Math.max(512, Math.ceil(inputTokens * 1.5))
  );
  const outputTokens = Math.max(1, Math.min(requestedMaxTokens, conservativeOutputBudget));
  return normalizeMetrics({
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    request_count: 1,
  });
}

export async function authorizeCreditUsage(
  context: CreditChargeContext
): Promise<CreditReservationResult> {
  const planId = coercePlanId(context.planId);
  const wallet = await ensureCreditWallet(context.userId, planId);
  const quota = await getPlanQuotaSettings(planId);
  const usageStats = await getCreditUsageStats(context.userId);
  const quotaSnapshot = buildQuotaSnapshot({
    monthlyCreditGrant: quota.monthlyCreditGrant,
    dailyCreditCap: quota.dailyCreditCap,
    spentThisMonth: usageStats.spentThisMonth,
    spentToday: usageStats.spentToday,
  });
  const computation = await computeBillingForModel({
    modelKey: context.modelKey,
    metrics: context.metrics,
  });

  if (quota.dailyCreditCap > 0 && usageStats.spentToday + computation.credits > quota.dailyCreditCap) {
    return {
      success: false,
      error: `Daily credit cap exceeded: ${usageStats.spentToday}/${quota.dailyCreditCap}`,
      requestId: context.requestId,
      reservedCredits: 0,
      computation,
      wallet,
      failureCode: "daily_credit_cap_exceeded",
      quotaSnapshot,
    };
  }

  if (getAvailableCredits(wallet) < computation.credits) {
    return {
      success: false,
      error: "Insufficient credits",
      requestId: context.requestId,
      reservedCredits: 0,
      computation,
      wallet,
      failureCode: "insufficient_credits",
      quotaSnapshot,
    };
  }

  const freeze = await freezeCredits({
    userId: context.userId,
    planId,
    credits: computation.credits,
    requestId: context.requestId,
    metadata: {
      ...(context.metadata || {}),
      modelKey: context.modelKey,
      metrics: computation.metrics,
    },
  });

  if (!freeze.success || !freeze.wallet || !freeze.breakdown) {
    return {
      success: false,
      error: freeze.error || "Failed to reserve credits",
      requestId: context.requestId,
      reservedCredits: 0,
      computation,
      wallet,
      failureCode: "reservation_failed",
      quotaSnapshot,
    };
  }

  await upsertUsageEvent(context.requestId, {
    user_id: context.userId,
    session_id: context.sessionId || null,
    model_key: computation.model.modelKey,
    provider: computation.model.provider,
    region: computation.model.region,
    status: "reserved",
    cost_amount: computation.costAmount,
    cost_currency: computation.model.currency,
    credits_reserved: computation.credits,
    credits_charged: 0,
    usage_metrics: computation.metrics,
    pricing_rules: computation.model.pricingRules,
    wallet_breakdown: freeze.breakdown,
    metadata: {
      planId,
      ...(context.metadata || {}),
    },
  });

  return {
    success: true,
    requestId: context.requestId,
    reservedCredits: computation.credits,
    computation,
    wallet: freeze.wallet,
  };
}

async function chargeAdditionalCredits(params: {
  userId: string;
  planId: string;
  requestId: string;
  credits: number;
}): Promise<boolean> {
  if (params.credits <= 0) return true;
  const reserve = await freezeCredits({
    userId: params.userId,
    planId: params.planId,
    credits: params.credits,
    requestId: `${params.requestId}:extra`,
    metadata: { kind: "extra_settlement" },
  });
  if (!reserve.success || !reserve.breakdown) {
    return false;
  }
  await settleFrozenCredits({
    userId: params.userId,
    requestId: `${params.requestId}:extra`,
    reservedCredits: params.credits,
    actualCredits: params.credits,
    reservedBreakdown: reserve.breakdown,
    metadata: { kind: "extra_settlement" },
  });
  return true;
}

export async function settleCreditUsage(
  context: CreditChargeContext
): Promise<CreditSettlementResult> {
  const planId = coercePlanId(context.planId);
  const existingEvent = await getUsageEventByRequestId(context.requestId);
  if (!existingEvent) {
    return {
      success: false,
      error: "Usage reservation not found",
      requestId: context.requestId,
      chargedCredits: 0,
      releasedCredits: 0,
    };
  }

  if (String(existingEvent?.status || "") === "charged") {
    const wallet = await getRawCreditWallet(context.userId);
    return {
      success: true,
      requestId: context.requestId,
      chargedCredits: Math.max(0, Math.floor(toNumber(existingEvent?.credits_charged, 0))),
      releasedCredits: Math.max(
        0,
        Math.floor(toNumber(existingEvent?.credits_reserved, 0) - toNumber(existingEvent?.credits_charged, 0))
      ),
      wallet: wallet || undefined,
    };
  }

  const computation = await computeBillingForModel({
    modelKey: context.modelKey,
    metrics: context.metrics,
  });

  const reservedCredits = Math.max(0, Math.floor(toNumber(existingEvent?.credits_reserved, 0)));
  const breakdown = parseBreakdown(existingEvent?.wallet_breakdown ?? existingEvent?.walletBreakdown);
  let actualCredits = computation.credits;

  if (actualCredits > reservedCredits) {
    const extra = actualCredits - reservedCredits;
    const ok = await chargeAdditionalCredits({
      userId: context.userId,
      planId,
      requestId: context.requestId,
      credits: extra,
    });
    if (!ok) {
      actualCredits = reservedCredits;
    }
  }

  const settled = await settleFrozenCredits({
    userId: context.userId,
    requestId: context.requestId,
    reservedCredits,
    actualCredits: Math.min(actualCredits, Math.max(actualCredits, reservedCredits)),
    reservedBreakdown: breakdown,
    metadata: {
      ...(context.metadata || {}),
      metrics: computation.metrics,
    },
  });

  const updated = await upsertUsageEvent(context.requestId, {
    user_id: context.userId,
    session_id: context.sessionId || null,
    model_key: computation.model.modelKey,
    provider: computation.model.provider,
    region: computation.model.region,
    status: "charged",
    cost_amount: computation.costAmount,
    cost_currency: computation.model.currency,
    credits_reserved: reservedCredits,
    credits_charged: actualCredits,
    usage_metrics: computation.metrics,
    pricing_rules: computation.model.pricingRules,
    wallet_breakdown: breakdown,
    metadata: {
      ...(existingEvent?.metadata || {}),
      ...(context.metadata || {}),
    },
    completed_at: new Date().toISOString(),
  });

  return {
    success: true,
    requestId: context.requestId,
    chargedCredits: actualCredits,
    releasedCredits: settled.releasedCredits,
    computation,
    wallet: settled.wallet,
  };
}

export async function releaseCreditUsageReservation(params: {
  userId: string;
  requestId: string;
  reason?: string;
}): Promise<void> {
  const event = await getUsageEventByRequestId(params.requestId);
  if (!event || String(event?.status || "") === "released") {
    return;
  }
  if (String(event?.status || "") === "charged") {
    return;
  }
  const credits = Math.max(0, Math.floor(toNumber(event?.credits_reserved, 0)));
  const breakdown = parseBreakdown(event?.wallet_breakdown ?? event?.walletBreakdown);
  if (credits > 0) {
    await releaseFrozenCredits({
      userId: params.userId,
      requestId: params.requestId,
      breakdown,
      credits,
      metadata: { reason: params.reason || "cancelled" },
    });
  }
  await upsertUsageEvent(params.requestId, {
    ...event,
    status: "released",
    completed_at: new Date().toISOString(),
    metadata: {
      ...(event?.metadata || {}),
      releasedReason: params.reason || "cancelled",
    },
  });
}

export async function getUserCreditOverview(userId: string, planId: string) {
  const plan = coercePlanId(planId);
  const quota = await getPlanQuotaSettings(plan);
  const wallet = await ensureCreditWallet(userId, plan);
  const usage = await getCreditUsageStats(userId);
  const monthKey = getCurrentBillingMonthKey();
  const monthlyLimit = quota.dailyCreditCap > 0 ? Math.max(quota.monthlyCreditGrant, quota.dailyCreditCap) : quota.monthlyCreditGrant;

  return {
    monthKey,
    planId: plan,
    wallet,
    usage,
    availableCredits: getAvailableCredits(wallet),
    monthlyGrant: quota.monthlyCreditGrant,
    dailyCreditCap: quota.dailyCreditCap,
    spentThisMonth: usage.spentThisMonth,
    spentToday: usage.spentToday,
    monthlyLimit,
    remainingThisMonth:
      monthlyLimit > 0 ? Math.max(0, monthlyLimit - usage.spentThisMonth) : 0,
  };
}
