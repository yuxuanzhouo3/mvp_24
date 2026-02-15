// lib/auth.ts - 认证工具函数
import { supabase } from "./supabase";
import { NextRequest, NextResponse } from "next/server";
import { isChinaRegion } from "./config/region";
import { verifyAuthToken } from "./auth-utils";
import { readAccessTokenFromRequest } from "@/lib/auth/cookies";

/**
 * 验证用户认证状态
 */
export async function requireAuth(request: NextRequest): Promise<{
  user: any;
  session: any;
} | null> {
  try {
    // 从请求头获取JWT token
    const authHeader = request.headers.get("authorization");
    const bearerToken =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.substring(7)
        : null;
    const token = bearerToken || readAccessTokenFromRequest(request);
    if (!token) {
      console.error("Missing authorization token");
      return null;
    }

    // 根据地区选择认证验证方式
    if (isChinaRegion()) {
      // 中国地区：本地直接验证 token，避免内部 fetch 协议/域名问题
      const authResult = await verifyAuthToken(token);

      if (!authResult.success || !authResult.userId) {
        console.error("CloudBase auth verification failed:", authResult.error);
        return null;
      }

      return {
        user:
          authResult.user || {
            id: authResult.userId,
          },
        session: { access_token: token },
      };
    } else {
      // 国际地区：使用 Supabase 认证
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        console.error("Invalid token or user not found:", error?.message);
        return null;
      }

      return { user, session: { access_token: token } };
    }
  } catch (error) {
    console.error("Auth verification error:", error);
    return null;
  }
}

/**
 * 创建认证失败的响应
 */
export function createAuthErrorResponse(
  message: string = "Authentication required"
) {
  return NextResponse.json(
    { error: message, code: "AUTH_REQUIRED" },
    { status: 401 }
  );
}
