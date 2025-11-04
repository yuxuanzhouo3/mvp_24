import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { accountLockout } from "@/lib/account-lockout";
import { logSecurityEvent } from "@/lib/logger";
import { z } from "zod";

// 登录请求验证schema
const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

/**
 * POST /api/auth/login
 * 安全的登录端点，包含账户锁定保护
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clientIP =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // 验证输入
    const validationResult = loginSchema.safeParse(body);
    if (!validationResult.success) {
      logSecurityEvent("login_validation_failed", undefined, clientIP, {
        errors: validationResult.error.errors,
        email: body.email,
      });

      return NextResponse.json(
        {
          error: "Invalid input",
          code: "VALIDATION_ERROR",
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { email, password } = validationResult.data;

    // 检查账户是否被锁定
    const lockoutStatus = accountLockout.isLocked(email);
    if (lockoutStatus.locked) {
      logSecurityEvent("login_blocked_locked_account", undefined, clientIP, {
        email,
        lockoutUntil: lockoutStatus.lockoutUntil,
        remainingTimeMinutes: lockoutStatus.remainingTimeMinutes,
      });

      return NextResponse.json(
        {
          error:
            "Account is temporarily locked due to too many failed login attempts",
          code: "ACCOUNT_LOCKED",
          lockoutUntil: lockoutStatus.lockoutUntil?.toISOString(),
          remainingTimeMinutes: lockoutStatus.remainingTimeMinutes,
        },
        { status: 429 }
      );
    }

    // 尝试登录
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // 登录失败 - 记录失败尝试
      const lockoutResult = accountLockout.recordFailedAttempt(email, clientIP);

      logSecurityEvent("login_failed", undefined, clientIP, {
        email,
        error: error.message,
        failedAttempts:
          lockoutResult.remainingAttempts === 0
            ? accountLockout.getAccountStatus(email).failedAttempts
            : undefined,
        isLocked: lockoutResult.isLocked,
        lockoutUntil: lockoutResult.lockoutUntil,
      });

      // 如果账户被锁定，返回锁定信息
      if (lockoutResult.isLocked) {
        return NextResponse.json(
          {
            error: "Account locked due to too many failed attempts",
            code: "ACCOUNT_LOCKED",
            lockoutUntil: lockoutResult.lockoutUntil?.toISOString(),
            remainingTimeMinutes: Math.ceil(
              (lockoutResult.lockoutUntil!.getTime() - Date.now()) / (1000 * 60)
            ),
          },
          { status: 429 }
        );
      }

      // 返回失败信息，包括剩余尝试次数
      return NextResponse.json(
        {
          error: "Invalid email or password",
          code: "INVALID_CREDENTIALS",
          remainingAttempts: lockoutResult.remainingAttempts,
        },
        { status: 401 }
      );
    }

    // 登录成功 - 重置失败计数器
    accountLockout.recordSuccessfulLogin(email);

    logSecurityEvent("login_successful", data.user?.id, clientIP, {
      email,
      userId: data.user?.id,
    });

    // 返回成功响应
    return NextResponse.json({
      success: true,
      user: {
        id: data.user?.id,
        email: data.user?.email,
        full_name: data.user?.user_metadata?.full_name,
        avatar_url: data.user?.user_metadata?.avatar_url,
      },
      session: {
        access_token: data.session?.access_token ? "present" : "missing",
        refresh_token: data.session?.refresh_token ? "present" : "missing",
        expires_at: data.session?.expires_at,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    logSecurityEvent(
      "login_error",
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

/**
 * GET /api/auth/login/status
 * 检查登录状态和锁定信息（用于前端显示）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { error: "Email parameter required" },
        { status: 400 }
      );
    }

    const lockoutStatus = accountLockout.isLocked(email);
    const accountStatus = accountLockout.getAccountStatus(email);

    return NextResponse.json({
      email,
      isLocked: lockoutStatus.locked,
      lockoutUntil: lockoutStatus.lockoutUntil?.toISOString(),
      remainingTimeMinutes: lockoutStatus.remainingTimeMinutes,
      failedAttempts: accountStatus.failedAttempts,
      lastFailedAttempt: accountStatus.lastFailedAttempt?.toISOString(),
      progressiveLevel: accountStatus.progressiveLevel,
    });
  } catch (error) {
    console.error("Login status check error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
