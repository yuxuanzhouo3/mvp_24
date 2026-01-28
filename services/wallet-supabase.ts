/**
 * Wallet Supabase 服务 - 国际版/国内版通用
 * 统一管理订阅配额、加油包配额，支持账单日粘性与原子扣费
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getBasicDailyLimit,
  getProDailyLimit,
  getFreeDailyLimit,
  getEnterpriseDailyLimit,
  getBasicMonthlyPhotoLimit,
  getBasicMonthlyVideoAudioLimit,
  getEnterpriseMonthlyPhotoLimit,
  getEnterpriseMonthlyVideoAudioLimit,
  getFreeMonthlyPhotoLimit,
  getFreeMonthlyVideoAudioLimit,
  getProMonthlyPhotoLimit,
  getProMonthlyVideoAudioLimit,
  getCurrentYearMonth,
  getTodayString,
} from "@/utils/model-limits";

// =============================================================================
// 类型定义
// =============================================================================

export interface UserWallet {
  user_id: string;
  plan: string;
  subscription_tier: string;
  plan_exp: string | null;
  pro: boolean;
  pending_downgrade: string | null;
  monthly_image_balance: number;
  monthly_video_balance: number;
  monthly_reset_at: string | null;
  billing_cycle_anchor: number | null;
  addon_image_balance: number;
  addon_video_balance: number;
  daily_external_day: string | null;
  daily_external_plan: string | null;
  daily_external_used: number;
  updated_at: string;
}

export interface QuotaDeductionRequest {
  userId: string;
  imageCount?: number;
  videoAudioCount?: number;
}

export interface QuotaDeductionResult {
  success: boolean;
  error?: string;
  deducted?: {
    monthly_image: number;
    monthly_video: number;
    addon_image: number;
    addon_video: number;
  };
  remaining?: {
    monthly_image_balance: number;
    monthly_video_balance: number;
    addon_image_balance: number;
    addon_video_balance: number;
  };
}

// =============================================================================
// 时间 & 账单工具（北京时间）
// =============================================================================

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

function toBeijingDate(date: Date): Date {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  return new Date(utcMs + BEIJING_OFFSET_MS);
}

export function getBeijingYMD(date: Date): {
  year: number;
  month: number;
  day: number;
} {
  const bj = toBeijingDate(date);
  return { year: bj.getFullYear(), month: bj.getMonth() + 1, day: bj.getDate() };
}

function beijingMidnightUtcMs(ymd: {
  year: number;
  month: number;
  day: number;
}): number {
  return Date.UTC(ymd.year, ymd.month - 1, ymd.day, -8, 0, 0);
}

function daysInMonth(year: number, month1Based: number): number {
  return new Date(year, month1Based, 0).getDate();
}

function clampAnchorDay(
  year: number,
  month1Based: number,
  anchorDay: number
): number {
  return Math.min(anchorDay, daysInMonth(year, month1Based));
}

/**
 * 计算"下一个账单日"对应的北京日期（支持月末粘性：31 -> 28/29 -> 回弹 31）
 */
export function getNextBillingDateSticky(
  currentDate: Date,
  anchorDay: number
): Date {
  const { year, month } = getBeijingYMD(currentDate);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const day = clampAnchorDay(nextYear, nextMonth, anchorDay);
  const utcMs = beijingMidnightUtcMs({ year: nextYear, month: nextMonth, day });
  return new Date(utcMs);
}

/**
 * 日历月累加，保持账单锚点（含月末粘性）
 */
export function addCalendarMonths(
  baseDate: Date,
  months: number,
  anchorDay: number
): Date {
  let current = baseDate;
  for (let i = 0; i < months; i++) {
    current = getNextBillingDateSticky(current, anchorDay);
  }
  return current;
}

/**
 * 基于 billing_cycle_anchor 和 last_reset_at 计算当前账期是否应重置
 */
