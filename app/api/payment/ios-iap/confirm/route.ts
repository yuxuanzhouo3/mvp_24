import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createAuthErrorResponse } from "@/lib/auth";
import { getPlanPrice } from "@/constants/pricing";
import { isChinaRegion } from "@/lib/config/region";
import { getAppleIapProductId } from "@/lib/apple-iap";
import { verifyAppleSubscription } from "@/lib/apple-iap-verification";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logInfo, logError, logWarn } from "@/lib/logger";
import {
  getActiveSubscriptionSnapshot,
  normalizePlanId,
} from "@/app/api/payment/lib/subscription-plan-guard";

async function syncUserMembershipCache(
  user: any,
  expiresAtIso: string,
  operationId: string,
  transactionId: string
) {
  try {
    let existingMetadata: Record<string, any> = {};
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(user.id);
      existingMetadata = (userData?.user?.user_metadata as Record<string, any>) || {};
    } catch (metadataReadErr) {
      logWarn("Failed to read existing user metadata before IAP merge", {
        operationId,
        userId: user.id,
        transactionId,
        error: metadataReadErr,
      });
    }

    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...(user.user_metadata || {}),
        ...existingMetadata,
        pro: true,
        subscription_plan: "pro",
        subscription_status: "active",
        membership_expires_at: expiresAtIso,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (metaErr) {
    logWarn("Failed to sync IAP membership cache to auth metadata", {
      operationId,
      userId: user.id,
      transactionId,
      error: metaErr,
    });
  }
}

/**
 * Apple IAP confirm:
 * - Apple 是过期时间真值源
 * - 本地缓存 current_period_end 与 membership_expires_at 用于降级显示
 */
