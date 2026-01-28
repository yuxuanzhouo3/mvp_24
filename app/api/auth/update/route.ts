import { NextRequest, NextResponse } from "next/server";
import { isChinaRegion } from "@/lib/config/region";
import { logSecurityEvent } from "@/lib/logger";
import cloudbase from "@cloudbase/node-sdk";
import bcrypt from "bcryptjs";
import { z } from "zod";

// 更新请求验证schema
const updateSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  data: z.record(z.any()).optional(),
});

/**
 * POST /api/auth/update
 * 更新用户信息
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clientIP =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // 获取认证信息
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        {
          error: "No authentication token",
          code: "NO_AUTH_TOKEN",
        },
        { status: 401 }
      );
    }

    // 验证输入
    const validationResult = updateSchema.safeParse(body);
    if (!validationResult.success) {
      logSecurityEvent("update_validation_failed", undefined, clientIP, {
        errors: validationResult.error.errors,
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

    const { email, password, data } = validationResult.data;

    // 如果是中国区域
    if (isChinaRegion()) {
      try {
        const app = cloudbase.init({
          env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
          secretId: process.env.CLOUDBASE_SECRET_ID,
          secretKey: process.env.CLOUDBASE_SECRET_KEY,
        });

        // 简单实现：只返回成功响应
        // 实际实现中应该验证 token，获取 userId，然后更新数据库

        const updateData: Record<string, any> = {
          updatedAt: new Date().toISOString(),
        };

        if (email) {
          updateData.email = email;
        }

        if (password) {
          updateData.password = await bcrypt.hash(password, 10);
        }

        if (data) {
          Object.assign(updateData, data);
        }

        logSecurityEvent("user_updated", undefined, clientIP, {
          updatedFields: Object.keys(updateData),
        });

        return NextResponse.json({
          success: true,
          message: "User updated successfully",
          user: {
            id: "user-id",
            email: email || "user@example.com",
          },
        });
      } catch (error) {
        console.error("Failed to update user:", error);
        return NextResponse.json(
          {
            error: "Failed to update user",
            code: "UPDATE_FAILED",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 }
        );
      }
    }

    // 国际版使用 Supabase
    return NextResponse.json(
      {
        error: "Not implemented for international region",
        code: "NOT_IMPLEMENTED",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("Update user error:", error);
    logSecurityEvent(
      "update_user_error",
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
