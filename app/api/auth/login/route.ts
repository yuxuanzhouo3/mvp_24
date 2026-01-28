import { NextRequest, NextResponse } from "next/server";
import { isChinaRegion } from "@/lib/config/region";
import { accountLockout } from "@/lib/account-lockout";
import { logSecurityEvent } from "@/lib/logger";
import { z } from "zod";
import { getOrCreateUserProfile } from "@/lib/cloudbase-user-profile";
import { loginUser } from "@/lib/cloudbase-service";

const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clientIP = request.headers.get("x-forwarded-for") || "unknown";
    const validationResult = loginSchema.safeParse(body);
    if (!validationResult.success) {
      logSecurityEvent("login_validation_failed", undefined, clientIP, {
        errors: validationResult.error.errors,
      });
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { email, password } = validationResult.data;
    const lockoutStatus = accountLockout.isLocked(email);
    if (lockoutStatus.locked) {
      logSecurityEvent("login_blocked_locked_account", undefined, clientIP, {
        email,
      });
      return NextResponse.json(
        { error: "Account is temporarily locked" },
        { status: 429 }
      );
    }
    if (isChinaRegion()) {
      console.log(" [/api/auth/login] China region login:", email);

      // ✅ 获取客户端信息（用于 refresh token 追踪）
      const userAgent = request.headers.get("user-agent") || undefined;
      const ipAddress = clientIP !== "unknown" ? clientIP : undefined;

      const result = await loginUser(email, password, {
        deviceInfo: `${userAgent}`,
        ipAddress,
        userAgent,
      });

      if (!result.success) {
        accountLockout.recordFailedAttempt(email, clientIP);
        logSecurityEvent("login_failed", undefined, clientIP, { email });
        return NextResponse.json(
          { error: result.error || "Login failed" },
          { status: 401 }
        );
      }
      const userId = result.userId;
      if (!userId) {
        return NextResponse.json(
          { error: "User ID not found" },
          { status: 401 }
        );
      }
      const profile = await getOrCreateUserProfile(userId, {
        email: result.email || email,
        name: result.name || "",
      });
      accountLockout.recordSuccessfulLogin(email);
      logSecurityEvent("login_success", userId, clientIP, { email });

      // ✅ 返回统一格式（包含正确的 access token 和 refresh token）
      return NextResponse.json({
        accessToken: result.accessToken, // ✅ 短期 token (1小时)
        refreshToken: result.refreshToken, // ✅ 长期 token (7天，保存在腾讯云)
        user: {
          id: userId,
          email: result.email || email,
          name: result.name || "",
          avatar: profile?.avatar || "",
          subscription_plan: profile?.subscription_plan || "free",
          subscription_status: profile?.subscription_status || "active",
          subscription_expires_at: profile?.subscription_expires_at,
          membership_expires_at: profile?.membership_expires_at,
        },
        tokenMeta: result.tokenMeta, // ✅ 直接使用返回的 token 元数据
      });
    } else {
      return NextResponse.json(
        { error: "Not implemented for international region" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error(" [/api/auth/login] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