export function computePaidResetState(
  lastResetIso?: string,
  anchorDay?: number,
  now: Date = new Date()
): { due: boolean; anchorIso: string; anchorDay: number } {
  const nowYmd = getBeijingYMD(now);
  const nowMidnight = beijingMidnightUtcMs(nowYmd);

  let resolvedAnchorDay =
    anchorDay && anchorDay >= 1 && anchorDay <= 31 ? anchorDay : nowYmd.day;
  let baseDate = now;
  let invalidBase = true;

  if (lastResetIso) {
    const last = new Date(lastResetIso);
    if (!Number.isNaN(last.getTime())) {
      baseDate = last;
      invalidBase = false;
      if (!anchorDay) {
        resolvedAnchorDay = getBeijingYMD(last).day;
      }
    }
  }

  const baseYmd = getBeijingYMD(baseDate);
  const anchorYmd = {
    year: baseYmd.year,
    month: baseYmd.month,
    day: clampAnchorDay(baseYmd.year, baseYmd.month, resolvedAnchorDay),
  };

  let anchorMidnight = beijingMidnightUtcMs(anchorYmd);
  let nextDate = getNextBillingDateSticky(
    new Date(anchorMidnight),
    resolvedAnchorDay
  );
  let nextMidnight = nextDate.getTime();
  let due = invalidBase;

  while (nowMidnight >= nextMidnight) {
    due = true;
    anchorMidnight = nextMidnight;
    nextDate = getNextBillingDateSticky(
      new Date(anchorMidnight),
      resolvedAnchorDay
    );
    nextMidnight = nextDate.getTime();
  }

  return {
    due,
    anchorIso: new Date(anchorMidnight).toISOString(),
    anchorDay: resolvedAnchorDay,
  };
}

// =============================================================================
// 默认钱包
// =============================================================================

export function createDefaultWallet(userId: string): Partial<UserWallet> {
  const today = new Date();
  const anchorDay = getBeijingYMD(today).day;
  return {
    user_id: userId,
    plan: "Free",
    subscription_tier: "Free",
    plan_exp: null,
    pro: false,
    pending_downgrade: null,
    monthly_image_balance: getFreeMonthlyPhotoLimit(),
    monthly_video_balance: getFreeMonthlyVideoAudioLimit(),
    monthly_reset_at: new Date(
      beijingMidnightUtcMs(getBeijingYMD(today))
    ).toISOString(),
    billing_cycle_anchor: anchorDay,
    addon_image_balance: 0,
    addon_video_balance: 0,
    daily_external_day: getTodayString(),
    daily_external_plan: "free",
    daily_external_used: 0,
    updated_at: new Date().toISOString(),
  };
}

// =============================================================================
// 钱包操作
// =============================================================================

export function getPlanMediaLimits(planLower: string): {
  imageLimit: number;
  videoLimit: number;
} {
  const plan = (planLower || "").toLowerCase();
  switch (plan) {
    case "basic":
      return {
        imageLimit: getBasicMonthlyPhotoLimit(),
        videoLimit: getBasicMonthlyVideoAudioLimit(),
      };
    case "pro":
      return {
        imageLimit: getProMonthlyPhotoLimit(),
        videoLimit: getProMonthlyVideoAudioLimit(),
      };
    case "enterprise":
      return {
        imageLimit: getEnterpriseMonthlyPhotoLimit(),
        videoLimit: getEnterpriseMonthlyVideoAudioLimit(),
      };
    default:
      return {
        imageLimit: getFreeMonthlyPhotoLimit(),
        videoLimit: getFreeMonthlyVideoAudioLimit(),
      };
  }
}

export function getPlanDailyLimit(planLower: string): number {
  const plan = (planLower || "").toLowerCase();
  switch (plan) {
    case "basic":
      return getBasicDailyLimit();
    case "pro":
      return getProDailyLimit();
    case "enterprise":
      return getEnterpriseDailyLimit();
    default:
      return getFreeDailyLimit();
  }
}

