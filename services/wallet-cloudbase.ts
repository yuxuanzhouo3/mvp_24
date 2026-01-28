/**
 * Wallet CloudBase 服务 - 国内版
 * 统一管理订阅配额、加油包配额，支持账单日粘性与原子扣费
 */

import { getDatabase } from "@/lib/cloudbase-service";
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

export interface CloudBaseUserWallet {
  _id?: string;
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
  created_at?: string;
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

/**
 * 获取用户钱包（CloudBase）
 */
export async function getCloudBaseUserWallet(
  userId: string
): Promise<CloudBaseUserWallet | null> {
  try {
    const db = getDatabase();
    const result = await db
      .collection("user_wallets")
      .where({ user_id: userId })
      .limit(1)
      .get();

    if (result.data && result.data.length > 0) {
      return result.data[0] as CloudBaseUserWallet;
    }
    return null;
  } catch (error) {
    console.error("[wallet-cloudbase] Error fetching wallet:", error);
    return null;
  }
}

/**
 * 创建默认钱包
 */
export function createDefaultCloudBaseWallet(
  userId: string
): Partial<CloudBaseUserWallet> {
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
    created_at: new Date().toISOString(),
  };
}

/**
 * 确保用户钱包存在
 */
export async function ensureCloudBaseUserWallet(
  userId: string
): Promise<CloudBaseUserWallet | null> {
  try {
    let wallet = await getCloudBaseUserWallet(userId);
    if (!wallet) {
      const db = getDatabase();
      const defaultWallet = createDefaultCloudBaseWallet(userId);
      await db.collection("user_wallets").add(defaultWallet);
      wallet = await getCloudBaseUserWallet(userId);
    }
    return wallet;
  } catch (error) {
    console.error("[wallet-cloudbase] Error ensuring wallet:", error);
    return null;
  }
}

/**
 * 为订阅计划初始化/刷新钱包
 */
export async function seedCloudBaseWalletForPlan(
  userId: string,
  planLowerInput: string,
  options?: { forceReset?: boolean; expired?: boolean }
): Promise<CloudBaseUserWallet | null> {
  try {
    const db = getDatabase();
    const now = new Date();
    const nowIso = now.toISOString();

    let wallet = await getCloudBaseUserWallet(userId);
    let effectivePlan = (planLowerInput || "free").toLowerCase();

    if (options?.expired) {
      effectivePlan = "free";
    }

    const isFreePlan = effectivePlan === "free";
    const baseLimits = getPlanMediaLimits(effectivePlan);

    // 新钱包初始化
    if (!wallet) {
      const anchorDay = getBeijingYMD(now).day;
      const monthlyResetAt = new Date(
        beijingMidnightUtcMs({
          ...getBeijingYMD(now),
          day: clampAnchorDay(now.getFullYear(), now.getMonth() + 1, anchorDay),
        })
      ).toISOString();

      const newWallet: Partial<CloudBaseUserWallet> = {
        user_id: userId,
        plan: isFreePlan
          ? "Free"
          : effectivePlan.charAt(0).toUpperCase() + effectivePlan.slice(1),
        subscription_tier: isFreePlan
          ? "Free"
          : effectivePlan.charAt(0).toUpperCase() + effectivePlan.slice(1),
        plan_exp: null,
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
        created_at: nowIso,
      };

      await db.collection("user_wallets").add(newWallet);
      return await getCloudBaseUserWallet(userId);
    }

    // 更新现有钱包
    const updatePayload: Partial<CloudBaseUserWallet> = { updated_at: nowIso };
    const walletPlanLower = (wallet.plan || "free").toLowerCase();

    // 计划变更或强制重置
    if (walletPlanLower !== effectivePlan || options?.forceReset) {
      updatePayload.plan = isFreePlan
        ? "Free"
        : effectivePlan.charAt(0).toUpperCase() + effectivePlan.slice(1);
      updatePayload.subscription_tier = updatePayload.plan;
      updatePayload.pro = effectivePlan !== "free" && effectivePlan !== "basic";
      updatePayload.monthly_image_balance = baseLimits.imageLimit;
      updatePayload.monthly_video_balance = baseLimits.videoLimit;
      updatePayload.monthly_reset_at = nowIso;
      updatePayload.daily_external_used = 0;
      updatePayload.daily_external_day = getTodayString();
      updatePayload.daily_external_plan = effectivePlan;

      await db
        .collection("user_wallets")
        .where({ user_id: userId })
        .update(updatePayload);

      return await getCloudBaseUserWallet(userId);
    }

    return wallet;
  } catch (error) {
    console.error("[wallet-cloudbase] Error seeding wallet:", error);
    return null;
  }
}

