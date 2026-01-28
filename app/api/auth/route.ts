/**
 * 国内用户认证 API (App Router版)
 * 支持 Plan B: JWT + CloudBase refresh token
 *
 * 支持的操作:
 * - action=signup: 用户注册
 * - action=login: 用户登录
 *
 * 调用方法:
 * POST /api/auth
 * {
 *   "action": "login|signup",
 *   "email": "user@example.com",
 *   "password": "password123"
 * }
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { loginUser, signupUser } from "@/lib/cloudbase-service";

/**
 * POST /api/auth
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, action = "login" } = body;

    console.log("📨 [/api/auth] 收到请求，action:", action, "email:", email);

    if (!email || !password) {
      return NextResponse.json(
        {
          success: false,
          message: "请提供邮箱和密码",
        },
        { status: 400 }
      );
    }

    // Extract device info for token tracking
    const clientIP =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = request.headers.get("user-agent") || undefined;

    if (action === "login") {
      // 登录 - Plan B: 返回 accessToken + refreshToken
      console.log("🔐 [/api/auth] 处理登录请求");
      const result = await loginUser(email, password, {
        deviceInfo: "web-login",
        ipAddress: clientIP,
        userAgent,
      });

      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            message: result.error || "登录失败",
          },
          { status: 401 }
        );
      }

      // Return both old format (for backward compatibility) and new format
      return NextResponse.json({
        success: true,
        user: {
          id: result.userId,
          email: result.email,
          name: result.name,
        },
        // 新格式：分别返回 accessToken 和 refreshToken
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tokenMeta: result.tokenMeta,
        // 旧格式：保持 token 字段用于向后兼容
        token: result.accessToken,
      });
    } else if (action === "signup") {
      // 注册 - Plan B: 返回 accessToken + refreshToken
      console.log("📝 [/api/auth] 处理注册请求");
      const result = await signupUser(email, password, {
        deviceInfo: "web-signup",
        ipAddress: clientIP,
        userAgent,
      });

      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            message: result.error || "注册失败",
          },
          { status: 400 }
        );
      }

      // Return both old format (for backward compatibility) and new format
      return NextResponse.json({
        success: true,
        user: {
          id: result.userId,
          email: email,
          name: email.split("@")[0],
        },
        // 新格式：分别返回 accessToken 和 refreshToken
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tokenMeta: result.tokenMeta,
        // 旧格式：保持 token 字段用于向后兼容
        token: result.accessToken,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          message: "未知的 action",
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("❌ [/api/auth] 异常:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "服务器错误",
      },
      { status: 500 }
    );
  }
}
