import { supabaseAdmin } from "@/lib/supabase-admin";
import { getDatabase } from "@/lib/cloudbase-service";
import { ensureUserWallet } from "@/services/wallet-supabase";
import { ensureCloudBaseUserWallet } from "@/services/wallet-cloudbase";

export type MembershipRegion = "CN" | "INTL";

export interface ApplyMembershipDaysInput {
  region: MembershipRegion;
  userId: string;
  daysDelta: number;
  referenceId: string;
  reason: string;
  relatedTransactionId?: string | null;
}

export interface ApplyMembershipDaysResult {
  success: boolean;
  error?: string;
  newExpiresAt?: string;
  active?: boolean;
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function computeNextMembershipExpiry(current: Date | null, daysDelta: number) {
  const now = new Date();
  const base = current && current > now ? current : now;
  const next = addDays(base, daysDelta);

  if (daysDelta < 0 && next < now) {
    return now;
  }

  return next;
}

async function syncIntlMembership(input: ApplyMembershipDaysInput): Promise<ApplyMembershipDaysResult> {
  const userId = String(input.userId || "").trim();
  if (!userId) {
    return { success: false, error: "Missing userId" };
  }

  const daysDelta = Math.trunc(Number(input.daysDelta || 0));
  if (!Number.isFinite(daysDelta) || daysDelta === 0) {
    return { success: true };
  }

  try {
    const wallet = await ensureUserWallet(userId);
    const currentExp = parseIsoDate(wallet?.plan_exp || null);
    const nextExp = computeNextMembershipExpiry(currentExp, daysDelta);
    const active = nextExp > new Date();
    const nowIso = new Date().toISOString();
    const nextExpIso = nextExp.toISOString();

    await supabaseAdmin
      .from("user_wallets")
      .update({
        plan: active ? "Pro" : "Free",
        subscription_tier: active ? "Pro" : "Free",
        pro: active,
        plan_exp: active ? nextExpIso : null,
        pending_downgrade: null,
        updated_at: nowIso,
      })
      .eq("user_id", userId);

    const { data: latestSubscription } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("plan_id", "pro")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const transactionId =
      String(input.relatedTransactionId || "").trim() ||
      String(input.referenceId || "").trim();

    if (latestSubscription?.id) {
      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: active ? "active" : "expired",
          current_period_end: nextExpIso,
          transaction_id: transactionId,
          provider: "referral",
          provider_subscription_id: transactionId,
          updated_at: nowIso,
        })
        .eq("id", latestSubscription.id);
    } else if (active) {
      await supabaseAdmin.from("subscriptions").insert({
        user_id: userId,
        plan_id: "pro",
        status: "active",
        current_period_start: nowIso,
        current_period_end: nextExpIso,
        cancel_at_period_end: false,
        transaction_id: transactionId,
        provider: "referral",
        provider_subscription_id: transactionId,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    try {
      const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(userId);
      const existingMetadata =
        (userRes?.user?.user_metadata as Record<string, any> | undefined) || {};

      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...existingMetadata,
          pro: active,
          subscription_plan: active ? "pro" : "free",
          subscription_status: active ? "active" : "inactive",
          membership_expires_at: active ? nextExpIso : null,
          updated_at: nowIso,
        },
      });
    } catch {
      // Metadata sync is best effort; wallet + subscriptions remain source of truth.
    }

    return {
      success: true,
      newExpiresAt: nextExpIso,
      active,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Failed to apply membership days for INTL",
    };
  }
}

async function syncCnMembership(input: ApplyMembershipDaysInput): Promise<ApplyMembershipDaysResult> {
  const userId = String(input.userId || "").trim();
  if (!userId) {
    return { success: false, error: "Missing userId" };
  }

  const daysDelta = Math.trunc(Number(input.daysDelta || 0));
  if (!Number.isFinite(daysDelta) || daysDelta === 0) {
    return { success: true };
  }

  try {
    const db = getDatabase();
    const wallet = await ensureCloudBaseUserWallet(userId);
    const currentExp = parseIsoDate(wallet?.plan_exp || null);
    const nextExp = computeNextMembershipExpiry(currentExp, daysDelta);
    const active = nextExp > new Date();
    const nowIso = new Date().toISOString();
    const nextExpIso = nextExp.toISOString();

    await db
      .collection("user_wallets")
      .where({ user_id: userId })
      .update({
        plan: active ? "Pro" : "Free",
        subscription_tier: active ? "Pro" : "Free",
        pro: active,
        plan_exp: active ? nextExpIso : null,
        pending_downgrade: null,
        updated_at: nowIso,
      });

    const latestSubResult = await db
      .collection("subscriptions")
      .where({ user_id: userId, plan_id: "pro" })
      .orderBy("updated_at", "desc")
      .limit(1)
      .get();

    const latestSubscription = latestSubResult?.data?.[0] || null;
    const transactionId =
      String(input.relatedTransactionId || "").trim() ||
      String(input.referenceId || "").trim();

    if (latestSubscription?._id) {
      await db.collection("subscriptions").doc(latestSubscription._id).update({
        status: active ? "active" : "expired",
        current_period_end: nextExpIso,
        transaction_id: transactionId,
        provider: "referral",
        provider_subscription_id: transactionId,
        updated_at: nowIso,
      });
    } else if (active) {
      await db.collection("subscriptions").add({
        user_id: userId,
        plan_id: "pro",
        status: "active",
        current_period_start: nowIso,
        current_period_end: nextExpIso,
        cancel_at_period_end: false,
        transaction_id: transactionId,
        provider: "referral",
        provider_subscription_id: transactionId,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    await db.collection("web_users").doc(userId).update({
      pro: active,
      membership_expires_at: active ? nextExpIso : nowIso,
      updated_at: nowIso,
    });

    return {
      success: true,
      newExpiresAt: nextExpIso,
      active,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Failed to apply membership days for CN",
    };
  }
}

export async function applyMembershipDaysDelta(
  input: ApplyMembershipDaysInput
): Promise<ApplyMembershipDaysResult> {
  if (input.region === "CN") {
    return syncCnMembership(input);
  }
  return syncIntlMembership(input);
}