/**
 * 添加加油包额度（CloudBase）
 */
export async function addCloudBaseAddonCredits(
  userId: string,
  imageCredits: number,
  videoAudioCredits: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDatabase();
    const _ = db.command;

    // 确保钱包存在
    await ensureCloudBaseUserWallet(userId);

    // 使用原子操作增加额度
    await db
      .collection("user_wallets")
      .where({ user_id: userId })
      .update({
        addon_image_balance: _.inc(imageCredits),
        addon_video_balance: _.inc(videoAudioCredits),
        updated_at: new Date().toISOString(),
      });

    console.log("[wallet-cloudbase][addon-credits-added]", {
      userId,
      imageCredits,
      videoAudioCredits,
    });

    return { success: true };
  } catch (error) {
    console.error("[wallet-cloudbase] Error adding addon credits:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add addon credits",
    };
  }
}

/**
 * FEFO 扣费 - CloudBase 版本
 */
export async function consumeCloudBaseQuota(
  request: QuotaDeductionRequest
): Promise<QuotaDeductionResult> {
  const { userId, imageCount = 0, videoAudioCount = 0 } = request;
  if (imageCount <= 0 && videoAudioCount <= 0) return { success: true };

  try {
    const db = getDatabase();
    const wallet = await getCloudBaseUserWallet(userId);

    if (!wallet) {
      return { success: false, error: "Wallet not found" };
    }

    // 计算 FEFO 扣费
    let remainImage = imageCount;
    let deductedMonthlyImage = 0;
    let deductedAddonImage = 0;

    if (remainImage > 0 && wallet.monthly_image_balance > 0) {
      deductedMonthlyImage = Math.min(remainImage, wallet.monthly_image_balance);
      remainImage -= deductedMonthlyImage;
    }
    if (remainImage > 0 && wallet.addon_image_balance > 0) {
      deductedAddonImage = Math.min(remainImage, wallet.addon_image_balance);
      remainImage -= deductedAddonImage;
    }
    if (remainImage > 0) {
      return { success: false, error: "Insufficient image quota" };
    }

    let remainVideo = videoAudioCount;
    let deductedMonthlyVideo = 0;
    let deductedAddonVideo = 0;

    if (remainVideo > 0 && wallet.monthly_video_balance > 0) {
      deductedMonthlyVideo = Math.min(remainVideo, wallet.monthly_video_balance);
      remainVideo -= deductedMonthlyVideo;
    }
    if (remainVideo > 0 && wallet.addon_video_balance > 0) {
      deductedAddonVideo = Math.min(remainVideo, wallet.addon_video_balance);
      remainVideo -= deductedAddonVideo;
    }
    if (remainVideo > 0) {
      return { success: false, error: "Insufficient video quota" };
    }

    // 执行更新
    const _ = db.command;
    await db
      .collection("user_wallets")
      .where({ user_id: userId })
      .update({
        monthly_image_balance: _.inc(-deductedMonthlyImage),
        addon_image_balance: _.inc(-deductedAddonImage),
        monthly_video_balance: _.inc(-deductedMonthlyVideo),
        addon_video_balance: _.inc(-deductedAddonVideo),
        updated_at: new Date().toISOString(),
      });

    return {
      success: true,
      deducted: {
        monthly_image: deductedMonthlyImage,
        monthly_video: deductedMonthlyVideo,
        addon_image: deductedAddonImage,
        addon_video: deductedAddonVideo,
      },
      remaining: {
        monthly_image_balance: wallet.monthly_image_balance - deductedMonthlyImage,
        monthly_video_balance: wallet.monthly_video_balance - deductedMonthlyVideo,
        addon_image_balance: wallet.addon_image_balance - deductedAddonImage,
        addon_video_balance: wallet.addon_video_balance - deductedAddonVideo,
      },
    };
  } catch (error) {
    console.error("[wallet-cloudbase] Error consuming quota:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to consume quota",
    };
  }
}

/**
 * 更新订阅信息（CloudBase）
 */
export async function updateCloudBaseSubscription(
  userId: string,
  plan: string,
  planExpIso: string,
  pro: boolean,
  pendingDowngrade: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDatabase();
    await ensureCloudBaseUserWallet(userId);

    await db
      .collection("user_wallets")
      .where({ user_id: userId })
      .update({
        plan,
        subscription_tier: plan,
        plan_exp: planExpIso,
        pro,
        pending_downgrade: pendingDowngrade,
        updated_at: new Date().toISOString(),
      });

    return { success: true };
  } catch (error) {
    console.error("[wallet-cloudbase] Error updating subscription:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update subscription",
    };
  }
}
