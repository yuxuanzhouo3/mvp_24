import { supabaseAdmin } from "@/lib/supabase-admin";

function normalizePlan(raw?: string | null): string {
  if (!raw || typeof raw !== "string") {
    return "";
  }

  return raw.toLowerCase().trim();
}

function parseDateLike(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function pickLatestDate(values: unknown[]): Date | null {
  let latest: Date | null = null;

  for (const value of values) {
    const parsed = parseDateLike(value);
    if (!parsed) {
      continue;
    }
    if (!latest || parsed.getTime() > latest.getTime()) {
      latest = parsed;
    }
  }

  return latest;
}

export async function resolveIntlUserPlan(
  userId: string,
  userMetadata?: Record<string, any> | null
): Promise<string> {
  const now = new Date();
  const safeMetadata =
    userMetadata && typeof userMetadata === "object" ? userMetadata : {};
  const metadataPlan = normalizePlan(safeMetadata.subscription_plan);

  const { data: walletRow, error: walletError } = await supabaseAdmin
    .from("user_wallets")
    .select("plan, subscription_tier, plan_exp, pro")
    .eq("user_id", userId)
    .maybeSingle();

  // Pull the latest known subscription end time regardless of status.
  // Entitlement should be determined by expiry timestamp, not stale status/flags.
  const { data: subscriptionRow } = await supabaseAdmin
    .from("subscriptions")
    .select("current_period_end")
    .eq("user_id", userId)
    .not("current_period_end", "is", null)
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestExpiry = pickLatestDate([
    walletRow?.plan_exp,
    safeMetadata.membership_expires_at,
    safeMetadata.plan_exp,
    subscriptionRow?.current_period_end,
  ]);

  // No valid future expiry => always free.
  if (!latestExpiry || latestExpiry.getTime() <= now.getTime()) {
    return "free";
  }

  const walletPlan = normalizePlan(
    (walletRow?.plan as string | undefined) ||
      (walletRow?.subscription_tier as string | undefined)
  );
  if (walletPlan && walletPlan !== "free") {
    return walletPlan;
  }

  if (metadataPlan && metadataPlan !== "free") {
    return metadataPlan;
  }

  if (!walletError && (walletRow?.pro || safeMetadata.pro)) {
    return "pro";
  }

  return "pro";
}
