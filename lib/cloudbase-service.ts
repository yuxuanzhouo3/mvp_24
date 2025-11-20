import cloudbase from "@cloudbase/node-sdk";
import bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import { createRefreshToken } from "@/lib/refresh-token-manager";

let cachedApp: any = null;

function initCloudBase() {
  if (cachedApp) {
    return cachedApp;
  }

  cachedApp = cloudbase.init({
    env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
    secretId: process.env.CLOUDBASE_SECRET_ID,
    secretKey: process.env.CLOUDBASE_SECRET_KEY,
  });

  return cachedApp;
}

export function extractUserIdFromToken(token: string): string | null {
  if (!token) {
    console.error(" [CloudBase Service] 无效的 token");
    return null;
  }

  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      console.error(
        " [CloudBase Service] Token 格式错误，部分数:",
        parts.length
      );
      return null;
    }

    const payload = parts[1];
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = Buffer.from(padded, "base64").toString("utf-8");
    const claims = JSON.parse(decoded);

    const userId = claims.userId || claims.uid || claims.sub || claims.user_id;
    if (!userId) {
      console.error(
        " [CloudBase Service] Token 中找不到 userId/uid/sub/user_id"
      );
      return null;
    }

    console.log(" [CloudBase Service] Token 解码成功，userId:", userId);
    return userId;
  } catch (error) {
    console.error(" [CloudBase Service] Token 解码失败:", error);
    return null;
  }
}

export async function loginUser(
  email: string,
  password: string,
  options?: { deviceInfo?: string; ipAddress?: string; userAgent?: string }
): Promise<{
  success: boolean;
  userId?: string;
  email?: string;
  name?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenMeta?: { accessTokenExpiresIn: number; refreshTokenExpiresIn: number };
  error?: string;
}> {
  try {
    console.log(" [CloudBase Service] 开始登录，邮箱:", email);

    const app = initCloudBase();
    const db = app.database();
    const usersCollection = db.collection("web_users");

    const userResult = await usersCollection.where({ email }).get();

    if (!userResult.data || userResult.data.length === 0) {
      return {
        success: false,
        error: "用户不存在或密码错误",
      };
    }

    const user = userResult.data[0];

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return {
        success: false,
        error: "用户不存在或密码错误",
      };
    }

    console.log(" [CloudBase Service] 登录成功");

    const tokenPayload = {
      userId: user._id,
      email: user.email,
      region: "china",
    };

    // ✅ 生成短期 Access Token (1小时)
    const accessToken = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || "fallback-secret-key-for-development-only",
      { expiresIn: "1h" }
    );

    // ✅ 生成并保存长期 Refresh Token (7天) - 方案 B
    const refreshTokenRecord = await createRefreshToken({
      userId: user._id,
      email: user.email,
      deviceInfo: options?.deviceInfo,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });

    if (!refreshTokenRecord) {
      return {
        success: false,
        error: "无法生成 refresh token",
      };
    }

    const refreshToken = refreshTokenRecord.refreshToken;

    return {
      success: true,
      userId: user._id,
      email: user.email,
      name: user.name,
      accessToken,
      refreshToken,
      tokenMeta: {
        accessTokenExpiresIn: 3600, // 1 小时
        refreshTokenExpiresIn: 604800, // 7 天
      },
    };
  } catch (error: any) {
    console.error(" [CloudBase Service] 登录失败:", error);
    return {
      success: false,
      error: error.message || "登录失败",
    };
  }
}

