import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { passwordSecurity } from "@/lib/password-security";
import { logSecurityEvent } from "@/lib/logger";
import { z } from "zod";

// 注册请求验证schema
const registerSchema = z
  .object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    fullName: z
      .string()
      .min(1, "Full name is required")
      .max(100, "Full name too long"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/**
 * POST /api/auth/register
 * 用户注册，包含密码强度验证
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clientIP =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // 验证输入
    const validationResult = registerSchema.safeParse(body);
    if (!validationResult.success) {
      logSecurityEvent("register_validation_failed", undefined, clientIP, {
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

    const { email, password, fullName } = validationResult.data;

    // 验证密码强度
    const passwordValidation = passwordSecurity.validatePassword(password);
    if (!passwordValidation.isValid) {
      logSecurityEvent("register_weak_password", undefined, clientIP, {
        email,
        score: passwordValidation.score,
        feedback: passwordValidation.feedback,
      });

      return NextResponse.json(
        {
          error: "Password does not meet security requirements",
          code: "WEAK_PASSWORD",
          passwordStrength: {
            score: passwordValidation.score,
            isValid: passwordValidation.isValid,
            feedback: passwordValidation.feedback,
            suggestions: passwordValidation.suggestions,
          },
        },
        { status: 400 }
      );
    }

    // 尝试注册用户
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      logSecurityEvent("register_failed", undefined, clientIP, {
        email,
        error: error.message,
      });

      // 处理特定错误
      if (error.message.includes("already registered")) {
        return NextResponse.json(
          {
            error: "Email already registered",
            code: "EMAIL_EXISTS",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          error: "Registration failed",
          code: "REGISTRATION_ERROR",
          details: error.message,
        },
        { status: 400 }
      );
    }

    logSecurityEvent("register_successful", data.user?.id, clientIP, {
      email,
      userId: data.user?.id,
      fullName,
      passwordStrength: passwordValidation.score,
    });

    // 返回成功响应
    return NextResponse.json({
      success: true,
      user: {
        id: data.user?.id,
        email: data.user?.email,
        full_name: fullName,
        avatar_url: data.user?.user_metadata?.avatar_url,
      },
      message: data.user?.email_confirmed_at
        ? "Registration successful"
        : "Registration successful. Please check your email to confirm your account.",
      emailConfirmed: !!data.user?.email_confirmed_at,
    });
  } catch (error) {
    console.error("Registration error:", error);
    logSecurityEvent(
      "register_error",
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
 * GET /api/auth/register/validate-password
 * 密码强度验证端点（用于前端实时验证）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const password = searchParams.get("password");

    if (!password) {
      return NextResponse.json(
        { error: "Password parameter required" },
        { status: 400 }
      );
    }

    const validation = passwordSecurity.validatePassword(password);

    return NextResponse.json({
      password,
      strength: {
        score: validation.score,
        isValid: validation.isValid,
        feedback: validation.feedback,
        suggestions: validation.suggestions,
      },
    });
  } catch (error) {
    console.error("Password validation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
