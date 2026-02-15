import { isChinaRegion } from "@/lib/config/region";
import {
  getPlanDailyLimit,
  getPlanMediaLimits,
  seedWalletForPlan as seedSupabaseWalletForPlan,
  getWalletStats as getSupabaseWalletStats,
  checkDailyExternalQuota as checkSupabaseDailyExternalQuota,
  addAddonCredits as addSupabaseAddonCredits,
  consumeQuota as consumeSupabaseQuota,
  checkQuota as checkSupabaseQuota,
} from "@/services/wallet-supabase";
import {
  getCloudBaseUserWallet,
  seedCloudBaseWalletForPlan,
  addCloudBaseAddonCredits,
  consumeCloudBaseQuota,
} from "@/services/wallet-cloudbase";
import { getTodayString } from "@/utils/model-limits";

export { getPlanDailyLimit, getPlanMediaLimits };

export async function seedWalletForPlan(
  userId: string,
  planLower: string,
  options?: { forceReset?: boolean; expired?: boolean }
) {
  if (isChinaRegion()) {
    return seedCloudBaseWalletForPlan(userId, planLower, options);
  }
  return seedSupabaseWalletForPlan(userId, planLower, options);
}

export async function getWalletStats(userId: string): Promise<{
  monthly: { image: number; video: number; resetAt?: string };
  addon: { image: number; video: number };
  total: { image: number; video: number };
  dailyExternal?: { used: number; day?: string };
} | null> {
  if (!isChinaRegion()) {
    return getSupabaseWalletStats(userId);
  }

  const wallet = await getCloudBaseUserWallet(userId);
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

export async function checkDailyExternalQuota(
  userId: string,
  planLower: string,
  count: number = 1
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  if (!isChinaRegion()) {
    return checkSupabaseDailyExternalQuota(userId, planLower, count);
  }

  const wallet = await getCloudBaseUserWallet(userId);
  const limit = getPlanDailyLimit(planLower);
  if (!wallet) return { allowed: false, remaining: 0, limit };

  const today = getTodayString();
  const isNewDay = wallet.daily_external_day !== today;
  const isPlanChanged =
    !!wallet.daily_external_plan && wallet.daily_external_plan !== planLower;
  const used = isNewDay || isPlanChanged ? 0 : wallet.daily_external_used || 0;

  return {
    allowed: used + count <= limit,
    remaining: Math.max(0, limit - used - count),
    limit,
  };
}

export async function addAddonCredits(
  userId: string,
  imageCredits: number,
  videoAudioCredits: number
): Promise<{ success: boolean; error?: string }> {
  if (isChinaRegion()) {
    return addCloudBaseAddonCredits(userId, imageCredits, videoAudioCredits);
  }
  return addSupabaseAddonCredits(userId, imageCredits, videoAudioCredits);
}

export async function consumeQuota(request: {
  userId: string;
  imageCount?: number;
  videoAudioCount?: number;
}) {
  if (isChinaRegion()) {
    return consumeCloudBaseQuota(request);
  }
  return consumeSupabaseQuota(request);
}

export async function checkQuota(
  userId: string,
  requiredImages: number = 0,
  requiredVideoAudio: number = 0
) {
  if (!isChinaRegion()) {
    return checkSupabaseQuota(userId, requiredImages, requiredVideoAudio);
  }

  const wallet = await getCloudBaseUserWallet(userId);
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
      totalImageBalance >= requiredImages && totalVideoBalance >= requiredVideoAudio,
    totalImageBalance,
    totalVideoBalance,
    monthlyImageBalance: wallet.monthly_image_balance,
    monthlyVideoBalance: wallet.monthly_video_balance,
    addonImageBalance: wallet.addon_image_balance,
    addonVideoBalance: wallet.addon_video_balance,
  };
}
