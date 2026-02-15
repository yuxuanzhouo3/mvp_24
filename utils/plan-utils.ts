/**
 * 套餐相关工具函数 - 统一定义，消除代码重复
 * 遵循 DRY 原则，将多处重复的函数集中管理
 */

import { isAfter } from "date-fns";

export const PLAN_RANK: Record<string, number> = {
  Free: 0,
  Basic: 1,
  Pro: 2,
  Enterprise: 3,
};

export function normalizePlanName(planName?: string | null): string {
  if (!planName) return "";
  const lower = planName.toLowerCase().trim();

  if (lower === "basic" || lower === "基础版") return "Basic";
  if (lower === "pro" || lower === "专业版") return "Pro";
  if (lower === "enterprise" || lower === "企业版") return "Enterprise";
  if (lower === "free" || lower === "免费版") return "Free";

  return planName;
}

export function getPlanLabel(planLower: string): string {
  const normalized = normalizePlanName(planLower);
  if (!normalized) return "Free";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
}

export interface PlanInfo {
  planLower: string;
  planLabel: string;
  planExp: Date | null;
  planActive: boolean;
  isPro: boolean;
  isBasic: boolean;
  isEnterprise: boolean;
  isFree: boolean;
  isUnlimited: boolean;
  rank: number;
}

export function getPlanInfo(
  userMeta?: Record<string, any> | null,
  wallet?: Record<string, any> | null
): PlanInfo {
  const rawPlan =
    wallet?.plan ||
    wallet?.subscription_tier ||
    userMeta?.plan ||
    userMeta?.subscriptionTier ||
    "";

  const rawPlanLower =
    typeof rawPlan === "string" ? rawPlan.toLowerCase().trim() : "";

  const planExpStr = wallet?.plan_exp || userMeta?.plan_exp;
  const planExp = planExpStr ? new Date(planExpStr) : null;
  const planActive = planExp ? isAfter(planExp, new Date()) : !planExpStr;

  const planLower = planActive ? rawPlanLower : "free";
  const planLabel = getPlanLabel(planLower);

  const isBasic = planLower === "basic";
  const isPro = planLower === "pro";
  const isEnterprise = planLower === "enterprise";
  const isFree = !isBasic && !isPro && !isEnterprise;
  const isUnlimited = !!(wallet?.pro || userMeta?.pro) && isFree;
  const rank = PLAN_RANK[normalizePlanName(planLower)] || 0;

  return {
    planLower,
    planLabel,
    planExp,
    planActive,
    isPro,
    isBasic,
    isEnterprise,
    isFree,
    isUnlimited,
    rank,
  };
}

export function comparePlanRank(planA: string, planB: string): number {
  const rankA = PLAN_RANK[normalizePlanName(planA)] || 0;
  const rankB = PLAN_RANK[normalizePlanName(planB)] || 0;
  return rankA - rankB;
}

export function isUpgrade(
  currentPlan: string,
  targetPlan: string,
  currentActive: boolean
): boolean {
  if (!currentActive) return false;
  return comparePlanRank(targetPlan, currentPlan) > 0;
}

export function isDowngrade(
  currentPlan: string,
  targetPlan: string,
  currentActive: boolean
): boolean {
  if (!currentActive) return false;
  return comparePlanRank(targetPlan, currentPlan) < 0;
}

export function isSamePlanRenewal(
  currentPlan: string,
  targetPlan: string,
  currentActive: boolean
): boolean {
  if (!currentActive) return false;
  return comparePlanRank(targetPlan, currentPlan) === 0;
}

export function isValidPaidUser(appUser?: {
  isPaid?: boolean;
  planExp?: string | null;
} | null): boolean {
  if (!appUser?.isPaid) return false;
  if (!appUser.planExp) return false;

  const planExpDate = new Date(appUser.planExp);
  const now = new Date();

  return planExpDate > now;
}

export function isValidProUser(appUser?: {
  isPro?: boolean;
  planExp?: string | null;
} | null): boolean {
  if (!appUser?.isPro) return false;
  if (!appUser.planExp) return false;

  const planExpDate = new Date(appUser.planExp);
  const now = new Date();

  return planExpDate > now;
}

export function truncateContextMessages<T>(messages: T[], limit: number): T[] {
  if (!Array.isArray(messages)) return [];
  if (messages.length <= limit) return messages;
  return messages.slice(-limit);
}
