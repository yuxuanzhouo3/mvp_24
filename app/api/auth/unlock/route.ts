import { NextRequest, NextResponse } from "next/server";
import { accountLockout } from "@/lib/account-lockout";
import { logSecurityEvent } from "@/lib/logger";
import { requireAuth } from "@/lib/auth";
import { z } from "zod";

// 解锁请求验证schema
const unlockSchema = z.object({
  email: z.string().email("Invalid email format"),
  reason: z.string().min(1, "Reason is required"),
});

/**
 * POST /api/auth/unlock
 * 管理员手动解锁账户（需要认证）
 */
export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const authResult = await requireAuth(request);
    if (!authResult) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // TODO: 添加管理员角色检查
    // 这里应该检查用户是否是管理员
    // 暂时允许所有认证用户访问（生产环境应该限制）

    const body = await request.json();
    const clientIP =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // 验证输入
    const validationResult = unlockSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          code: "VALIDATION_ERROR",
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { email, reason } = validationResult.data;

    // 检查账户当前状态
    const beforeStatus = accountLockout.getAccountStatus(email);
    const wasLocked = accountLockout.isLocked(email).locked;

    if (!wasLocked) {
      return NextResponse.json(
        {
          error: "Account is not locked",
          code: "ACCOUNT_NOT_LOCKED",
        },
        { status: 400 }
      );
    }

    // 解锁账户
    const unlocked = accountLockout.unlockAccount(email);

    if (unlocked) {
      logSecurityEvent("account_unlocked", authResult.user.id, clientIP, {
        targetEmail: email,
        reason,
        adminUserId: authResult.user.id,
        previousFailedAttempts: beforeStatus.failedAttempts,
        previousProgressiveLevel: beforeStatus.progressiveLevel,
      });

      return NextResponse.json({
        success: true,
        message: "Account unlocked successfully",
        email,
        unlockedAt: new Date().toISOString(),
      });
    } else {
      return NextResponse.json(
        {
          error: "Failed to unlock account",
          code: "UNLOCK_FAILED",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Account unlock error:", error);
    logSecurityEvent(
      "account_unlock_error",
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
