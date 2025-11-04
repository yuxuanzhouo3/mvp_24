// lib/auth.ts - 认证工具函数
import { supabase } from "./supabase";
import { NextRequest, NextResponse } from "next/server";

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

    // 使用token获取用户
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error("Invalid token or user not found:", error?.message);
      return null;
    }

    return { user, session: { access_token: token } };
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
