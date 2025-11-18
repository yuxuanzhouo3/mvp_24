import { NextRequest, NextResponse } from "next/server";
import { isChinaRegion } from "@/lib/config/region";
import { logSecurityEvent } from "@/lib/logger";
import cloudbase from "@cloudbase/js-sdk";
import adapter from "@cloudbase/adapter-node";
import { getDatabase } from "@/lib/cloudbase-service";

/**
 * GET /api/auth/me
 * 获取当前登录用户信息
 */
export async function GET(request: NextRequest) {
  try {
    const clientIP =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // 获取 JWT Token 或 Cookie
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    // 也检查 cookie 中的 token
    const cookieToken = request.cookies.get("auth-token")?.value;

    const finalToken = token || cookieToken;

    if (!finalToken) {
      return NextResponse.json(
        {
          error: "No authentication token",
          code: "NO_AUTH_TOKEN",
        },
        { status: 401 }
      );
    }

    // 如果是中国区域，从 CloudBase 获取用户信息
    if (isChinaRegion()) {
      try {
        console.log(
          "📨 [/api/auth/me] 收到请求，token:",
          finalToken?.substring(0, 50) + "..."
        );

        // 解码 CloudBase accessToken 以获取 uid
        // CloudBase accessToken 是一个 JWT，格式: header.payload.signature
        let userId: string | null = null;
        let decodedClaims: any = null;

        try {
          // 简单的 Base64 解码方法，不依赖外部库
          const parts = finalToken.split(".");
          if (parts.length === 3) {
            const payload = parts[1];
            // 添加 padding
            const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
            const decoded = Buffer.from(padded, "base64").toString("utf-8");
            decodedClaims = JSON.parse(decoded);
            userId =
              decodedClaims.userId ||
              decodedClaims.uid ||
              decodedClaims.sub ||
              decodedClaims.user_id;
            console.log(
              "✅ [/api/auth/me] 解码成功，userId:",
              userId,
              "claims:",
              decodedClaims
            );
          } else {
            console.log(
              "❌ [/api/auth/me] Token 格式错误，部分数:",
              parts.length,
              "token前50字符:",
              finalToken.substring(0, 50)
            );
          }
        } catch (decodeError) {
          console.error(
            "❌ [/api/auth/me] 解码失败:",
            decodeError,
            "token前50字符:",
            finalToken.substring(0, 50)
          );
          // 如果解码失败，尝试其他方法
          // 或许token不是JWT格式，尝试直接作为userId使用
          if (finalToken.length < 50) {
            // 如果token很短，可能是直接的userId
            userId = finalToken;
            console.log("⚠️ [/api/auth/me] 尝试将token作为userId使用:", userId);
          }
        }

        if (!userId) {
          console.error("❌ [/api/auth/me] 无法提取 userId，返回 401");
          return NextResponse.json(
            {
              error: "Invalid or expired token",
              code: "INVALID_TOKEN",
            },
            { status: 401 }
          );
        }

        // 从 web_users 表获取用户信息（与登录时使用的表一致）
        console.log("🔍 [/api/auth/me] 正在查询用户:", userId);
        const db = getDatabase();
        const userResult = await db.collection("web_users").doc(userId).get();

        console.log("📊 [/api/auth/me] 数据库查询结果:", {
          hasData: !!userResult?.data,
          dataType: typeof userResult?.data,
          dataKeys: userResult?.data ? Object.keys(userResult.data) : [],
        });

        if (!userResult || !userResult.data || userResult.data.length === 0) {
          console.error("❌ [/api/auth/me] 用户未找到或查询出错");
          return NextResponse.json(
            {
              error: "User not found",
              code: "USER_NOT_FOUND",
            },
            { status: 404 }
          );
        }

        const user = userResult.data[0] as any;
        const response = {
          success: true,
          user: {
            id: user._id || user.id,
            email: user.email,
            name: user.name || "",
            avatar: user.avatar || "",
            pro: user.pro || false,
            region: user.region || "china",
          },
        };

        console.log("✅ [/api/auth/me] 返回用户信息:", response.user.id);
        return NextResponse.json(response);
      } catch (error) {
        console.error("❌ [/api/auth/me] 异常:", error);
        return NextResponse.json(
          {
            error: "Failed to get user information",
            code: "GET_USER_FAILED",
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
    console.error("Get user error:", error);
    logSecurityEvent(
      "get_user_error",
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
