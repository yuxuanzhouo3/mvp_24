import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth-utils";
import { logSecurityEvent } from "@/lib/logger";
import { readAccessTokenFromRequest } from "@/lib/auth/cookies";

function pickFirstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

/**
 * GET /api/auth/me
 * 获取当前登录用户信息
 */
export async function GET(request: NextRequest) {
  try {
    const clientIP =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const authHeader = request.headers.get("authorization");
    const bearerToken =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;
    const token = bearerToken || readAccessTokenFromRequest(request);

    if (!token) {
      return NextResponse.json(
        {
          error: "No authentication token",
          code: "NO_AUTH_TOKEN",
        },
        { status: 401 }
      );
    }

    const authResult = await verifyAuthToken(token);
    if (!authResult.success || !authResult.userId) {
      logSecurityEvent("get_user_unauthorized", undefined, clientIP, {
        reason: authResult.error || "Invalid token",
      });
      return NextResponse.json(
        {
          error: "Invalid or expired token",
          code: "INVALID_TOKEN",
        },
        { status: 401 }
      );
    }

    const user = authResult.user || {};
    const metadata = user.user_metadata || {};
    const responseUser = {
      id: user._id || user.id || authResult.userId,
      email: user.email || "",
      name: user.name || "",
      avatar: pickFirstString(
        user.avatar,
        metadata.avatar,
        metadata.avatar_url,
        metadata.picture,
        metadata.photo_url
      ),
      pro: Boolean(user.pro),
      region: user.region || (authResult.region === "CN" ? "china" : "intl"),
      subscription_plan: user.subscription_plan || "free",
      subscription_status: user.subscription_status || "inactive",
      subscription_expires_at: user.subscription_expires_at || null,
      membership_expires_at: user.membership_expires_at || null,
    };

    return NextResponse.json({
      success: true,
      user: responseUser,
    });
  } catch (error) {
    console.error("Get user error:", error);
    logSecurityEvent(
      "get_user_error",
      undefined,
      request.headers.get("x-forwarded-for") || "unknown",
      {
        error: error instanceof Error ? error.message : "Unknown error",
      }
    );

    return NextResponse.json(
      {
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
