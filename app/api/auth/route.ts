/**
 * 兼容入口：POST /api/auth
 * 建议新代码使用：
 * - /api/auth/login
 * - /api/auth/register
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { loginUser, signupUser } from "@/lib/cloudbase-service";
import { accountLockout } from "@/lib/account-lockout";
import { getOrCreateUserProfile } from "@/lib/cloudbase-user-profile";
import { setAuthCookies } from "@/lib/auth/cookies";
import { verifyEmailOtp } from "@/lib/email-otp";
import { isChinaRegion } from "@/lib/config/region";
import { bindReferralFromRequest } from "@/lib/market/referrals";

const authSchema = z.object({
  action: z.enum(["login", "signup"]).default("login"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
  signupOtp: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = authSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid request payload",
          details: parsed.error.errors,
        },
        { status: 400 }
      );
    }

    const { action, email, password, signupOtp } = parsed.data;
    if (!isChinaRegion()) {
      return NextResponse.json(
        {
          success: false,
          message: "Not implemented for international region",
        },
        { status: 400 }
      );
    }
    const clientIP =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = request.headers.get("user-agent") || undefined;
    const ipAddress = clientIP !== "unknown" ? clientIP : undefined;

    if (action === "login") {
      const lockoutStatus = accountLockout.isLocked(email);
      if (lockoutStatus.locked) {
        return NextResponse.json(
          {
            success: false,
            message: "Account is temporarily locked",
          },
          { status: 429 }
        );
      }

      const result = await loginUser(email, password, {
        deviceInfo: userAgent || "web-login",
        ipAddress,
        userAgent,
      });
      if (!result.success || !result.userId || !result.accessToken) {
        accountLockout.recordFailedAttempt(email, clientIP);
        return NextResponse.json(
          {
            success: false,
            message: result.error || "登录失败",
          },
          { status: 401 }
        );
      }

      const profile = await getOrCreateUserProfile(result.userId, {
        email: result.email || email,
        name: result.name || "",
      });

      accountLockout.recordSuccessfulLogin(email);

      const response = NextResponse.json({
        success: true,
        user: {
          id: result.userId,
          email: result.email || email,
          name: result.name || "",
          avatar: profile?.avatar || "",
          subscription_plan: profile?.subscription_plan || "free",
          subscription_status: profile?.subscription_status || "inactive",
          subscription_expires_at: profile?.subscription_expires_at,
          membership_expires_at: profile?.membership_expires_at,
        },
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tokenMeta: result.tokenMeta,
        token: result.accessToken, // legacy compatibility
      });
      setAuthCookies(response, result.accessToken, result.refreshToken);
      return response;
    }

    // signup
    if (!signupOtp) {
      return NextResponse.json(
        {
          success: false,
          message: "Signup OTP is required",
          code: "OTP_REQUIRED",
        },
        { status: 400 }
      );
    }

    const otpResult = await verifyEmailOtp(email, "signup", signupOtp);
    if (!otpResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: otpResult.error || "Invalid OTP",
          code: otpResult.code || "OTP_INVALID",
        },
        { status: otpResult.code === "TOO_MANY_ATTEMPTS" ? 429 : 400 }
      );
    }

    const result = await signupUser(email, password, {
      deviceInfo: userAgent || "web-signup",
      ipAddress,
      userAgent,
    });
    if (!result.success || !result.userId || !result.accessToken) {
      return NextResponse.json(
        {
          success: false,
          message: result.error || "注册失败",
        },
        { status: 400 }
      );
    }

    const profile = await getOrCreateUserProfile(result.userId, {
      email,
      name: email.split("@")[0],
    });

    try {
      await bindReferralFromRequest({
        request,
        invitedUserId: result.userId,
        invitedEmail: email,
        region: "CN",
      });
    } catch (bindError) {
      console.warn("[/api/auth] referral bind failed on signup:", bindError);
    }

    const response = NextResponse.json({
      success: true,
      user: {
        id: result.userId,
        email,
        name: profile?.name || email.split("@")[0],
        avatar: profile?.avatar || "",
      },
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      tokenMeta: result.tokenMeta,
      token: result.accessToken, // legacy compatibility
    });
    setAuthCookies(response, result.accessToken, result.refreshToken);
    return response;
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
