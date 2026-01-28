import { NextRequest, NextResponse } from "next/server";
import { isChinaRegion } from "@/lib/config/region";
import { logSecurityEvent, logInfo } from "@/lib/logger";
import { getCloudBaseApp } from "@/lib/cloudbase/init";
import { createRefreshToken } from "@/lib/refresh-token-manager";
import { getWechatUserByCode } from "@/lib/wechat/token-exchange";
import * as jwt from "jsonwebtoken";
import { z } from "zod";

// 1️⃣ 请求参数验证
const miniprogramLoginSchema = z.object({
  code: z.string().min(1, "WeChat authorization code is required"),
  nickName: z.string().optional(), // 小程序传递的昵称
  avatarUrl: z.string().optional(), // 小程序传递的头像URL
});

// 2️⃣ 微信 API 接口:code 换 openid（小程序）
async function getOpenIdByCode(
  code: string,
  appId: string,
  appSecret: string
): Promise<{ openid: string; session_key: string; unionid?: string }> {
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`;

  logInfo("Calling WeChat jscode2session API", { appId, codeLength: code.length });

  const response = await fetch(url);
  const data = await response.json();

  if (data.errcode) {
    logInfo("WeChat API error", { errcode: data.errcode, errmsg: data.errmsg });
    throw new Error(`WeChat API error: ${data.errcode} - ${data.errmsg}`);
  }

  logInfo("WeChat API success", { openid: data.openid });

  return {
    openid: data.openid,
    session_key: data.session_key,
    unionid: data.unionid,
  };
}

// 3️⃣ 主登录接口
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clientIP =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // 验证输入
    const validationResult = miniprogramLoginSchema.safeParse(body);
    if (!validationResult.success) {
      logSecurityEvent(
        "miniprogram_login_validation_failed",
        undefined,
        clientIP,
        { errors: validationResult.error.errors }
      );
      return NextResponse.json(
        {
          success: false,
          error: "Invalid input",
          code: "VALIDATION_ERROR",
        },
        { status: 400 }
      );
    }

    const { code } = validationResult.data;
    const nickName = validationResult.data.nickName; // 获取昵称
    const avatarUrl = validationResult.data.avatarUrl; // 获取头像

    // 检查区域
    if (!isChinaRegion()) {
      return NextResponse.json(
        {
          success: false,
          error: "WeChat miniprogram login only available in China region",
          code: "REGION_NOT_SUPPORTED",
        },
        { status: 400 }
      );
    }

    // 检查配置（小程序 / 开放平台 二选一均可）
    const mpAppId = process.env.WECHAT_MINIPROGRAM_APP_ID;
    const mpAppSecret = process.env.WECHAT_MINIPROGRAM_APP_SECRET;
    const nativeAppId = process.env.WECHAT_APP_ID_NATIVE;
    const nativeAppSecret = process.env.WECHAT_APP_SECRET_NATIVE;
    const oauthAppId = process.env.NEXT_PUBLIC_WECHAT_APP_ID; // 网页公众号/网站 OAuth
    const oauthAppSecret = process.env.WECHAT_APP_SECRET; // 网页公众号/网站 OAuth

    const hasMpConfig = !!mpAppId && !!mpAppSecret;
    const hasNativeConfig = !!nativeAppId && !!nativeAppSecret;
    const hasOauthConfig = !!oauthAppId && !!oauthAppSecret;

    if (!hasMpConfig && !hasNativeConfig && !hasOauthConfig) {
      logSecurityEvent("miniprogram_missing_config", undefined, clientIP, {
        hasMpConfig,
        hasNativeConfig,
        hasOauthConfig,
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

    let loginSource: "miniprogram" | "oauth" = "miniprogram";
    let openid: string;
    let unionid: string | undefined;
    let resolvedNickName = nickName;
    let resolvedAvatar = avatarUrl;

    // 4️⃣ 优先尝试小程序 code 兑换，失败则按优先级回退：原生 AppID（Android）→ 网页公众号/网站 OAuth
    try {
      if (!hasMpConfig) {
        throw new Error("Miniprogram config not available, skip to native/web fallback");
      }

      logInfo("Miniprogram login: exchanging code for openid", { code });
      const wechatData = await getOpenIdByCode(code, mpAppId!, mpAppSecret!);
      ({ openid, unionid } = wechatData);
      logInfo("Miniprogram login: got openid", { openid });
      loginSource = "miniprogram";
    } catch (mpError) {
      logInfo("Miniprogram code exchange failed, checking native/web fallback", {
        error: mpError instanceof Error ? mpError.message : String(mpError),
        hasNativeConfig,
        hasOauthConfig,
      });

      // 原生 App（Android/iOS）开放平台 AppID
      if (hasNativeConfig) {
        loginSource = "oauth"; // 仍然走 OAuth 用户信息流程，但使用原生 AppID
        logInfo("Native app fallback: exchanging code for access_token", { code });
        const wechatUser = await getWechatUserByCode(code, nativeAppId!, nativeAppSecret!);
        openid = wechatUser.openid;
        unionid = wechatUser.unionid;
        resolvedNickName = wechatUser.nickname || nickName || "微信用户";
        resolvedAvatar = wechatUser.headimgurl || avatarUrl || "";
        logInfo("Native app fallback: got user info", { openid, unionid });
      } else if (hasOauthConfig) {
        // 网页公众号/网站 OAuth 兜底
        loginSource = "oauth";
        logInfo("Web OAuth fallback: exchanging code for access_token", { code });
        const wechatUser = await getWechatUserByCode(code, oauthAppId!, oauthAppSecret!);
        openid = wechatUser.openid;
        unionid = wechatUser.unionid;
        resolvedNickName = wechatUser.nickname || nickName || "微信用户";
        resolvedAvatar = wechatUser.headimgurl || avatarUrl || "";
        logInfo("Web OAuth fallback: got user info", { openid, unionid });
      } else {
        throw mpError;
      }
    }

    // 5️⃣ 查询/创建用户
    const app = getCloudBaseApp();
    const db = app.database();
    const usersCollection = db.collection("web_users");

    let userId: string | null = null;
    let existingUser: any = null;

    // 查询是否已有该用户（优先用 unionid 统一账号，其次 openid）
    try {
      if (unionid) {
        const unionResult = await usersCollection
          .where({ wechat_unionid: unionid })
          .limit(1)
          .get();

        if (unionResult.data && unionResult.data.length > 0) {
          existingUser = unionResult.data[0];
          userId = existingUser._id;
        }
      }

      if (!userId) {
        const queryResult = await usersCollection
          .where({ wechat_openid: openid })
          .limit(1)
          .get();

        if (queryResult.data && queryResult.data.length > 0) {
          existingUser = queryResult.data[0];
          userId = existingUser._id;
        }
      }
    } catch (queryError) {
      logInfo("First time miniprogram user (query returned empty)", { openid });
    }

    // 6️⃣ 创建新用户或更新现有用户
    const now = new Date().toISOString();
    const loginIdentifier = unionid || openid;
    const fallbackEmailPrefix = loginSource === "miniprogram" ? "miniprogram" : "wechat";
    const loginEmail = existingUser?.email || `${fallbackEmailPrefix}_${loginIdentifier}@local.wechat`;
    const displayName = resolvedNickName || existingUser?.name || "微信用户";
    const avatar = resolvedAvatar || existingUser?.avatar || "";

    if (!userId) {
      // 新用户
      logInfo("Creating new WeChat user", { openid, loginSource });

      const newUser = {
        wechat_openid: openid,
        wechat_unionid: unionid,
        email: loginEmail,
        name: displayName,
        avatar,
        pro: false,
        subscription_plan: "free",
        subscription_status: "inactive",
        login_count: 1,
        last_login_at: now,
        last_login_ip: clientIP,
        created_at: now,
        updated_at: now,
        region: "china",
        source: loginSource === "miniprogram" ? "miniprogram" : "wechat-oauth",
      };

      const insertResult = await usersCollection.add(newUser);
      userId = insertResult.id || insertResult._id;

      logSecurityEvent("miniprogram_user_created", userId, clientIP, {
        openid,
        loginSource,
      });
    } else {
      // 更新现有用户
      logInfo("Updating existing WeChat user", { userId, openid, loginSource });

      const updateData: any = {
        login_count: (existingUser?.login_count || 0) + 1,
        last_login_at: now,
        last_login_ip: clientIP,
        updated_at: now,
        // 回填 unionid（如果之前没有）
        ...(unionid && !existingUser?.wechat_unionid ? { wechat_unionid: unionid } : {}),
      };

      // 如果传入了昵称或头像，也一并更新
      if (resolvedNickName) {
        updateData.name = resolvedNickName;
      }
      if (resolvedAvatar) {
        updateData.avatar = resolvedAvatar;
      }

      await usersCollection.doc(userId).update(updateData);

      logSecurityEvent("miniprogram_login_successful", userId, clientIP, {
        openid,
        loginSource,
      });
    }

    if (!userId) {
      throw new Error("Failed to create or find user");
    }

    // 7️⃣ 生成 JWT tokens
    const accessPayload = {
      userId,
      email: loginEmail,
      region: "CN",
      source: loginSource,
    };

    const accessToken = jwt.sign(
      accessPayload,
      process.env.JWT_SECRET || "fallback-secret-key-for-development-only",
      { expiresIn: "1h" }
    );

    logInfo("Generated access token for miniprogram user", { userId });

    // 生成 refresh token (7 天)
    const refreshTokenResult = await createRefreshToken({
      userId,
      email: loginEmail,
      deviceInfo: loginSource === "miniprogram" ? "wechat-miniprogram" : "wechat-oauth",
      ipAddress: clientIP,
      userAgent: request.headers.get("user-agent") || undefined,
    });

    if (!refreshTokenResult) {
      throw new Error("Failed to create refresh token");
    }

    const refreshToken = refreshTokenResult.refreshToken;

    logInfo("Generated refresh token for miniprogram user", { userId });

    // 8️⃣ 返回登录成功 - 使用小程序期望的响应格式
    return NextResponse.json({
      success: true,
      data: {
        token: accessToken, // ✅ 小程序需要的 token
        refreshToken,
        userInfo: {
          id: userId,
          openid: openid,
          nickname: displayName, // ✅ 昵称
          avatar: avatar, // ✅ 头像
          avatarUrl: avatar, // 兼容字段
        },
      },
      message: "登录成功",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("❌ [Miniprogram login error]:", errorMessage);
    logSecurityEvent(
      "miniprogram_login_error",
      undefined,
      request.headers.get("x-forwarded-for") || "unknown",
      { error: errorMessage }
    );

    return NextResponse.json(
      {
        success: false,
        error: "Login failed",
        code: "MINIPROGRAM_LOGIN_FAILED",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
