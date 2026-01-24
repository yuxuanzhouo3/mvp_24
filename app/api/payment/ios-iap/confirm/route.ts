import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createAuthErrorResponse } from "@/lib/auth";
import { getDaysByBillingCycle } from "@/lib/payment-config";
import { extendMembership } from "@/app/api/payment/lib/extend-membership";
import { getPlanPrice } from "@/constants/pricing";
import { isChinaRegion } from "@/lib/config/region";
import { getAppleIapProductId } from "@/lib/apple-iap";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logInfo, logError, logWarn } from "@/lib/logger";

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

    const expectedProductId = getAppleIapProductId(planId, billingCycle);
    if (!expectedProductId || expectedProductId !== productId) {
      logWarn("IAP product mismatch", {
        operationId,
        userId: user.id,
        productId,
        expectedProductId,
        planId,
        billingCycle,
      });
      return NextResponse.json(
        { success: false, error: "Invalid IAP product" },
        { status: 400 }
      );
    }

    const days = getDaysByBillingCycle(billingCycle);
    const isZh = isChinaRegion();
    const period = billingCycle === "yearly" ? "annual" : "monthly";
    const amount = getPlanPrice(planId, period, isZh);
    const currency = isZh ? "CNY" : "USD";

    logInfo("IAP confirmation request", {
      operationId,
      userId: user.id,
      transactionId,
      productId,
      planId,
      billingCycle,
      days,
    });

    // 如果用户已有未过期的订阅，则阻止通过苹果内购直接订阅
    try {
      const { data: existingSubscriptions } = await supabaseAdmin
        .from("subscriptions")
        .select("current_period_end")
        .eq("user_id", user.id)
        .eq("plan_id", "pro")
        .limit(1);

      if (existingSubscriptions && existingSubscriptions.length > 0) {
        const currentExpiresAt = new Date(
          existingSubscriptions[0].current_period_end
        );
        if (currentExpiresAt > new Date()) {
          logInfo("IAP blocked: active subscription exists", {
            operationId,
            userId: user.id,
            currentExpiresAt: currentExpiresAt.toISOString(),
          });
          return NextResponse.json(
            {
              success: false,
              error: "IAP not allowed: active subscription exists",
            },
            { status: 409 }
          );
        }
      }
    } catch (checkErr) {
      logWarn("Error checking existing subscription before IAP confirm", {
        operationId,
        userId: user.id,
        error: checkErr,
      });
      // 出错时不阻断流程，继续走后续逻辑以避免误伤用户
    }

    const ok = await extendMembership(user.id, days, transactionId);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: "Unable to extend membership" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      transactionId,
      daysAdded: days,
      amount,
      currency,
    });
  } catch (error) {
    logError("IAP confirmation error", error as Error, { operationId });
    return NextResponse.json(
      { success: false, error: "IAP confirmation failed" },
      { status: 500 }
    );
  }
}
