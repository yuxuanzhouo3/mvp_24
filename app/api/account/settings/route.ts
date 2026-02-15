import { NextRequest, NextResponse } from "next/server";
import { isChinaRegion } from "@/lib/config/region";
import { getDatabase } from "@/lib/cloudbase-service";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { extractTokenFromHeader, verifyAuthToken } from "@/lib/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSubscriptionState(payload: {
  plan?: string | null;
  subscription_tier?: string | null;
  plan_exp?: string | null;
  pro?: boolean | null;
}) {
  const plan = (payload.plan || "").toLowerCase();
  const subscriptionTier = (payload.subscription_tier || "").toLowerCase();
  const planExp = payload.plan_exp || null;
  const isPro = !!payload.pro;

  const isPaid =
    plan === "basic" ||
    plan === "pro" ||
    plan === "enterprise" ||
    subscriptionTier === "basic" ||
    subscriptionTier === "pro" ||
    subscriptionTier === "enterprise" ||
    isPro;

  const isExpired = planExp ? new Date(planExp) < new Date() : false;
  const hasActiveSubscription = isPaid && !isExpired;

  return {
    plan: payload.plan || "Free",
    planExp,
    isPro,
    isPaid,
    isExpired,
    hasActiveSubscription,
  };
}

function withSubscriptionExpiryOverride(
  base: ReturnType<typeof getSubscriptionState>,
  expiresAt?: string | null
) {
  if (!expiresAt) {
    return base;
  }

  const expDate = new Date(expiresAt);
  if (Number.isNaN(expDate.getTime()) || expDate < new Date()) {
    return base;
  }

  return {
    ...base,
    plan: base.plan && base.plan !== "Free" ? base.plan : "Pro",
    planExp: expiresAt,
    isPro: true,
    isPaid: true,
    isExpired: false,
    hasActiveSubscription: true,
  };
}