export async function signupUser(
  email: string,
  password: string,
  options?: { deviceInfo?: string; ipAddress?: string; userAgent?: string }
): Promise<{
  success: boolean;
  userId?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenMeta?: { accessTokenExpiresIn: number; refreshTokenExpiresIn: number };
  error?: string;
}> {
  try {
    console.log(" [CloudBase Service] 开始注册，邮箱:", email);

    const app = initCloudBase();
    const db = app.database();
    const usersCollection = db.collection("web_users");

    const existingUserResult = await usersCollection.where({ email }).get();

    if (existingUserResult.data && existingUserResult.data.length > 0) {
      return {
        success: false,
        error: "该邮箱已被注册",
      };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      email,
      password: hashedPassword,
      name: email.includes("@") ? email.split("@")[0] : email,
      pro: false,
      region: "china",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await usersCollection.add(newUser);

    console.log(" [CloudBase Service] 注册成功");

    const tokenPayload = {
      userId: result.id,
      email,
      region: "china",
    };

    // ✅ 生成短期 accessToken (1小时)
    const accessToken = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || "fallback-secret-key-for-development-only",
      { expiresIn: "1h" }
    );

    console.log("[CloudBase Service] AccessToken generated for signup");

    // ✅ 生成并持久化 refreshToken (7天)
    const refreshTokenRecord = await createRefreshToken({
      userId: result.id,
      email,
      deviceInfo: options?.deviceInfo || "web-signup",
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });

    if (!refreshTokenRecord) {
      console.warn(
        "[CloudBase Service] Failed to create refresh token during signup"
      );
      // 不返回错误，因为 accessToken 已生成可用
      return {
        success: true,
        userId: result.id,
        accessToken,
        refreshToken: undefined as any,
        tokenMeta: {
          accessTokenExpiresIn: 3600,
          refreshTokenExpiresIn: 0,
        },
      };
    }

    const refreshTokenValue = refreshTokenRecord.refreshToken;

    return {
      success: true,
      userId: result.id,
      accessToken,
      refreshToken: refreshTokenValue,
      tokenMeta: {
        accessTokenExpiresIn: 3600, // 1 hour
        refreshTokenExpiresIn: 604800, // 7 days
      },
    };
  } catch (error: any) {
    console.error(" [CloudBase Service] 注册失败:", error);
    return {
      success: false,
      error: error.message || "注册失败",
    };
  }
}

export function getDatabase() {
  const app = initCloudBase();
  return app.database();
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    const userId = extractUserIdFromToken(token);
    return !!userId;
  } catch (error) {
    console.error(" [CloudBase Service] Token 验证失败:", error);
    return false;
  }
}

/**
 * 从 CloudBase 下载文件
 * @param fileID CloudBase 文件 ID (格式: cloud://bucket/path/to/file)
 * @returns 文件内容的 Buffer
 * @throws 如果文件不存在、权限不足、网络错误等会抛出异常
 */
export async function downloadFileFromCloudBase(fileID: string): Promise<Buffer> {
  try {
    console.log(" [CloudBase Service] 开始下载文件，fileID:", fileID);

    const app = initCloudBase();

    // 验证 CloudBase 初始化
    if (!app) {
      throw new Error('CloudBase 初始化失败，请检查环境变量 NEXT_PUBLIC_WECHAT_CLOUDBASE_ID, CLOUDBASE_SECRET_ID, CLOUDBASE_SECRET_KEY');
    }

    const res = await app.downloadFile({
      fileID: fileID,
    });

    if (!res || !res.fileContent) {
      throw new Error(`文件内容为空，fileID: ${fileID}（可能文件不存在或权限不足）`);
    }

    console.log(" [CloudBase Service] 文件下载成功，大小:", res.fileContent.length, 'bytes');
    return res.fileContent;
  } catch (error: any) {
    const errorMessage = error.message || error.toString();
    console.error(" [CloudBase Service] 文件下载失败:", errorMessage);

    // 根据错误类型提供更详细的错误信息
    if (errorMessage.includes('404') || errorMessage.includes('not found')) {
      throw new Error(`文件不存在: ${fileID}`);
    } else if (errorMessage.includes('403') || errorMessage.includes('permission') || errorMessage.includes('Forbidden')) {
      throw new Error(`无权限访问文件: ${fileID}`);
    } else if (errorMessage.includes('timeout')) {
      throw new Error(`文件下载超时，请检查网络或 CloudBase 服务状态`);
    } else if (errorMessage.includes('CloudBase 初始化失败')) {
      throw error;
    } else {
      throw new Error(`文件下载失败: ${errorMessage}`);
    }
  }
}
