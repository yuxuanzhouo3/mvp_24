import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPlanInfo } from "@/utils/plan-utils";

function normalizePlan(raw?: string | null): string {
  if (!raw || typeof raw !== "string") {
    return "";
  }

  return raw.toLowerCase().trim();
}

export async function resolveIntlUserPlan(
  userId: string,
  userMetadata?: Record<string, any> | null
): Promise<string> {
  const safeMetadata =
    userMetadata && typeof userMetadata === "object" ? userMetadata : {};

  const { data: walletRow, error: walletError } = await supabaseAdmin
    .from("user_wallets")
    .select("plan, subscription_tier, plan_exp, pro")
    .eq("user_id", userId)
    .maybeSingle();

  if (!walletError) {
    const planInfo = getPlanInfo(safeMetadata, walletRow || null);

    if (planInfo.planLower && planInfo.planLower !== "free") {
      if (planInfo.planExp && planInfo.planExp > new Date()) {
        return planInfo.planLower;
      }
    }

    if (planInfo.isUnlimited) {
      return "pro";
    }
  }

  const { data: subscriptionRow, error: subscriptionError } = await supabaseAdmin
    .from("subscriptions")
    .select("current_period_end")
    .eq("user_id", userId)
    .eq("status", "active")
    .not("current_period_end", "is", null)
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subscriptionError && subscriptionRow?.current_period_end) {
    const expiresAt = new Date(subscriptionRow.current_period_end);
    if (expiresAt > new Date()) {
      return "pro";
    }
  }

  const metadataPlan = normalizePlan(safeMetadata.subscription_plan);
  if (metadataPlan && metadataPlan !== "free") {
    return metadataPlan;
  }

  return "free";
}