export async function POST(request: NextRequest) {
  const operationId = `iap_confirm_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  try {
    const authResult = await requireAuth(request);
    if (!authResult) {
      return createAuthErrorResponse();
    }

    const { user } = authResult;
    const body = await request.json().catch(() => ({}));
    const { transactionId, productId, planId, billingCycle } = body as {
      transactionId?: string;
      productId?: string;
      planId?: string;
      billingCycle?: "monthly" | "yearly";
    };

    if (!transactionId || !productId || !planId || !billingCycle) {
      return NextResponse.json(
        { success: false, error: "Missing IAP confirmation parameters" },
        { status: 400 }
      );
    }

    if (!"monthly yearly".split(" ").includes(billingCycle)) {
      return NextResponse.json(
        { success: false, error: "Invalid billing cycle" },
        { status: 400 }
      );
    }

    const normalizedPlanId = normalizePlanId(planId);
    if (!normalizedPlanId || normalizedPlanId === "free") {
      return NextResponse.json(
        { success: false, error: "Invalid planId" },
        { status: 400 }
      );
    }

    let activePlanId: string | null = null;
    try {
      const activeSubscription = await getActiveSubscriptionSnapshot(user.id);
      activePlanId = activeSubscription?.planId || null;
    } catch (activePlanError) {
      logWarn("Failed to resolve active subscription plan before IAP confirmation", {
        operationId,
        userId: user.id,
        transactionId,
        error: activePlanError,
      });
    }

    if (activePlanId === "pro" && normalizedPlanId !== "pro") {
      logInfo("IAP blocked by pro-only renewal policy", {
        operationId,
        userId: user.id,
        transactionId,
        activePlanId,
        requestedPlanId: normalizedPlanId,
      });
      return NextResponse.json(
        {
          success: false,
          error:
            "当前已是专业版订阅，仅支持续费专业版。加油包可正常叠加购买。",
          code: "PRO_PLAN_RENEWAL_ONLY",
        },
        { status: 409 }
      );
    }

    const expectedProductId = getAppleIapProductId(normalizedPlanId, billingCycle);
    if (!expectedProductId || expectedProductId !== productId) {
      logWarn("IAP product mismatch", {
        operationId,
        userId: user.id,
        productId,
        expectedProductId,
        planId: normalizedPlanId,
        billingCycle,
      });
      return NextResponse.json(
        { success: false, error: "Invalid IAP product" },
        { status: 400 }
      );
    }

    const isZh = isChinaRegion();
    const period = billingCycle === "yearly" ? "annual" : "monthly";
    const billedDays = billingCycle === "yearly" ? 365 : 30;
    const amount = getPlanPrice(normalizedPlanId, period, isZh);
    const currency = isZh ? "CNY" : "USD";

    logInfo("IAP confirmation request", {
      operationId,
      userId: user.id,
      transactionId,
      productId,
      planId: normalizedPlanId,
      billingCycle,
    });

    const verificationStatus = "verified";
    let appleExpiresAtIso = "";
    try {
      const useProduction = process.env.NODE_ENV === "production";
      const verificationResult = await verifyAppleSubscription(
        transactionId,
        process.env.APPLE_BUNDLE_ID || "",
        productId,
        useProduction
      );

      const hasExpiresDate =
        typeof verificationResult.expiresDate === "number" &&
        Number.isFinite(verificationResult.expiresDate);

      if (!verificationResult.isValid || !hasExpiresDate) {
        logWarn("Apple verification failed (blocking)", {
          operationId,
          userId: user.id,
          transactionId,
          verificationError: verificationResult.errorMessage,
          isValid: verificationResult.isValid,
          hasExpiresDate,
        });
        return NextResponse.json(
          {
            success: false,
            error: verificationResult.errorMessage || "IAP verification failed",
          },
          { status: 400 }
        );
      }

      appleExpiresAtIso = new Date(verificationResult.expiresDate!).toISOString();

      logInfo("IAP verification completed", {
        operationId,
        userId: user.id,
        transactionId,
        verificationStatus,
        appleExpiresAt: appleExpiresAtIso,
      });
    } catch (verifyErr) {
      logWarn("Apple verification request failed (blocking)", {
        operationId,
        userId: user.id,
        transactionId,
        error: verifyErr,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Unable to verify IAP receipt with Apple",
        },
        { status: 502 }
      );
    }

    const nowIso = new Date().toISOString();

    const { data: latestSubscriptions } = await supabaseAdmin
      .from("subscriptions")
      .select("id, current_period_end, provider_subscription_id, provider")
      .eq("user_id", user.id)
      .eq("plan_id", "pro")
      .order("updated_at", { ascending: false })
      .limit(1);
    const latestSubscription =
      latestSubscriptions && latestSubscriptions.length > 0
        ? latestSubscriptions[0]
        : null;

    // 幂等：同 transaction 已处理，保证缓存字段同步后直接返回
    const { data: existingByTransaction } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .or(
        `transaction_id.eq.${transactionId},provider_subscription_id.eq.${transactionId}`
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingByTransaction?.id) {
      const finalExpiresAtIso = appleExpiresAtIso;

      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: "active",
          provider: "apple",
          provider_subscription_id: transactionId,
          transaction_id: transactionId,
          current_period_end: finalExpiresAtIso,
          verification_status: "verified",
          updated_at: nowIso,
        })
        .eq("id", existingByTransaction.id);

      await syncUserMembershipCache(
        user,
        finalExpiresAtIso,
        operationId,
        transactionId
      );

      return NextResponse.json({
        success: true,
        transactionId,
        amount,
        currency,
        daysAdded: billedDays,
        verificationStatus,
        expiresAt: finalExpiresAtIso,
        source: "apple",
        alreadyProcessed: true,
      });
    }

    // 阻止“其他支付方式的有效订阅”被 Apple 覆盖
    if (latestSubscription?.current_period_end) {
      const latestExpiresAt = new Date(latestSubscription.current_period_end);
      const latestProvider = String(latestSubscription.provider || "").toLowerCase();
      const isActive = latestExpiresAt.getTime() > Date.now();
      const sameTransaction =
        latestSubscription.provider_subscription_id === transactionId;
      const sameProvider = latestProvider === "apple";

      if (isActive && !sameProvider && !sameTransaction) {
        logInfo("IAP blocked: active subscription exists from other payment", {
          operationId,
          userId: user.id,
          transactionId,
          currentExpiresAt: latestExpiresAt.toISOString(),
          existingProvider: latestSubscription.provider,
          existingProviderId: latestSubscription.provider_subscription_id,
        });
        return NextResponse.json(
          {
            success: false,
            error: "Active subscription exists from another payment method",
          },
          { status: 409 }
        );
      }
    }

    const finalExpiresAtIso = appleExpiresAtIso;

    if (latestSubscription?.id) {
      const { error: updateErr } = await supabaseAdmin
        .from("subscriptions")
        .update({
          status: "active",
          provider: "apple",
          provider_subscription_id: transactionId,
          transaction_id: transactionId,
          current_period_end: finalExpiresAtIso,
          verification_status: "verified",
          updated_at: nowIso,
        })
        .eq("id", latestSubscription.id);

      if (updateErr) {
        logError("Failed to update IAP subscription", new Error(updateErr.message), {
          operationId,
          userId: user.id,
          transactionId,
          subscriptionId: latestSubscription.id,
        });
        return NextResponse.json(
          { success: false, error: "Failed to activate subscription" },
          { status: 500 }
        );
      }
    } else {
      const { error: insertErr } = await supabaseAdmin
        .from("subscriptions")
        .insert({
          user_id: user.id,
          plan_id: "pro",
          status: "active",
          current_period_start: nowIso,
          current_period_end: finalExpiresAtIso,
          cancel_at_period_end: false,
          transaction_id: transactionId,
          provider_subscription_id: transactionId,
          provider: "apple",
          verification_status: "verified",
          created_at: nowIso,
          updated_at: nowIso,
        });

      if (insertErr) {
        logError("Failed to create IAP subscription", new Error(insertErr.message), {
          operationId,
          userId: user.id,
          transactionId,
        });
        return NextResponse.json(
          { success: false, error: "Failed to activate subscription" },
          { status: 500 }
        );
      }
    }

    await syncUserMembershipCache(user, finalExpiresAtIso, operationId, transactionId);

    logInfo("IAP subscription activated", {
      operationId,
      userId: user.id,
      transactionId,
      verificationStatus,
      expiresAt: finalExpiresAtIso,
      source: "apple",
    });

    return NextResponse.json({
      success: true,
      transactionId,
      amount,
      currency,
      daysAdded: billedDays,
      verificationStatus,
      expiresAt: finalExpiresAtIso,
      source: "apple",
      message: "Subscription activated",
    });
  } catch (error) {
    logError(
      "IAP confirmation error",
      error instanceof Error ? error : new Error(String(error)),
      { operationId }
    );
    return NextResponse.json(
      { success: false, error: "IAP confirmation failed" },
      { status: 500 }
    );
  }
}
