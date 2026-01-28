import { NextRequest, NextResponse } from "next/server";
import { isChinaRegion } from "@/lib/config/region";
import { logSecurityEvent, logInfo } from "@/lib/logger";
import {
  createProfileFromWechatUser,
  mergeUserProfile,
  UserProfile,
} from "@/lib/models/user";
import { getWechatUserByCode } from "@/lib/wechat/token-exchange";
import { isAuthFeatureSupported } from "@/lib/config";
import { createRefreshToken } from "@/lib/refresh-token-manager";
import { getCloudBaseApp } from "@/lib/cloudbase/init";
import * as jwt from "jsonwebtoken";
import { z } from "zod";

// 微信登录请求验证schema
const wechatLoginSchema = z.object({
  code: z.string().min(1, "WeChat authorization code is required"),
});

/**
 * POST /api/auth/wechat
 * 微信登录端点 - 完整的 OAuth2 流程
 *
 * 流程：
 * 1. 接收授权码(code)
 * 2. 用 code 换 access_token 和 openid
 * 3. 用 access_token 获取用户信息
 * 4. 创建/更新用户资料
 * 5. 返回登录成功
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clientIP =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // 验证输入
    const validationResult = wechatLoginSchema.safeParse(body);
    if (!validationResult.success) {
      logSecurityEvent("wechat_login_validation_failed", undefined, clientIP, {
        errors: validationResult.error.errors,
      });

      return NextResponse.json(
        {
          success: false,
          error: "Invalid input",
          code: "VALIDATION_ERROR",
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { code } = validationResult.data;

    // 检查是否是中国区域
    if (!isChinaRegion()) {
      return NextResponse.json(
        {
          success: false,
          error: "WeChat authentication only available in China region",
          code: "REGION_NOT_SUPPORTED",
        },
        { status: 400 }
      );
    }

    // ✅ 第2步：用 code 换 access_token
    logInfo("WeChat OAuth: exchanging code for access_token", { code });

    const appId = process.env.NEXT_PUBLIC_WECHAT_APP_ID;
    const appSecret = process.env.WECHAT_APP_SECRET;

    if (!appId || !appSecret) {
      logSecurityEvent("wechat_missing_config", undefined, clientIP, {
        hasAppId: !!appId,
        hasAppSecret: !!appSecret,
      });

      return NextResponse.json(
        {
          success: false,
          error: "WeChat configuration missing",
          code: "CONFIG_ERROR",
        },
        { status: 500 }
      );
    }

    // ✅ 第5步 + 第6步：用 code 获取用户信息（一步到位）
    const wechatUser = await getWechatUserByCode(code, appId, appSecret);

    logInfo("WeChat OAuth: got user info", {
      openid: wechatUser.openid,
      nickname: wechatUser.nickname,
    });

    // ✅ 第7步：创建/更新用户资料（使用 CloudBase 集合数据库）
    const openid = wechatUser.openid;
    const app = getCloudBaseApp();
    const db = app.database();
    const usersCollection = db.collection("web_users");

    // 根据 openid 查找现有用户
    let userId: string | null = null;
    let existingUser: any = null;

    try {
      // 查询是否已有该微信用户
      const queryResult = await usersCollection
        .where({
          wechat_openid: openid,
        })
        .limit(1)
        .get();

      if (queryResult.data && queryResult.data.length > 0) {
        existingUser = queryResult.data[0];
        userId = existingUser._id;
      }
    } catch (queryError) {
      logInfo("First time WeChat user (query returned empty)", {
        openid,
      });
    }

    // 如果是新用户，创建账户
    if (!userId) {
      logInfo("Creating new WeChat user", { openid });

      const now = new Date().toISOString();
      const newUser = {
        wechat_openid: openid,
        wechat_unionid: wechatUser.unionid,
        email: `wechat_${openid}@local.wechat`, // 临时邮箱
        name: wechatUser.nickname,
        avatar: wechatUser.headimgurl,
        pro: false,
        subscription_plan: "free",
        subscription_status: "inactive",
        login_count: 1,
        last_login_at: now,
        last_login_ip: clientIP,
        created_at: now,
        updated_at: now,
        region: "china",
      };

      const insertResult = await usersCollection.add(newUser);
      userId = insertResult._id;

      logSecurityEvent("wechat_user_created", userId, clientIP, {
        openid,
        nickname: wechatUser.nickname,
      });
    } else {
      // 更新现有用户
      logInfo("Updating existing WeChat user", { userId, openid });

      const now = new Date().toISOString();
      await usersCollection.doc(userId).update({
        login_count: (existingUser?.login_count || 0) + 1,
        last_login_at: now,
        last_login_ip: clientIP,
        // 更新头像和昵称（用户可能修改了）
        avatar: wechatUser.headimgurl,
        name: wechatUser.nickname,
        updated_at: now,
      });

      logSecurityEvent("wechat_login_successful", userId, clientIP, {
        openid,
      });
    }

    if (!userId) {
      throw new Error("Failed to create or find user");
    }

    // ✅ 第8步：生成 JWT tokens
    // 生成 access token (1 小时有效期)
    const accessPayload = {
      userId,
      email: `wechat_${openid}@local.wechat`,
      region: "CN",
    };

    const accessToken = jwt.sign(
      accessPayload,
      process.env.JWT_SECRET || "fallback-secret-key-for-development-only",
      {
        expiresIn: "1h",
      }
    );

    logInfo("Generated access token for WeChat user", { userId });

    // 生成 refresh token (7 天有效期)
    const refreshTokenResult = await createRefreshToken({
      userId,
      email: `wechat_${openid}@local.wechat`,
      deviceInfo: "wechat-web",
      ipAddress: clientIP,
      userAgent: request.headers.get("user-agent") || undefined,
    });

    if (!refreshTokenResult) {
      throw new Error("Failed to create refresh token");
    }

    const refreshToken = refreshTokenResult.refreshToken;

    logInfo("Generated refresh token for WeChat user", { userId });

    // ✅ 第9步：返回登录成功 + tokens
    return NextResponse.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: userId,
        email: `wechat_${openid}@local.wechat`,
        name: wechatUser.nickname,
        avatar: wechatUser.headimgurl,
        openid: wechatUser.openid,
      },
      tokenMeta: {
        accessTokenExpiresIn: 3600, // 1 hour
        refreshTokenExpiresIn: 604800, // 7 days
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("WeChat login error:", errorMessage);
    logSecurityEvent(
      "wechat_login_error",
      undefined,
      request.headers.get("x-forwarded-for") || "unknown",
      {
        error: errorMessage,
      }
    );

    return NextResponse.json(
      {
        success: false,
        error: "WeChat login failed",
        code: "WECHAT_LOGIN_FAILED",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/wechat/config
 * 获取微信登录配置（用于前端初始化）
 */
export async function GET(request: NextRequest) {
  try {
    // 检查是否支持微信登录
    const wechatSupported = isAuthFeatureSupported("wechatAuth");

    if (!wechatSupported) {
      return NextResponse.json(
        {
          error: "WeChat authentication not supported",
          code: "UNSUPPORTED_AUTH_METHOD",
        },
        { status: 400 }
      );
    }

    // 服务端读取：这个变量在编译时被嵌入到 API 路由代码中
    const appId = process.env.NEXT_PUBLIC_WECHAT_APP_ID;

    // 返回微信登录配置
    return NextResponse.json({
      supported: true,
      appId: appId || null,
      scope: "snsapi_userinfo",
    });
  } catch (error) {
    console.error("WeChat config error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
