import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAuth, isAuthFeatureSupported } from "@/lib/auth/adapter";
import { getDatabase } from "@/lib/database/adapter";
import { passwordSecurity } from "@/lib/password-security";
import { logSecurityEvent } from "@/lib/logger";
import { createProfileFromEmailUser } from "@/lib/models/user";
import { isChinaRegion } from "@/lib/config/region";
import { z } from "zod";

// 注册请求验证schema
const registerSchema = z
  .object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(6, "Password must be at least 6 characters"),
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

    // 验证密码强度（仅国际区域）
    // CN 区域由用户自己选择密码强度，不强制要求
    let passwordValidation: any = {
      isValid: true,
      score: 0,
      feedback: [],
      suggestions: [],
    };

    if (!isChinaRegion()) {
      passwordValidation = passwordSecurity.validatePassword(password);
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
    }

    // 根据区域选择认证方式
    let authResponse;

    if (isChinaRegion()) {
      // 中国区域：直接调用统一的 /api/auth 端点
      const response = await fetch(
        `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/auth`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "signup", email, password }),
        }
      );

      const data = await response.json();
      if (data.success && data.user) {
        authResponse = {
          user: {
            id: data.user.id || data.user.userId,
            email: data.user.email,
            name: data.user.name,
            avatar: data.user.avatar,
          },
        };
      } else {
        // 处理特定错误
        if (
          data.message &&
          (data.message.includes("已存在") || data.message.includes("exists"))
        ) {
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
            details: data.message || "注册失败",
          },
          { status: 400 }
        );
      }
    } else {
      // 国际区域：使用 Supabase
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: fullName,
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

      authResponse = {
        user: {
          id: data.user?.id || "",
          email: data.user?.email,
          name: fullName,
          avatar: data.user?.user_metadata?.avatar_url,
        },
      };
    }

    const userId = authResponse.user?.id;

    // 保存用户资料到数据库
    if (userId) {
      try {
        const db = getDatabase();
        const userProfile = createProfileFromEmailUser(userId, email, fullName);
        userProfile.lastLoginIp = clientIP;

        await db.insert("web_users", userProfile);

        logSecurityEvent("register_successful", userId, clientIP, {
          email,
          userId,
          fullName,
          passwordStrength: passwordValidation.score,
          profileSaved: true,
        });
      } catch (dbError) {
        console.error("Failed to save user profile:", dbError);
        // 即使保存资料失败，注册本身是成功的
        logSecurityEvent("register_profile_save_failed", userId, clientIP, {
          email,
          error: dbError instanceof Error ? dbError.message : "Unknown error",
        });
      }
    } else {
      logSecurityEvent("register_successful", userId, clientIP, {
        email,
        userId,
        fullName,
        passwordStrength: passwordValidation.score,
      });
    }

    // 返回成功响应
    return NextResponse.json({
      success: true,
      user: {
        id: authResponse.user?.id,
        email: authResponse.user?.email,
        name: fullName,
        avatar: authResponse.user?.avatar,
      },
      message: "Registration successful. You can now log in.",
      region: isChinaRegion() ? "CN" : "INTL",
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
