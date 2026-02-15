import { NextRequest, NextResponse } from "next/server";
import { isChinaRegion } from "@/lib/config/region";
import { logSecurityEvent } from "@/lib/logger";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { verifyAuthToken } from "@/lib/auth-utils";
import { getCloudBaseApp } from "@/lib/cloudbase/init";
import { readAccessTokenFromRequest } from "@/lib/auth/cookies";

const updateSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  data: z.record(z.any()).optional(),
});

const ALLOWED_PROFILE_FIELDS = new Set([
  "name",
  "avatar",
  "phone",
  "city",
  "province",
  "country",
  "language",
]);

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

    const authHeader = request.headers.get("authorization");
    const bearerToken =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.replace("Bearer ", "")
        : null;
    const token = bearerToken || readAccessTokenFromRequest(request);

    if (!token) {
      return NextResponse.json(
        {
          error: "No authentication token",
          code: "NO_AUTH_TOKEN",
        },
        { status: 401 }
      );
    }

    const authResult = await verifyAuthToken(token);
    if (!authResult.success || !authResult.userId) {
      return NextResponse.json(
        {
          error: "Invalid or expired token",
          code: "INVALID_TOKEN",
        },
        { status: 401 }
      );
    }

    const validationResult = updateSchema.safeParse(body);
    if (!validationResult.success) {
      logSecurityEvent("update_validation_failed", authResult.userId, clientIP, {
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

    if (isChinaRegion()) {
      const app = getCloudBaseApp();
      const db = app.database();
      const userId = authResult.userId;

      const updateData: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };

      if (email) {
        const emailQuery = await db
          .collection("web_users")
          .where({ email })
          .limit(1)
          .get();
        const existing = emailQuery?.data?.[0];
        if (existing && existing._id !== userId) {
          return NextResponse.json(
            {
              error: "Email already in use",
              code: "EMAIL_EXISTS",
            },
            { status: 409 }
          );
        }
        updateData.email = email;
      }

      if (password) {
        updateData.password = await bcrypt.hash(password, 10);
      }

      if (data) {
        for (const [key, value] of Object.entries(data)) {
          if (ALLOWED_PROFILE_FIELDS.has(key)) {
            updateData[key] = value;
          }
        }
      }

      await db.collection("web_users").doc(userId).update(updateData);
      const updatedResult = await db.collection("web_users").doc(userId).get();
      const updatedUser = Array.isArray(updatedResult?.data)
        ? updatedResult.data[0]
        : (updatedResult?.data as any);

      logSecurityEvent("user_updated", userId, clientIP, {
        updatedFields: Object.keys(updateData),
      });

      return NextResponse.json({
        success: true,
        message: "User updated successfully",
        user: updatedUser
          ? {
              id: updatedUser._id || userId,
              email: updatedUser.email,
              name: updatedUser.name || "",
              avatar: updatedUser.avatar || "",
            }
          : {
              id: userId,
              email: email || authResult.user?.email || "",
            },
      });
    }

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
