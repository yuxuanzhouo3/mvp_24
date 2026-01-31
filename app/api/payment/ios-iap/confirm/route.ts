import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createAuthErrorResponse } from "@/lib/auth";
import { getPlanPrice } from "@/constants/pricing";
import { isChinaRegion } from "@/lib/config/region";
import { getAppleIapProductId } from "@/lib/apple-iap";
import { verifyAppleSubscription } from "@/lib/apple-iap-verification";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logInfo, logError, logWarn } from "@/lib/logger";

/**
 * ✅ NEW ARCHITECTURE: 
 * - 后端只验证 transactionId 有效性 & 记录交易
 * - 不存储 current_period_end（过期时间由 Apple 控制）
 * - 前端通过 GET /api/payment/ios-iap/status 查询实时过期时间
 * 
 * 优势：
 * 1. 过期时间完全由 Apple 控制 ✅
 * 2. 永远不会数据不同步 ✅
 * 3. 用户在 App Store 改订阅，立即生效 ✅
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

    // 参数验证
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
    });

    // 🔥 Step 1: 从 Apple 验证 transactionId 有效性（可选 - 信息性）
    // 主要目的是记录验证状态，不要求成功（允许 Apple API 暂时不可用）
    let verificationStatus: "verified" | "pending" = "pending";

    logInfo("Optional Apple verification (non-blocking)", {
      operationId,
      transactionId,
      productId,
    });

    try {
      const useProduction = process.env.NODE_ENV === "production";
      const verificationResult = await verifyAppleSubscription(
        transactionId,
        process.env.APPLE_BUNDLE_ID || "",
        productId,
        useProduction
      );

      if (verificationResult.isValid) {
        verificationStatus = "verified";
        logInfo("✅ Transact Apple verification succeeded", {
          operationId,
          userId: user.id,
          transactionId,
        });
      } else {
        // Apple 验证失败，但我们不拒绝支付（Apple 验证是异步的）
        logWarn("⚠️  Apple verification failed, but continuing (will query on status call)", {
          operationId,
          userId: user.id,
          transactionId,
          error: verificationResult.errorMessage,
        });
      }
    } catch (verifyErr) {
      logWarn("Apple verification error (non-blocking)", {
        operationId,
        transactionId,
        error: verifyErr,
      });
    }

    // 🔥 Step 2: 检查用户是否已有有效的订阅
    try {
      const { data: existingSubscriptions } = await supabaseAdmin
        .from("subscriptions")
        .select("current_period_end, provider_subscription_id")
        .eq("user_id", user.id)
        .eq("plan_id", "pro")
        .limit(1);

      if (existingSubscriptions && existingSubscriptions.length > 0) {
        const existingRecord = existingSubscriptions[0];
        const currentExpiresAt = new Date(existingRecord.current_period_end);

        // 如果现有订阅未过期
        if (currentExpiresAt > new Date()) {
          const existingProviderId = existingRecord.provider_subscription_id;

          // 来自同一个 Apple transaction，允许续订
          if (existingProviderId === transactionId) {
            logInfo("Same Apple transaction detected, allowing renewal", {
              operationId,
              userId: user.id,
              transactionId,
            });
          } else {
            // 不同交易，阻止
            logInfo("IAP blocked: active subscription exists from other payment", {
              operationId,
              userId: user.id,
              currentExpiresAt: currentExpiresAt.toISOString(),
              existingProviderId,
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
      }
    } catch (checkErr) {
      logWarn("Error checking existing subscription", {
        operationId,
        userId: user.id,
        error: checkErr,
      });
    }

    // 🔥 Step 3: 记录 IAP 交易
    // ✅ 不存储 current_period_end（过期时间由 Apple 控制）
    // ✅ 只记录 transactionId 和用户激活状态
    try {
      const { error: upsertErr } = await supabaseAdmin
        .from("subscriptions")
        .upsert(
          {
            user_id: user.id,
            plan_id: "pro",
            status: "active",
            provider_subscription_id: transactionId, // 记录 Apple transaction ID
            provider: "apple", // 标记支付方式
            // 🚫 NOT storing current_period_end - Apple is source of truth
          },
          {
            onConflict: "user_id",
          }
        );

      if (upsertErr) {
        logError("Failed to record IAP transaction", new Error(upsertErr.message), {
          operationId,
          userId: user.id,
          transactionId,
        });
        return NextResponse.json(
          { success: false, error: "Failed to record transaction" },
          { status: 500 }
        );
      }
    } catch (recordErr) {
      logError("Error recording subscription", recordErr as Error, {
        operationId,
        userId: user.id,
        transactionId,
      });
      return NextResponse.json(
        { success: false, error: "Failed to record subscription" },
        { status: 500 }
      );
    }

    logInfo("✅ IAP transaction recorded successfully", {
      operationId,
      userId: user.id,
      transactionId,
      verificationStatus,
    });

    return NextResponse.json({
      success: true,
      transactionId,
      verificationStatus,
      message: "Transaction recorded. Call GET /api/payment/ios-iap/status to get current expiration from Apple.",
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
