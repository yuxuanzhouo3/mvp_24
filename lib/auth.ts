// lib/auth.ts - 认证工具函数
import { supabase } from "./supabase";
import { NextRequest, NextResponse } from "next/server";
import { isChinaRegion } from "./config/region";

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
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("Missing or invalid authorization header");
      return null;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // 根据地区选择认证验证方式
    if (isChinaRegion()) {
      // 中国地区：使用 CloudBase 认证，通过 /api/auth/me 验证
      try {
        const response = await fetch(
          `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/auth/me`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          console.error("CloudBase auth verification failed:", response.status);
          return null;
        }

        const data = await response.json();
        if (!data.success || !data.user) {
          console.error("CloudBase auth verification returned invalid data");
          return null;
        }

        return {
          user: data.user,
          session: { access_token: token },
        };
      } catch (error) {
        console.error("CloudBase auth verification error:", error);
        return null;
      }
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
