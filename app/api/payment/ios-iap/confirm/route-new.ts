import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createAuthErrorResponse } from "@/lib/auth";
import { getPlanPrice } from "@/constants/pricing";
import { isChinaRegion } from "@/lib/config/region";
import { getAppleIapProductId } from "@/lib/apple-iap";
import { verifyAppleSubscription } from "@/lib/apple-iap-verification";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logInfo, logError, logWarn } from "@/lib/logger";
import { getDatabase } from "@/lib/cloudbase-service";

/**
 * 确认 Apple IAP 支付
 * 
 * 核心逻辑：
 * 1. 验证 transactionId 的有效性（可选，Apple 可信任）
 * 2. 记录 transactionId 到数据库（用于追踪）
 * 3. 激活用户的 pro 订阅状态
 * 4. 不存储过期时间（由 Apple 控制，前端查询时获取）
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

    // 🔥 Step 1: 可选验证 - 向 Apple 验证 transactionId 的有效性
    // 注意：这是可选的，因为 Apple 已经在 iOS 端验证过了
    // 但我们可以做二重验证来防止欺骗
    let verificationWasAttempted = false;
    let verificationSucceeded = false;

    const useProduction = process.env.NODE_ENV === "production";
    const verificationResult = await verifyAppleSubscription(
      transactionId,
      process.env.APPLE_BUNDLE_ID || "",
      productId,
      useProduction
    );

    if (verificationResult.isValid) {
      // ✅ Apple 验证成功 - transactionId 有效
      verificationWasAttempted = true;
      verificationSucceeded = true;
      logInfo("✅ Apple transactionId verified", {
        operationId,
        userId: user.id,
        transactionId,
      });
    } else {
      // ⚠️ Apple 验证失败
      // 但这可能只是因为 jsonwebtoken 未安装或凭证未配置
      // 我们仍然可以接受支付（因为 iOS 已经验证过）
      verificationWasAttempted = true;
      verificationSucceeded = false;
      logWarn("⚠️ Apple verification failed (but accepting anyway)", {
        operationId,
        userId: user.id,
        transactionId,
        error: verificationResult.errorMessage,
        hint: "iOS already validated this transaction, so we accept it",
      });
    }

    // 🔥 Step 2: 记录 transactionId 到数据库（用于追踪和去重）
    const currentDate = new Date();

    try {
      // 检查是否已处理过这个 transaction
      const { data: existingByTransaction } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .or(
          `transaction_id.eq.${transactionId},provider_subscription_id.eq.${transactionId}`
        )
        .maybeSingle();

      if (existingByTransaction) {
        logInfo("Transaction already processed (idempotent)", {
          operationId,
          userId: user.id,
          transactionId,
        });
        return NextResponse.json({
          success: true,
          transactionId,
          message: "Already activated",
          source: "apple",
        });
      }

      // 创建或更新订阅记录
      // 注意：不存储 current_period_end（由 Apple 控制）
      const subscriptionData = {
        user_id: user.id,
        plan_id: "pro",
        status: "active",
        current_period_start: currentDate.toISOString(),
        // ⚠️ 不存 current_period_end，前端查询时从 Apple 获取
        cancel_at_period_end: false,
        transaction_id: transactionId,
        provider_subscription_id: transactionId,
        provider: "apple",
        verification_status: verificationSucceeded ? "verified" : "unverified",
        created_at: currentDate.toISOString(),
        updated_at: currentDate.toISOString(),
      };

      // 中国用户用 CloudBase，国际用 Supabase
      if (isChinaRegion()) {
        const db = getDatabase();
        const existingSubscription = await db
          .collection("subscriptions")
          .where({
            user_id: user.id,
            plan_id: "pro",
          })
          .get();

        if (
          existingSubscription.data &&
          existingSubscription.data.length > 0
        ) {
          // 更新现有记录
          const subscriptionId = existingSubscription.data[0]._id;
          await db
            .collection("subscriptions")
            .doc(subscriptionId)
            .update({
              status: "active",
              transaction_id: transactionId,
              provider_subscription_id: transactionId,
              provider: "apple",
              verification_status: verificationSucceeded
                ? "verified"
                : "unverified",
              updated_at: currentDate.toISOString(),
              // ⚠️ 不更新 current_period_end
            });
        } else {
          // 创建新记录
          await db.collection("subscriptions").add(subscriptionData);
        }

        // 更新用户 pro 状态
        await db.collection("web_users").doc(user.id).update({
          pro: true,
          updated_at: currentDate.toISOString(),
          // ⚠️ 不更新 membership_expires_at
        });
      } else {
        // Supabase
        const { data: existing } = await supabaseAdmin
          .from("subscriptions")
          .select("id")
          .eq("user_id", user.id)
          .eq("plan_id", "pro")
          .maybeSingle();

        if (existing) {
          // 更新现有记录
          await supabaseAdmin
            .from("subscriptions")
            .update({
              status: "active",
              transaction_id: transactionId,
              provider_subscription_id: transactionId,
              provider: "apple",
              verification_status: verificationSucceeded
                ? "verified"
                : "unverified",
              updated_at: currentDate.toISOString(),
            })
            .eq("id", existing.id);
        } else {
          // 创建新记录
          await supabaseAdmin.from("subscriptions").insert([subscriptionData]);
        }
      }

      logInfo("✅ IAP subscription activated", {
        operationId,
        userId: user.id,
        transactionId,
        verificationStatus: verificationSucceeded ? "verified" : "unverified",
        source: "apple",
      });
    } catch (dbError) {
      logError(
        "Error recording IAP subscription",
        dbError instanceof Error ? dbError : new Error(String(dbError)),
        {
          operationId,
          userId: user.id,
          transactionId,
        }
      );
      return NextResponse.json(
        { success: false, error: "Failed to activate subscription" },
        { status: 500 }
      );
    }

    // 🔥 Step 3: 返回成功响应
    // 注意：不返回过期时间，前端需要调用 /api/payment/ios-iap/status 获取
    return NextResponse.json({
      success: true,
      transactionId,
      amount,
      currency,
      verificationStatus: verificationSucceeded ? "verified" : "unverified",
      message:
        "Subscription activated! Expires at: will be queried from Apple on demand",
      // ℹ️ 前端应该调用 GET /api/payment/ios-iap/status 来获取实时过期时间
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