export async function getUserWallet(userId: string): Promise<UserWallet | null> {
  if (!supabaseAdmin) {
    console.warn("[wallet] supabaseAdmin not available");
    return null;
  }
  try {
    const { data, error } = await supabaseAdmin
      .from("user_wallets")
      .select("*")
      .eq("user_id", userId)
      .single();
    if (error) {
      if (error.code === "PGRST116") return null;
      console.error("[wallet] Error fetching wallet:", error);
      return null;
    }
    return data as UserWallet;
  } catch (error) {
    console.error("[wallet] Error fetching wallet:", error);
    return null;
  }
}

export async function ensureUserWallet(
  userId: string
): Promise<UserWallet | null> {
  if (!supabaseAdmin) {
    console.warn("[wallet] supabaseAdmin not available");
    return null;
  }

  let wallet = await getUserWallet(userId);
  if (!wallet) {
    const defaultWallet = createDefaultWallet(userId);
    const { data, error } = await supabaseAdmin
      .from("user_wallets")
      .insert(defaultWallet)
      .select()
      .single();
    if (error) {
      console.error("[wallet] Error creating wallet:", error);
      return null;
    }
    wallet = data as UserWallet;
  }

  return wallet;
}

/**
 * 确保钱包存在，并按套餐初始化/懒刷新月度配额（含账单锚点）
 */
function normalizePlanLabel(planLower: string): string {
  const lower = (planLower || "").toLowerCase();
  if (lower === "basic" || lower === "基础版") return "Basic";
  if (lower === "pro" || lower === "专业版") return "Pro";
  if (lower === "enterprise" || lower === "企业版") return "Enterprise";
  return "Free";
}

