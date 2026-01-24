import { getPlanPrice } from "@/constants/pricing";
import { getDEPLOY_REGION, isChinaRegion } from "@/lib/config/region";

export type AppleIapPlanId = "basic" | "pro" | "enterprise";
export type AppleIapBillingCycle = "monthly" | "yearly";

// NOTE: This module is used by client components.
// In Next.js, `process.env.X` is replaced/inlined at build time, but
// dynamic access like `process.env[key]` will NOT be inlined and often
// becomes `undefined` in the browser bundle.
// Therefore, we must reference env vars statically.
const IAP_PRODUCT_IDS: Record<
  "CN" | "INTL",
  Record<AppleIapPlanId, Record<AppleIapBillingCycle, string | undefined>>
> = {
  CN: {
    basic: {
      monthly: process.env.NEXT_PUBLIC_IAP_CN_BASIC_MONTHLY_ID,
      yearly: process.env.NEXT_PUBLIC_IAP_CN_BASIC_YEARLY_ID,
    },
    pro: {
      monthly: process.env.NEXT_PUBLIC_IAP_CN_PRO_MONTHLY_ID,
      yearly: process.env.NEXT_PUBLIC_IAP_CN_PRO_YEARLY_ID,
    },
    enterprise: {
      monthly: process.env.NEXT_PUBLIC_IAP_CN_ENTERPRISE_MONTHLY_ID,
      yearly: process.env.NEXT_PUBLIC_IAP_CN_ENTERPRISE_YEARLY_ID,
    },
  },
  INTL: {
    basic: {
      monthly: process.env.NEXT_PUBLIC_IAP_INTL_BASIC_MONTHLY_ID,
      yearly: process.env.NEXT_PUBLIC_IAP_INTL_BASIC_YEARLY_ID,
    },
    pro: {
      monthly: process.env.NEXT_PUBLIC_IAP_INTL_PRO_MONTHLY_ID,
      yearly: process.env.NEXT_PUBLIC_IAP_INTL_PRO_YEARLY_ID,
    },
    enterprise: {
      monthly: process.env.NEXT_PUBLIC_IAP_INTL_ENTERPRISE_MONTHLY_ID,
      yearly: process.env.NEXT_PUBLIC_IAP_INTL_ENTERPRISE_YEARLY_ID,
    },
  },
};

function normalizeEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getEnvProductId(
  region: "CN" | "INTL",
  planId: AppleIapPlanId,
  billingCycle: AppleIapBillingCycle
): string | undefined {
  return normalizeEnvValue(IAP_PRODUCT_IDS[region]?.[planId]?.[billingCycle]);
}

export function getAppleIapProductId(
  planId: string,
  billingCycle: AppleIapBillingCycle
): string | null {
  const normalizedPlan = (planId || "").toLowerCase() as AppleIapPlanId;
  const region = getDEPLOY_REGION();
  const envValue = getEnvProductId(region, normalizedPlan, billingCycle);
  if (envValue) return envValue;
  return null;
}

export function getAppleIapDisplayPrice(
  planId: string,
  billingCycle: AppleIapBillingCycle
): { amount: number; currency: string } {
  const isZh = isChinaRegion();
  const period = billingCycle === "yearly" ? "annual" : "monthly";
  const amount = getPlanPrice(planId, period, isZh);
  return { amount, currency: isZh ? "CNY" : "USD" };
}
