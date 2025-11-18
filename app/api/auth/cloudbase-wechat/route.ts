/**
 * CloudBase 微信扫码登录接口
 * 使用 CloudBase 内置的微信认证功能
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuth, isAuthFeatureSupported } from "@/lib/auth/adapter";
import { getDatabase } from "@/lib/database/adapter";
import { isChinaRegion } from "@/lib/config/region";
import { logSecurityEvent } from "@/lib/logger";
import {
  createProfileFromWechatUser,
  mergeUserProfile,
  UserProfile,
} from "@/lib/models/user";
import { z } from "zod";

// 微信登录请求验证schema
const wechatAuthSchema = z.object({
  code: z.string().min(1, "WeChat authorization code is required"),
});

/**
 * POST /api/auth/cloudbase-wechat
 * 使用微信授权码进行登录（CloudBase）
 */
export async function POST(request: NextRequest) {
  try {
    // 检查是否是中国区域
    if (!isChinaRegion()) {
      return NextResponse.json(
        {
          error: "WeChat authentication only available in China region",
          code: "REGION_NOT_SUPPORTED",
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const clientIP =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // 验证输入
    const validationResult = wechatAuthSchema.safeParse(body);
    if (!validationResult.success) {
      logSecurityEvent(
        "cloudbase_wechat_login_validation_failed",
        undefined,
        clientIP,
        {
          errors: validationResult.error.errors,
        }
      );

      return NextResponse.json(
        {
          error: "Invalid input",
          code: "VALIDATION_ERROR",
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { code } = validationResult.data;

    // 检查是否支持微信登录
    if (!isAuthFeatureSupported("wechatAuth")) {
      return NextResponse.json(
        {
          error: "WeChat authentication not supported",
          code: "UNSUPPORTED_AUTH_METHOD",
        },
        { status: 400 }
      );
    }

    // 使用 CloudBase 认证进行微信登录
    const auth = getAuth();
    const authResponse = await auth.signInWithWechat!(code);

    if (authResponse.error) {
      logSecurityEvent("cloudbase_wechat_login_failed", undefined, clientIP, {
        error: authResponse.error.message,
      });

      return NextResponse.json(
        {
          error: "WeChat login failed",
          code: "WECHAT_LOGIN_FAILED",
          details: authResponse.error.message,
        },
        { status: 401 }
      );
    }

    // 登录成功，保存用户资料到数据库
    const userId = authResponse.user?.id;
    if (userId) {
      try {
        const db = getDatabase();
        const userMetadata = authResponse.user?.metadata || {};

        // 从微信元数据构建用户资料
        const userProfile = createProfileFromWechatUser(userId, {
          openid: userMetadata.openid || userId,
          unionid: userMetadata.unionid,
          nickname: authResponse.user?.name || "WeChat User",
          headimgurl: authResponse.user?.avatar,
          sex: userMetadata.sex,
          province: userMetadata.province,
          city: userMetadata.city,
          country: userMetadata.country,
        });

        // 检查是否已存在用户资料
        const existingUser = (await db.getById(
          "web_users",
          userId
        )) as UserProfile | null;

        if (existingUser) {
          // 更新现有用户资料（更新登录时间和次数）
          const updatedData = {
            lastLoginAt: new Date(),
            loginCount: (existingUser.loginCount || 0) + 1,
            lastLoginIp: clientIP,
          };
          await db.update("web_users", userId, updatedData);
        } else {
          // 创建新用户资料 - 注意：通常用户在注册时已经在 web_users 中
          // 这个分支可能不会执行，但为了安全保险保留
          userProfile.lastLoginIp = clientIP;
          userProfile.loginCount = 1;
          userProfile.lastLoginAt = new Date();
          await db.insert("web_users", userProfile);
        }

        logSecurityEvent(
          "cloudbase_wechat_login_successful",
          userId,
          clientIP,
          {
            userId: userId,
            profileSaved: true,
          }
        );
      } catch (dbError) {
        console.error("Failed to save user profile:", dbError);
        // 即使保存资料失败，也允许登录继续进行
        logSecurityEvent(
          "cloudbase_wechat_login_profile_save_failed",
          userId,
          clientIP,
          {
            error: dbError instanceof Error ? dbError.message : "Unknown error",
          }
        );
      }
    }

    // 返回成功响应
    return NextResponse.json({
      success: true,
      user: {
        id: authResponse.user?.id,
        name: authResponse.user?.name,
        avatar: authResponse.user?.avatar,
        metadata: authResponse.user?.metadata,
      },
      session: {
        access_token: authResponse.session?.access_token
          ? "present"
          : "missing",
        refresh_token: authResponse.session?.refresh_token
          ? "present"
          : "missing",
        expires_at: authResponse.session?.expires_at,
      },
    });
  } catch (error) {
    console.error("CloudBase WeChat login error:", error);
    logSecurityEvent(
      "cloudbase_wechat_login_error",
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
 * GET /api/auth/cloudbase-wechat/qrcode
 * 获取微信登录二维码 URL（用于前端显示二维码扫描）
 */
export async function GET(request: NextRequest) {
  try {
    // 检查是否是中国区域
    if (!isChinaRegion()) {
      return NextResponse.json(
        {
          error: "WeChat authentication only available in China region",
          code: "REGION_NOT_SUPPORTED",
        },
        { status: 400 }
      );
    }

    // 检查是否支持微信登录
    if (!isAuthFeatureSupported("wechatAuth")) {
      return NextResponse.json(
        {
          error: "WeChat authentication not supported",
          code: "UNSUPPORTED_AUTH_METHOD",
        },
        { status: 400 }
      );
    }

    // 服务端读取：这些变量在编译时被嵌入到 API 路由代码中
    // 客户端需要这些变量时必须调用这个 API 获取
    const wechatAppId = process.env.NEXT_PUBLIC_WECHAT_APP_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const redirectUri = `${appUrl}/auth/callback`;

    if (!wechatAppId) {
      return NextResponse.json(
        {
          error: "WeChat APP ID not configured",
          code: "CONFIG_ERROR",
        },
        { status: 500 }
      );
    }

    // 构建微信 OAuth 二维码 URL
    // 这个 URL 会自动显示微信登录二维码，用户扫描后会回调到 redirectUri
    const wechatQrcodeUrl = `https://open.weixin.qq.com/connect/qrconnect?appid=${wechatAppId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=snsapi_login&state=${Date.now()}#wechat_redirect`;

    return NextResponse.json({
      supported: true,
      appId: wechatAppId,
      qrcodeUrl: wechatQrcodeUrl,
      redirectUri: redirectUri,
      scope: "snsapi_login",
    });
  } catch (error) {
    console.error("Get WeChat QR code error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