export async function seedWalletForPlan(
  userId: string,
  planLowerInput: string,
  options?: { forceReset?: boolean; expired?: boolean }
): Promise<UserWallet | null> {
  if (!supabaseAdmin) {
    console.warn("[wallet] supabaseAdmin not available");
    return null;
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // 1) 并行获取钱包与活跃订阅（最高优先级/最新）
  const [walletRes, subRes] = await Promise.all([
    getUserWallet(userId),
    supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let wallet = walletRes;
  const activeSub = subRes.error ? null : subRes.data;

  // 2) 判定真实 Plan（自愈）
  let effectivePlan = (planLowerInput || "free").toLowerCase();
  let effectivePlanExp: string | null = null;
  if (activeSub) {
    const subExpiresAt = activeSub.expires_at
      ? new Date(activeSub.expires_at)
      : null;
    if (!subExpiresAt || subExpiresAt > now) {
      effectivePlan = (activeSub.plan || "free").toLowerCase();
      effectivePlanExp = activeSub.expires_at || null;
    } else {
      console.warn(`[wallet] active subscription expired for user ${userId}`);
    }
  }
  if (options?.expired) {
    effectivePlan = "free";
  }

  const isFreePlan = effectivePlan === "free";
  const isPaidPlan = !isFreePlan;
  const baseLimits = getPlanMediaLimits(effectivePlan);

  // 3) 新钱包初始化
  if (!wallet) {
    const anchorDay = getBeijingYMD(now).day;
    const monthlyResetAt = new Date(
      beijingMidnightUtcMs({
        ...getBeijingYMD(now),
        day: clampAnchorDay(now.getFullYear(), now.getMonth() + 1, anchorDay),
      })
    ).toISOString();

    const newWallet: Partial<UserWallet> = {
      user_id: userId,
      plan: isFreePlan
        ? "Free"
        : effectivePlan.charAt(0).toUpperCase() + effectivePlan.slice(1),
      subscription_tier: isFreePlan
        ? "Free"
        : effectivePlan.charAt(0).toUpperCase() + effectivePlan.slice(1),
      plan_exp: effectivePlanExp,
      pro: effectivePlan !== "free" && effectivePlan !== "basic",
      pending_downgrade: null,
      monthly_image_balance: baseLimits.imageLimit,
      monthly_video_balance: baseLimits.videoLimit,
      monthly_reset_at: monthlyResetAt,
      billing_cycle_anchor: anchorDay,
      addon_image_balance: 0,
      addon_video_balance: 0,
      daily_external_day: getTodayString(),
      daily_external_plan: effectivePlan,
      daily_external_used: 0,
      updated_at: nowIso,
    };

    const { data, error } = await supabaseAdmin
      .from("user_wallets")
      .insert(newWallet)
      .select()
      .single();

    if (error) {
      console.error("[wallet] Error creating wallet:", error);
      return null;
    }

    return data as UserWallet;
  }

  // 4) 懒刷新/状态同步
  let needUpdate = false;
  const updatePayload: Partial<UserWallet> = { updated_at: nowIso };

  const walletMonthKey = wallet.monthly_reset_at
    ? new Date(wallet.monthly_reset_at).toISOString().slice(0, 7)
    : null;
  const currentMonthKey = getCurrentYearMonth();

  // 4.1 校正 plan
  const walletPlanLower = (wallet.plan || "free").toLowerCase();
  if (walletPlanLower !== effectivePlan) {
    updatePayload.plan = isFreePlan
      ? "Free"
      : effectivePlan.charAt(0).toUpperCase() + effectivePlan.slice(1);
    updatePayload.subscription_tier = updatePayload.plan;
    updatePayload.pro = effectivePlan !== "free" && effectivePlan !== "basic";
    updatePayload.plan_exp = effectivePlanExp;

    // 降级 -> 立即按 Free 重置
    if (isFreePlan) {
      updatePayload.monthly_image_balance = baseLimits.imageLimit;
      updatePayload.monthly_video_balance = baseLimits.videoLimit;
      updatePayload.monthly_reset_at = nowIso;
      updatePayload.billing_cycle_anchor =
        wallet.billing_cycle_anchor ?? getBeijingYMD(now).day;
      // 重置日额度（降级后立即生效新套餐的日额度）
      updatePayload.daily_external_used = 0;
      updatePayload.daily_external_day = getTodayString();
      updatePayload.daily_external_plan = "free";
    } else {
      // 升级/变更 -> 重置为新套餐额度，锚点仅在 forceReset 时改为今天
      updatePayload.monthly_image_balance = baseLimits.imageLimit;
      updatePayload.monthly_video_balance = baseLimits.videoLimit;
      // 重置日额度（升级后立即生效新套餐的日额度）
      updatePayload.daily_external_used = 0;
      updatePayload.daily_external_day = getTodayString();
      updatePayload.daily_external_plan = effectivePlan;
      if (options?.forceReset) {
        updatePayload.billing_cycle_anchor = getBeijingYMD(now).day;
        updatePayload.monthly_reset_at = nowIso;
      }
    }
    needUpdate = true;
  }

  // 4.2 付费用户周期刷新（当 plan 已一致且未因 plan 变更触发重置时）
  if (isPaidPlan && !needUpdate) {
    let anchorDay = wallet.billing_cycle_anchor ?? null;
    if (!anchorDay && wallet.monthly_reset_at) {
      anchorDay = getBeijingYMD(new Date(wallet.monthly_reset_at)).day;
      updatePayload.billing_cycle_anchor = anchorDay;
      needUpdate = true;
    }

    const paidResetState =
      anchorDay != null
        ? computePaidResetState(
            wallet.monthly_reset_at || undefined,
            anchorDay,
            now
          )
        : null;

    if (options?.forceReset || (paidResetState && paidResetState.due)) {
      updatePayload.monthly_image_balance = baseLimits.imageLimit;
      updatePayload.monthly_video_balance = baseLimits.videoLimit;
      updatePayload.monthly_reset_at = paidResetState
        ? paidResetState.anchorIso
        : nowIso;
      needUpdate = true;
    }
  }

  // 4.3 Free 自然月刷新（当未被 plan 校正覆盖时）
  if (isFreePlan && !needUpdate) {
    if (walletMonthKey !== currentMonthKey) {
      updatePayload.monthly_image_balance = baseLimits.imageLimit;
      updatePayload.monthly_video_balance = baseLimits.videoLimit;
      updatePayload.monthly_reset_at = nowIso;
      needUpdate = true;
    }
  }

  // 4.4 锚点补录（无重置但缺锚点）
  if (
    !needUpdate &&
    wallet.billing_cycle_anchor == null &&
    wallet.monthly_reset_at
  ) {
    updatePayload.billing_cycle_anchor = getBeijingYMD(
      new Date(wallet.monthly_reset_at)
    ).day;
    needUpdate = true;
  }

  if (needUpdate) {
    const { data, error } = await supabaseAdmin
      .from("user_wallets")
      .update(updatePayload)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("[wallet] Error updating wallet:", error);
      return wallet;
    }

    return data as UserWallet;
  }

  return wallet;
}

/**
 * 重置月度配额（升级/新购）
 */
export async function resetMonthlyQuota(
  userId: string,
  imageLimit: number,
  videoLimit: number
): Promise<{ success: boolean; error?: string }> {
  if (!supabaseAdmin) return { success: false, error: "supabaseAdmin not available" };
  try {
    const wallet = await getUserWallet(userId);
    if (!wallet) await ensureUserWallet(userId);

    const anchorDay =
      wallet?.billing_cycle_anchor ||
      (wallet?.monthly_reset_at
        ? getBeijingYMD(new Date(wallet.monthly_reset_at)).day
        : getBeijingYMD(new Date()).day);
    const paidState = computePaidResetState(
      wallet?.monthly_reset_at || undefined,
      anchorDay,
      new Date()
    );

    const { error } = await supabaseAdmin
      .from("user_wallets")
      .update({
        monthly_image_balance: imageLimit,
        monthly_video_balance: videoLimit,
        monthly_reset_at: paidState.anchorIso,
        billing_cycle_anchor: anchorDay,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) {
      console.error("[wallet] Error resetting monthly quota:", error);
      return { success: false, error: error.message };
    }

    console.log("[wallet][monthly-reset]", {
      userId,
      imageLimit,
      videoLimit,
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  } catch (error) {
    console.error("[wallet][monthly-reset-error]", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to reset monthly quota",
    };
  }
}

/**
 * FEFO 扣费 - 使用数据库 RPC 原子扣减
 */
export async function consumeQuota(
  request: QuotaDeductionRequest
): Promise<QuotaDeductionResult> {
  const { userId, imageCount = 0, videoAudioCount = 0 } = request;
  if (imageCount <= 0 && videoAudioCount <= 0) return { success: true };
  if (!supabaseAdmin) return { success: false, error: "supabaseAdmin not available" };

  try {
    const { data, error } = await supabaseAdmin.rpc("deduct_quota", {
      p_user_id: userId,
      p_image_count: imageCount,
      p_video_count: videoAudioCount,
    });

    if (error) {
      console.error("[wallet][consume-quota-rpc-error]", error);
      return { success: false, error: error.message };
    }

    const result = data as any;
    if (!result?.success) {
      return { success: false, error: result?.error || "Failed to consume quota" };
    }

    return {
      success: true,
      deducted: result.deducted,
      remaining: result.remaining,
    };
  } catch (err) {
    console.error("[wallet][consume-quota-error]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to consume quota",
    };
  }
}

/**
 * 获取钱包统计信息
 */
export async function getWalletStats(userId: string): Promise<{
  monthly: { image: number; video: number; resetAt?: string };
  addon: { image: number; video: number };
  total: { image: number; video: number };
  dailyExternal?: { used: number; day?: string };
} | null> {
  const wallet = await getUserWallet(userId);
  if (!wallet) return null;

  return {
    monthly: {
      image: wallet.monthly_image_balance,
      video: wallet.monthly_video_balance,
      resetAt: wallet.monthly_reset_at || undefined,
    },
    addon: {
      image: wallet.addon_image_balance,
      video: wallet.addon_video_balance,
    },
    total: {
      image: wallet.monthly_image_balance + wallet.addon_image_balance,
      video: wallet.monthly_video_balance + wallet.addon_video_balance,
    },
    dailyExternal: {
      used: wallet.daily_external_used || 0,
      day: wallet.daily_external_day || undefined,
    },
  };
}

/**
 * 校验外部模型每日配额
 */
export async function checkDailyExternalQuota(
  userId: string,
  planLower: string,
  count: number = 1
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  if (!supabaseAdmin) return { allowed: false, remaining: 0, limit: 0 };

  const today = getTodayString();
  const limit = getPlanDailyLimit(planLower);

  const wallet = await getUserWallet(userId);
  if (!wallet) return { allowed: false, remaining: 0, limit };

  const isNewDay = wallet.daily_external_day !== today;
  const isPlanChanged =
    !!wallet.daily_external_plan && wallet.daily_external_plan !== planLower;
  const used = isNewDay || isPlanChanged ? 0 : wallet.daily_external_used || 0;

  if (isNewDay || isPlanChanged) {
    await supabaseAdmin
      .from("user_wallets")
      .update({
        daily_external_used: 0,
        daily_external_day: today,
        daily_external_plan: planLower,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  }

  return {
    allowed: used + count <= limit,
    remaining: Math.max(0, limit - used - count),
    limit,
  };
}

export async function consumeDailyExternalQuota(
  userId: string,
  planLower: string,
  count: number = 1
): Promise<{ success: boolean; error?: string }> {
  if (!supabaseAdmin) return { success: false, error: "supabaseAdmin not available" };

  try {
    const today = getTodayString();
    const limit = getPlanDailyLimit(planLower);

    const wallet = await getUserWallet(userId);
    if (!wallet) return { success: false, error: "User wallet not found" };

    const isNewDay = wallet.daily_external_day !== today;
    const isPlanChanged =
      !!wallet.daily_external_plan && wallet.daily_external_plan !== planLower;
    const used = isNewDay || isPlanChanged ? 0 : wallet.daily_external_used || 0;
    const nextUsed = used + count;

    if (nextUsed > limit) return { success: false, error: "Insufficient daily quota" };

    const { error } = await supabaseAdmin
      .from("user_wallets")
      .update({
        daily_external_used: nextUsed,
        daily_external_day: today,
        daily_external_plan: planLower,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) {
      console.error("[wallet] Error consuming daily quota:", error);
      return { success: false, error: error.message };
    }

    console.log("[wallet][consume-daily]", {
      userId,
      planLower,
      count,
      usedBefore: used,
      usedAfter: nextUsed,
      day: today,
    });

    return { success: true };
  } catch (error) {
    console.error("[wallet][consume-daily-error]", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to consume daily quota",
    };
  }
}

/**
 * 检查是否有足够配额（总额度 = 月度 + 加油包）
 */
export async function checkQuota(
  userId: string,
  requiredImages: number = 0,
  requiredVideoAudio: number = 0
): Promise<{
  hasEnoughQuota: boolean;
  totalImageBalance: number;
  totalVideoBalance: number;
  monthlyImageBalance: number;
  monthlyVideoBalance: number;
  addonImageBalance: number;
  addonVideoBalance: number;
}> {
  const wallet = await getUserWallet(userId);
  if (!wallet) {
    return {
      hasEnoughQuota: false,
      totalImageBalance: 0,
      totalVideoBalance: 0,
      monthlyImageBalance: 0,
      monthlyVideoBalance: 0,
      addonImageBalance: 0,
      addonVideoBalance: 0,
    };
  }

  const totalImageBalance =
    wallet.monthly_image_balance + wallet.addon_image_balance;
  const totalVideoBalance =
    wallet.monthly_video_balance + wallet.addon_video_balance;

  return {
    hasEnoughQuota:
      totalImageBalance >= requiredImages &&
      totalVideoBalance >= requiredVideoAudio,
    totalImageBalance,
    totalVideoBalance,
    monthlyImageBalance: wallet.monthly_image_balance,
    monthlyVideoBalance: wallet.monthly_video_balance,
    addonImageBalance: wallet.addon_image_balance,
    addonVideoBalance: wallet.addon_video_balance,
  };
}

/**
 * 增加加油包额度
 */
export async function addAddonCredits(
  userId: string,
  imageCredits: number,
  videoAudioCredits: number
): Promise<{ success: boolean; error?: string }> {
  if (!supabaseAdmin) return { success: false, error: "supabaseAdmin not available" };
  try {
    // 确保钱包存在，否则 update 会静默失败
    await ensureUserWallet(userId);

    const { data: wallet } = await supabaseAdmin
      .from("user_wallets")
      .select("addon_image_balance, addon_video_balance")
      .eq("user_id", userId)
      .single();

    const currentImg = wallet?.addon_image_balance ?? 0;
    const currentVid = wallet?.addon_video_balance ?? 0;

    const { error } = await supabaseAdmin
      .from("user_wallets")
      .update({
        addon_image_balance: currentImg + imageCredits,
        addon_video_balance: currentVid + videoAudioCredits,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) return { success: false, error: error.message };

    console.log("[wallet][addon-credits-added]", {
      userId,
      imageCredits,
      videoAudioCredits,
      newImageBalance: currentImg + imageCredits,
      newVideoBalance: currentVid + videoAudioCredits,
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Failed to add addon credits",
    };
  }
}

/**
 * 更新订阅信息（计划/到期/Pro 标记）
 */
export async function updateSubscription(
  userId: string,
  plan: string,
  planExpIso: string,
  pro: boolean,
  pendingDowngrade: string | null
): Promise<{ success: boolean; error?: string }> {
  if (!supabaseAdmin) return { success: false, error: "supabaseAdmin not available" };
  try {
    await ensureUserWallet(userId);
    const { error } = await supabaseAdmin
      .from("user_wallets")
      .update({
        plan,
        subscription_tier: plan,
        plan_exp: planExpIso,
        pro,
        pending_downgrade: pendingDowngrade,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Failed to update subscription",
    };
  }
}

/**
 * 计算升级补差价
 *
 * 升级机制说明：
 * 1. 用户从低级套餐升级到高级套餐时，需要支付剩余订阅期内的差价
 * 2. 计算公式：(目标套餐日价 - 当前套餐日价) × 剩余天数
 * 3. 升级后，订阅到期时间保持不变，用户在剩余期间享受新套餐权益
 * 4. 到期后按新套餐价格续费
 *
 * @param currentPlanDailyPrice 当前套餐的日价格
 * @param targetPlanDailyPrice 目标套餐的日价格
 * @param remainingDays 当前订阅剩余天数
 * @param minimumPayment 最低支付金额（避免支付接口报错），默认0.01
 * @returns 升级需要支付的金额
 */
export function calculateUpgradePrice(
  currentPlanDailyPrice: number,
  targetPlanDailyPrice: number,
  remainingDays: number,
  minimumPayment: number = 0.01
): number {
  // 计算每日差价
  const dailyDifference = targetPlanDailyPrice - currentPlanDailyPrice;

  // 计算总升级价格
  const upgradePrice = dailyDifference * remainingDays;

  console.log("[wallet][calculate-upgrade-price]", {
    currentPlanDailyPrice,
    targetPlanDailyPrice,
    dailyDifference,
    remainingDays,
    rawUpgradePrice: upgradePrice,
  });

  // 确保最低支付金额（支付接口不接受0或负数）
  const finalPrice = Math.max(minimumPayment, upgradePrice);

  console.log("[wallet][calculate-upgrade-price] Final price:", finalPrice);

  return Math.round(finalPrice * 100) / 100;
}
