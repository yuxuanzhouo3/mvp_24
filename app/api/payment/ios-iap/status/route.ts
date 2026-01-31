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
  try {
    const authResult = await requireAuth(request);
    if (!authResult) {
      return createAuthErrorResponse();
    }

    const { user } = authResult;
    
    // 从数据库获取用户的最新 Apple IAP transaction
    const { data: subscriptions } = await supabaseAdmin
      .from("subscriptions")
      .select("provider_subscription_id, provider")
      .eq("user_id", user.id)
      .eq("provider", "apple")
      .eq("plan_id", "pro")
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

    const transactionId = subscriptions[0].provider_subscription_id;

    logInfo("Querying Apple subscription status from server", {
      userId: user.id,
      transactionId,
    });

    // 从 Apple 服务器获取实时的订阅信息
    const useProduction = process.env.NODE_ENV === "production";
    const verificationResult = await verifyAppleSubscription(
      transactionId,
      process.env.APPLE_BUNDLE_ID || "",
      "", // productId 不需要验证，只需要查询过期时间
      useProduction
    );

    if (!verificationResult.isValid) {
      // ⚠️ Apple 查询失败，可能是网络问题或凭证问题
      logWarn("Failed to query Apple subscription status", {
        userId: user.id,
        transactionId,
        error: verificationResult.errorMessage,
      });

      // 降级：返回从数据库读取的过期时间（可能不是最新的）
      const { data: records } = await supabaseAdmin
        .from("subscriptions")
        .select("current_period_end")
        .eq("user_id", user.id)
        .eq("provider", "apple")
        .limit(1);

      if (!records || records.length === 0) {
        return NextResponse.json({
          success: false,
          error: "Cannot query Apple status and no cached data available",
          hasSubscription: false,
        }, { status: 500 });
      }

      const expiresAt = records[0].current_period_end;
      const now = new Date();
      const expiresDate = new Date(expiresAt);
      const daysLeft = Math.ceil((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isExpired = expiresDate <= now;

      return NextResponse.json({
        success: true,
        hasSubscription: true,
        expiresAt,
        daysLeft,
        isExpired,
        source: "cached", // ⚠️ 数据不是实时的
        warning: "Using cached data from last verification",
      });
    }

    // ✅ Apple 查询成功，获得实时数据
    const expiresAt = verificationResult.expiresDate;
    const autoRenewStatus = verificationResult.autoRenewStatus;

    logInfo("✅ Got real-time Apple subscription status", {
      userId: user.id,
      transactionId,
      expiresAt,
      autoRenewStatus,
    });

    // 计算剩余天数
    const now = Date.now();
    const daysLeft = Math.ceil((expiresAt! - now) / (1000 * 60 * 60 * 24));
    const isExpired = expiresAt! <= now;

    return NextResponse.json({
      success: true,
      hasSubscription: true,
      expiresAt: new Date(expiresAt!).toISOString(),
      autoRenewStatus,
      daysLeft,
      isExpired,
      source: "apple", // ✅ 实时数据来自 Apple
    });
  } catch (error) {
    logError("Error querying Apple IAP status", error instanceof Error ? error : new Error(String(error)), {
      userId: (await requireAuth(request))?.user?.id,
    });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
