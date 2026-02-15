import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createAuthErrorResponse } from "@/lib/auth";
import { verifyAppleSubscription } from "@/lib/apple-iap-verification";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logInfo, logError, logWarn } from "@/lib/logger";

/**
 * 获取 Apple IAP 订阅的实时状态
 * 直接从 Apple 服务器查询，不依赖本地存储
 * 
 * GET /api/payment/ios-iap/status
 * 返回：{ expiresAt, autoRenewStatus, daysLeft, isExpired }
 */
export async function GET(request: NextRequest) {
  let currentUserId: string | null = null;

  try {
    const authResult = await requireAuth(request);
    if (!authResult) {
      return createAuthErrorResponse();
    }

    const { user } = authResult;
    currentUserId = user.id;

    // 从数据库获取用户的最新 Apple IAP transaction
    const { data: subscriptions } = await supabaseAdmin
      .from("subscriptions")
      .select("id, provider_subscription_id, current_period_end")
      .eq("user_id", user.id)
      .eq("provider", "apple")
      .eq("plan_id", "pro")
      .not("provider_subscription_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No Apple IAP subscription found",
          hasSubscription: false,
        },
        { status: 404 }
      );
    }

    const subscription = subscriptions[0];
    const transactionId = subscription.provider_subscription_id;
    if (!transactionId) {
      return NextResponse.json(
        {
          success: false,
          error: "No Apple transaction id found",
          hasSubscription: false,
        },
        { status: 404 }
      );
    }

    logInfo("Querying Apple subscription status from server", {
      userId: user.id,
      transactionId,
    });

    // 从 Apple 服务器获取实时的订阅信息
    const useProduction = process.env.NODE_ENV === "production";
    const verificationResult = await verifyAppleSubscription(
      transactionId,
      process.env.APPLE_BUNDLE_ID || "",
      undefined, // status 场景不强制校验 productId
      useProduction
    );

    const hasRealtimeExpiry =
      typeof verificationResult.expiresDate === "number" &&
      Number.isFinite(verificationResult.expiresDate);

    if (!hasRealtimeExpiry) {
      // ⚠️ Apple 查询失败，可能是网络问题或凭证问题
      logWarn("Failed to query Apple subscription status", {
        userId: user.id,
        transactionId,
        error: verificationResult.errorMessage,
      });

      // 降级：优先使用最新订阅缓存，再退化到用户 metadata
      const { data: records } = await supabaseAdmin
        .from("subscriptions")
        .select("current_period_end")
        .eq("user_id", user.id)
        .eq("provider", "apple")
        .not("current_period_end", "is", null)
        .order("current_period_end", { ascending: false })
        .limit(1);

      const cachedFromSubscription =
        records && records.length > 0 ? records[0].current_period_end : null;
      const cachedFromMetadata =
        typeof user.user_metadata?.membership_expires_at === "string"
          ? user.user_metadata.membership_expires_at
          : null;
      const expiresAt = cachedFromSubscription || cachedFromMetadata;

      if (!expiresAt) {
        return NextResponse.json({
          success: false,
          error: "Cannot query Apple status and no cached data available",
          hasSubscription: false,
        }, { status: 500 });
      }

      const now = new Date();
      const expiresDate = new Date(expiresAt);
      if (Number.isNaN(expiresDate.getTime())) {
        return NextResponse.json(
          {
            success: false,
            error: "Cached expiration data is invalid",
            hasSubscription: false,
          },
          { status: 500 }
        );
      }
      const daysLeft = Math.ceil((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isExpired = expiresDate <= now;

      return NextResponse.json({
        success: true,
        hasSubscription: true,
        transactionId,
        expiresAt,
        expiresAtMs: expiresDate.getTime(),
        autoRenewStatus: false,
        daysLeft,
        isExpired,
        source: "cached", // ⚠️ 数据不是实时的
        warning: "Using cached data from last verification",
      });
    }

    // ✅ Apple 查询成功，获得实时数据
    const expiresAt = verificationResult.expiresDate!;
    const autoRenewStatus = verificationResult.autoRenewStatus;
    const expiresAtIso = new Date(expiresAt).toISOString();
    const nowIso = new Date().toISOString();
    const nowTs = Date.now();
    const isExpired = expiresAt <= nowTs;
    const persistedStatus = isExpired ? "canceled" : "active";

    logInfo("✅ Got real-time Apple subscription status", {
      userId: user.id,
      transactionId,
      expiresAt: expiresAtIso,
      autoRenewStatus,
    });

    // 维护本地缓存，作为降级数据与统一展示来源
    try {
      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: persistedStatus,
          current_period_end: expiresAtIso,
          updated_at: nowIso,
        })
        .eq("id", subscription.id);
    } catch (cacheErr) {
      logWarn("Failed to cache Apple expiration to subscriptions", {
        userId: user.id,
        transactionId,
        error: cacheErr,
      });
    }

    try {
      let existingMetadata: Record<string, any> = {};
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(user.id);
        existingMetadata = (userData?.user?.user_metadata as Record<string, any>) || {};
      } catch (metadataReadErr) {
        logWarn("Failed to read existing user metadata before Apple status merge", {
          userId: user.id,
          transactionId,
          error: metadataReadErr,
        });
      }

      const previousPlan = String(
        existingMetadata.subscription_plan ||
          user.user_metadata?.subscription_plan ||
          "free"
      ).toLowerCase();
      const previousStatus = String(
        existingMetadata.subscription_status ||
          user.user_metadata?.subscription_status ||
          "inactive"
      ).toLowerCase();
      const nextPlan = !isExpired
        ? "pro"
        : previousPlan === "pro"
          ? "free"
          : previousPlan;
      const nextStatus = !isExpired
        ? "active"
        : previousPlan === "pro"
          ? "inactive"
          : previousStatus;

      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...(user.user_metadata || {}),
          ...existingMetadata,
          pro: !isExpired,
          subscription_plan: nextPlan,
          subscription_status: nextStatus,
          membership_expires_at: expiresAtIso,
          updated_at: nowIso,
        },
      });
    } catch (metaErr) {
      logWarn("Failed to cache Apple expiration to user metadata", {
        userId: user.id,
        transactionId,
        error: metaErr,
      });
    }

    // 计算剩余天数
    const daysLeft = Math.ceil((expiresAt - nowTs) / (1000 * 60 * 60 * 24));

    return NextResponse.json({
      success: true,
      hasSubscription: true,
      transactionId,
      expiresAt: expiresAtIso,
      expiresAtMs: expiresAt,
      autoRenewStatus: !!autoRenewStatus,
      daysLeft,
      isExpired,
      source: "apple", // ✅ 实时数据来自 Apple
    });
  } catch (error) {
    logError(
      "Error querying Apple IAP status",
      error instanceof Error ? error : new Error(String(error)),
      { userId: currentUserId || undefined }
    );
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