export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const { token, error: tokenError } = extractTokenFromHeader(authHeader);

    if (tokenError || !token) {
      return NextResponse.json({ error: tokenError || "Unauthorized" }, { status: 401 });
    }

    const authResult = await verifyAuthToken(token);
    if (!authResult.success || !authResult.userId) {
      return NextResponse.json({ error: authResult.error || "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { hideAds } = body;

    if (typeof hideAds !== "boolean") {
      return NextResponse.json(
        { error: "Invalid parameter: hideAds must be a boolean" },
        { status: 400 }
      );
    }

    const userId = authResult.userId;

    if (isChinaRegion()) {
      const db = getDatabase();

      const walletResult = await db
        .collection("user_wallets")
        .where({ user_id: userId })
        .limit(1)
        .get();
      const wallet = walletResult?.data?.[0] || null;

      const userResult = await db.collection("web_users").doc(userId).get();
      const userData = userResult?.data?.[0] || userResult?.data || {};

      let state = getSubscriptionState({
        plan: wallet?.plan || userData?.plan,
        subscription_tier: wallet?.subscription_tier,
        plan_exp: wallet?.plan_exp || userData?.plan_exp,
        pro: wallet?.pro ?? userData?.pro,
      });

      if (!state.hasActiveSubscription) {
        try {
          const subscriptionResult = await db
            .collection("subscriptions")
            .where({ user_id: userId, status: "active" })
            .get();
          const latestSubscription = subscriptionResult?.data?.length
            ? [...subscriptionResult.data].sort((a: any, b: any) => {
                const aTime = new Date(a.current_period_end || 0).getTime();
                const bTime = new Date(b.current_period_end || 0).getTime();
                return bTime - aTime;
              })[0]
            : null;
          state = withSubscriptionExpiryOverride(
            state,
            latestSubscription?.current_period_end || null
          );
        } catch (subErr) {
          console.warn("[account/settings] CN subscription fallback check failed:", subErr);
        }
      }

      if (hideAds && !state.hasActiveSubscription) {
        return NextResponse.json(
          { error: "Only subscribed users can enable hide_ads" },
          { status: 403 }
        );
      }

      await db.collection("web_users").doc(userId).update({
        hide_ads: hideAds,
        updatedAt: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        data: { hide_ads: hideAds },
      });
    }

    const { data: wallet } = await supabaseAdmin
      .from("user_wallets")
      .select("plan, plan_exp, pro, subscription_tier")
      .eq("user_id", userId)
      .maybeSingle();

    let state = getSubscriptionState({
      plan: wallet?.plan,
      subscription_tier: wallet?.subscription_tier,
      plan_exp: wallet?.plan_exp,
      pro: wallet?.pro,
    });

    if (!state.hasActiveSubscription) {
      const { data: latestSub } = await supabaseAdmin
        .from("subscriptions")
        .select("current_period_end")
        .eq("user_id", userId)
        .eq("status", "active")
        .not("current_period_end", "is", null)
        .order("current_period_end", { ascending: false })
        .limit(1)
        .maybeSingle();
      state = withSubscriptionExpiryOverride(state, latestSub?.current_period_end || null);
    }

    if (hideAds && !state.hasActiveSubscription) {
      return NextResponse.json(
        { error: "Only subscribed users can enable hide_ads" },
        { status: 403 }
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        hide_ads: hideAds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { hide_ads: hideAds },
    });
  } catch (error) {
    console.error("[account/settings] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const { token, error: tokenError } = extractTokenFromHeader(authHeader);

    if (tokenError || !token) {
      return NextResponse.json({ error: tokenError || "Unauthorized" }, { status: 401 });
    }

    const authResult = await verifyAuthToken(token);
    if (!authResult.success || !authResult.userId) {
      return NextResponse.json({ error: authResult.error || "Unauthorized" }, { status: 401 });
    }

    const userId = authResult.userId;

    if (isChinaRegion()) {
      const db = getDatabase();

      const walletResult = await db
        .collection("user_wallets")
        .where({ user_id: userId })
        .limit(1)
        .get();
      const wallet = walletResult?.data?.[0] || null;

      const userResult = await db.collection("web_users").doc(userId).get();
      const userData = userResult?.data?.[0] || userResult?.data || {};

      let state = getSubscriptionState({
        plan: wallet?.plan || userData?.plan,
        subscription_tier: wallet?.subscription_tier,
        plan_exp: wallet?.plan_exp || userData?.plan_exp,
        pro: wallet?.pro ?? userData?.pro,
      });

      if (!state.hasActiveSubscription) {
        try {
          const subscriptionResult = await db
            .collection("subscriptions")
            .where({ user_id: userId, status: "active" })
            .get();
          const latestSubscription = subscriptionResult?.data?.length
            ? [...subscriptionResult.data].sort((a: any, b: any) => {
                const aTime = new Date(a.current_period_end || 0).getTime();
                const bTime = new Date(b.current_period_end || 0).getTime();
                return bTime - aTime;
              })[0]
            : null;
          state = withSubscriptionExpiryOverride(
            state,
            latestSubscription?.current_period_end || null
          );
        } catch (subErr) {
          console.warn("[account/settings] CN subscription fallback check failed:", subErr);
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          hide_ads: userData?.hide_ads ?? false,
          subscription: state,
        },
      });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("hide_ads")
      .eq("id", userId)
      .maybeSingle();

    const { data: wallet } = await supabaseAdmin
      .from("user_wallets")
      .select("plan, plan_exp, pro, subscription_tier")
      .eq("user_id", userId)
      .maybeSingle();

    let state = getSubscriptionState({
      plan: wallet?.plan,
      subscription_tier: wallet?.subscription_tier,
      plan_exp: wallet?.plan_exp,
      pro: wallet?.pro,
    });

    if (!state.hasActiveSubscription) {
      const { data: latestSub } = await supabaseAdmin
        .from("subscriptions")
        .select("current_period_end")
        .eq("user_id", userId)
        .eq("status", "active")
        .not("current_period_end", "is", null)
        .order("current_period_end", { ascending: false })
        .limit(1)
        .maybeSingle();
      state = withSubscriptionExpiryOverride(state, latestSub?.current_period_end || null);
    }

    return NextResponse.json({
      success: true,
      data: {
        hide_ads: profile?.hide_ads ?? false,
        subscription: state,
      },
    });
  } catch (error) {
    console.error("[account/settings] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
