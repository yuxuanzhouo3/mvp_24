/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token (Plan B: JWT + CloudBase DB)
 *
 * Flow:
 * 1. Verify refresh token is valid + not revoked (check CloudBase)
 * 2. Generate new accessToken (1h)
 * 3. Generate new refreshToken (7d) with rotation
 * 4. Return both tokens
 */

import { NextRequest, NextResponse } from "next/server";
import { isChinaRegion } from "@/lib/config/region";
import { getOrCreateUserProfile } from "@/lib/cloudbase-user-profile";
import { logSecurityEvent } from "@/lib/logger";
import {
  verifyRefreshToken,
  createRefreshToken,
  revokeRefreshToken,
} from "@/lib/refresh-token-manager";
import { z } from "zod";
import { signAccessToken } from "@/lib/security/jwt";
import {
  readRefreshTokenFromRequest,
  setAuthCookies,
} from "@/lib/auth/cookies";

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required").optional(),
});

/**
 * 验证和刷新 token（中国版本 - Plan B: JWT + CloudBase）
 *
 * Steps:
 * 1. Verify refresh token JWT signature + check if revoked in CloudBase
 * 2. Generate new accessToken (1h)
 * 3. Create new refreshToken (7d) with rotation
 * 4. Revoke old refresh token (token rotation security)
 * 5. Return both tokens
 */
async function refreshTokenForChina(
  refreshToken: string,
  clientIP: string,
  userAgent?: string
) {
  try {
    console.log(
      "[/api/auth/refresh] Plan B: Verify refresh token against CloudBase"
    );

    // Step 1: Verify refresh token (JWT signature + CloudBase revocation check)
    const tokenResult = await verifyRefreshToken(refreshToken);

    if (!tokenResult.valid || !tokenResult.userId || !tokenResult.email) {
      console.warn("[/api/auth/refresh] Refresh token 已过期或已被撤销");
      return {
        success: false,
        error:
          tokenResult.error || "Refresh token 已过期或已被撤销，请重新登录",
        status: 401,
      };
    }

    const { userId, email, tokenId: oldTokenId } = tokenResult;
    console.log("[/api/auth/refresh] Refresh token 验证成功，userId:", userId);

    // Step 2: Generate new accessToken (1 hour)
    const newAccessToken = signAccessToken({
      userId,
      email,
      region: "CN",
    });

    console.log("[/api/auth/refresh] New accessToken generated (1h expiry)");

    // Step 3: Create new refreshToken
    const newTokenRecord = await createRefreshToken({
      userId,
      email,
      deviceInfo: "web-refresh",
      ipAddress: clientIP,
      userAgent: userAgent,
    });

    if (!newTokenRecord) {
      console.error("[/api/auth/refresh] Failed to create new refresh token");
      return {
        success: false,
        error: "Failed to create new refresh token",
        status: 500,
      };
    }

    const newRefreshToken = newTokenRecord.refreshToken;
    console.log("[/api/auth/refresh] New refreshToken created with rotation");

    // Step 4: Revoke old refresh token to complete rotation
    if (oldTokenId) {
      const revokeOk = await revokeRefreshToken(oldTokenId, "rotated");
      if (!revokeOk) {
        // 撤销旧 token 失败时，回滚撤销新 token，避免多个活跃 refresh token 并存
        await revokeRefreshToken(newTokenRecord.tokenId, "rotation_rollback");
        return {
          success: false,
          error: "Failed to rotate refresh token",
          status: 500,
        };
      }
    }

    // Step 5: Fetch user profile
    const userProfile = await getOrCreateUserProfile(userId, {
      email,
      name: "",
    });

    return {
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: userId,
        email: email || "",
        name: userProfile?.name || "",
        avatar: userProfile?.avatar || "",
        subscription_plan: userProfile?.subscription_plan || "free",
        subscription_status: userProfile?.subscription_status || "active",
        subscription_expires_at: userProfile?.subscription_expires_at,
        membership_expires_at: userProfile?.membership_expires_at,
      },
      tokenMeta: {
        accessTokenExpiresIn: 3600, // 1 hour
        refreshTokenExpiresIn: 604800, // 7 days
      },
      status: 200,
    };
  } catch (error: any) {
    console.error("[/api/auth/refresh] Error:", error.message);

    return {
      success: false,
      error: error.message || "Token 刷新失败",
      status: error.status || 500,
    };
  }
}

/**
 * 验证和刷新 token（国际版本）
 * 暂时返回错误，因为国际版本需要在 Supabase 端实现
 */
async function refreshTokenForIntl(refreshToken: string) {
  console.log("[/api/auth/refresh] 国际版本 token 刷新（待 Supabase 实现）");

  // TODO: 集成 Supabase 的 refresh 逻辑
  // 目前 Supabase SDK 会自动处理 refresh token

  return {
    success: false,
    error: "国际版本 token 刷新由 Supabase SDK 自动处理，不需要手动调用此端点",
    status: 501, // Not Implemented
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const clientIP =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = request.headers.get("user-agent") || undefined;

    // 验证输入
    const validationResult = refreshSchema.safeParse(body);
    if (!validationResult.success) {
      logSecurityEvent("token_refresh_validation_failed", undefined, clientIP, {
        errors: validationResult.error.errors,
      });

      return NextResponse.json(
        {
          error: "Invalid input",
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const refreshToken =
      validationResult.data.refreshToken || readRefreshTokenFromRequest(request);

    if (!refreshToken) {
      return NextResponse.json(
        {
          error: "Refresh token is required",
        },
        { status: 400 }
      );
    }

    // 根据部署区域调用相应的刷新函数
    const result = isChinaRegion()
      ? await refreshTokenForChina(refreshToken, clientIP, userAgent)
      : await refreshTokenForIntl(refreshToken);

    if (!result.success) {
      logSecurityEvent("token_refresh_failed", undefined, clientIP, {
        error: result.error,
      });

      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    // 安全地提取 userId 用于日志
    let userId: string | undefined;
    if (result && "user" in result && result.user) {
      userId = (result.user as any).id;
    }
    logSecurityEvent("token_refresh_success", userId, clientIP);

    // 返回成功响应
    const { success, status, ...responseData } = result;
    const response = NextResponse.json(responseData, { status });
    if ("accessToken" in responseData && "refreshToken" in responseData) {
      setAuthCookies(
        response,
        (responseData as any).accessToken,
        (responseData as any).refreshToken
      );
    }
    return response;
  } catch (error: any) {
    console.error("[/api/auth/refresh] Error:", error);

    logSecurityEvent(
      "token_refresh_error",
      undefined,
      request.headers.get("x-forwarded-for") || "unknown",
      { error: error.message }
    );

    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
