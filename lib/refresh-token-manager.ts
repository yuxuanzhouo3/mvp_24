/**
 * Refresh Token 管理器
 * 负责 refresh token 的生成、验证、撤销和追踪
 * 方案 B: JWT + 腾讯云数据库
 */

import * as crypto from "crypto";
import * as jwt from "jsonwebtoken";
import { getCloudBaseApp } from "@/lib/cloudbase/init";
import { RefreshTokenRecord } from "@/lib/database/cloudbase-schema";
import { CLOUDBASE_COLLECTIONS } from "@/lib/database/cloudbase-schema";

// 生成 UUID v4
function generateUUID(): string {
  return crypto.randomUUID();
}

interface CreateRefreshTokenOptions {
  userId: string;
  email: string;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateRefreshTokenResult {
  tokenId: string;
  refreshToken: string;
  userId: string;
  email: string;
}

/**
 * 生成并保存 refresh token
 * 方案 B: 生成 JWT token 并在腾讯云中记录
 */
export async function createRefreshToken(
  options: CreateRefreshTokenOptions
): Promise<CreateRefreshTokenResult | null> {
  try {
    const { userId, email, deviceInfo, ipAddress, userAgent } = options;

    // 生成唯一的 token ID
    const tokenId = generateUUID();

    // 生成 refresh token JWT
    const refreshToken = jwt.sign(
      { userId, tokenId },
      process.env.JWT_SECRET || "fallback-secret-key-for-development-only",
      { expiresIn: "7d" }
    );

    // 保存到腾讯云
    const db = getCloudBaseApp().database();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7天后

    const tokenRecord: RefreshTokenRecord = {
      tokenId,
      userId,
      email,
      refreshToken, // 可选：保存加密后的token副本
      deviceInfo,
      ipAddress,
      userAgent,
      isRevoked: false,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      usageCount: 0,
      region: "china",
    };

    const result = await db
      .collection(CLOUDBASE_COLLECTIONS.REFRESH_TOKENS)
      .add(tokenRecord);

    console.log(
      `✅ [Refresh Token Manager] Refresh token 已保存，tokenId: ${tokenId}, userId: ${userId}`
    );

    return {
      tokenId,
      refreshToken,
      userId,
      email,
    };
  } catch (error) {
    console.error("[Refresh Token Manager] 生成 refresh token 失败:", error);
    return null;
  }
}

interface VerifyRefreshTokenResult {
  valid: boolean;
  userId?: string;
  email?: string;
  tokenId?: string;
  error?: string;
}

/**
 * 验证 refresh token 是否有效
 * 方案 B: 验证 JWT 签名 + 检查腾讯云中的状态
 */
export async function verifyRefreshToken(
  token: string
): Promise<VerifyRefreshTokenResult> {
  try {
    // 1. 验证 JWT 签名和过期时间
    let payload: any;
    try {
      payload = jwt.verify(
        token,
        process.env.JWT_SECRET || "fallback-secret-key-for-development-only"
      );
    } catch (error) {
      console.warn("[Refresh Token Manager] JWT 验证失败:", error);
      return {
        valid: false,
        error: "Invalid refresh token signature or expired",
      };
    }

    const { userId, tokenId } = payload;
    if (!userId || !tokenId) {
      return {
        valid: false,
        error: "Invalid refresh token payload",
      };
    }

    // 2. 检查腾讯云中是否存在且未被撤销
    const db = getCloudBaseApp().database();
    const result = await db
      .collection(CLOUDBASE_COLLECTIONS.REFRESH_TOKENS)
      .where({
        tokenId,
        userId,
        isRevoked: false,
      })
      .get();

    if (!result.data || result.data.length === 0) {
      console.warn(
        `[Refresh Token Manager] Refresh token 已被撤销或不存在: tokenId=${tokenId}, userId=${userId}`
      );
      return {
        valid: false,
        error: "Refresh token has been revoked or not found",
      };
    }

    const tokenRecord = result.data[0];

    // 3. 检查是否已过期
    if (new Date(tokenRecord.expiresAt) < new Date()) {
      return {
        valid: false,
        error: "Refresh token has expired",
      };
    }

    // 4. 更新最后使用时间和使用次数
    await db
      .collection(CLOUDBASE_COLLECTIONS.REFRESH_TOKENS)
      .doc(tokenRecord._id)
      .update({
        lastUsedAt: new Date().toISOString(),
        usageCount: (tokenRecord.usageCount || 0) + 1,
      });

    console.log(
      `✅ [Refresh Token Manager] Refresh token 验证成功: tokenId=${tokenId}, userId=${userId}`
    );

    return {
      valid: true,
      userId,
      email: tokenRecord.email,
      tokenId,
    };
  } catch (error) {
    console.error("[Refresh Token Manager] 验证 refresh token 失败:", error);
    return {
      valid: false,
      error: "Failed to verify refresh token",
    };
  }
}

/**
 * 撤销单个 refresh token
 */
export async function revokeRefreshToken(
  tokenId: string,
  reason?: string
): Promise<boolean> {
  try {
    const db = getCloudBaseApp().database();
    await db
      .collection(CLOUDBASE_COLLECTIONS.REFRESH_TOKENS)
      .where({ tokenId })
      .update({
        isRevoked: true,
        revokedAt: new Date().toISOString(),
        revokeReason: reason || "manual_revocation",
      });

    console.log(
      `✅ [Refresh Token Manager] Refresh token 已撤销: tokenId=${tokenId}, reason=${
        reason || "manual"
      }`
    );
    return true;
  } catch (error) {
    console.error("[Refresh Token Manager] 撤销 token 失败:", error);
    return false;
  }
}

/**
 * 撤销用户的所有 refresh tokens（登出时调用）
 */
export async function revokeAllUserTokens(
  userId: string,
  reason?: string
): Promise<{ success: boolean; revokedCount: number; error?: string }> {
  try {
    const db = getCloudBaseApp().database();
    const result = await db
      .collection(CLOUDBASE_COLLECTIONS.REFRESH_TOKENS)
      .where({
        userId,
        isRevoked: false,
      })
      .update({
        isRevoked: true,
        revokedAt: new Date().toISOString(),
        revokeReason: reason || "logout",
      });

    const revokedCount = result.updated || 0;
    console.log(
      `✅ [Refresh Token Manager] 用户所有 refresh tokens 已撤销: userId=${userId}, reason=${
        reason || "logout"
      }, count=${revokedCount}`
    );

    return {
      success: true,
      revokedCount,
    };
  } catch (error: any) {
    console.error("[Refresh Token Manager] 撤销用户所有 tokens 失败:", error);
    return {
      success: false,
      revokedCount: 0,
      error: error.message || "Failed to revoke tokens",
    };
  }
}

/**
 * 清理过期的 refresh tokens（可定期运行的清理任务）
 */
export async function cleanupExpiredTokens(): Promise<number> {
  try {
    const db = getCloudBaseApp().database();
    const now = new Date().toISOString();

    const result = await db
      .collection(CLOUDBASE_COLLECTIONS.REFRESH_TOKENS)
      .where({
        expiresAt: db.command.lt(now),
      })
      .remove();

    console.log(
      `✅ [Refresh Token Manager] 已清理 ${
        result.deleted || 0
      } 个过期的 refresh tokens`
    );

    return result.deleted || 0;
  } catch (error) {
    console.error("[Refresh Token Manager] 清理过期 tokens 失败:", error);
    return 0;
  }
}

/**
 * 获取用户的所有活跃 refresh tokens（用于显示登录会话）
 */
export async function getUserActiveTokens(
  userId: string
): Promise<RefreshTokenRecord[]> {
  try {
    const db = getCloudBaseApp().database();
    const now = new Date().toISOString();

    const result = await db
      .collection(CLOUDBASE_COLLECTIONS.REFRESH_TOKENS)
      .where({
        userId,
        isRevoked: false,
        expiresAt: db.command.gt(now),
      })
      .orderBy("createdAt", "desc")
      .get();

    return (result.data as RefreshTokenRecord[]) || [];
  } catch (error) {
    console.error("[Refresh Token Manager] 获取用户活跃 tokens 失败:", error);
    return [];
  }
}

/**
 * 检测异常登录（多个 IP 在短时间内登录）
 */
export async function detectAnomalousLogin(
  userId: string,
  currentIp: string,
  timeWindowMinutes: number = 5
): Promise<boolean> {
  try {
    const db = getCloudBaseApp().database();
    const timeAgo = new Date(
      Date.now() - timeWindowMinutes * 60 * 1000
    ).toISOString();

    const result = await db
      .collection(CLOUDBASE_COLLECTIONS.REFRESH_TOKENS)
      .where({
        userId,
        isRevoked: false,
        createdAt: db.command.gt(timeAgo),
      })
      .get();

    if (!result.data || result.data.length === 0) {
      return false;
    }

    // 检查是否有不同的 IP
    const uniqueIps = new Set(
      result.data.map((t: RefreshTokenRecord) => t.ipAddress).filter(Boolean)
    );

    const isAnomalous =
      uniqueIps.size > 1 || (uniqueIps.size === 1 && !uniqueIps.has(currentIp));

    if (isAnomalous) {
      console.warn(
        `⚠️ [Refresh Token Manager] 检测到异常登录: userId=${userId}, ips=${Array.from(
          uniqueIps
        ).join(",")}`
      );
    }

    return isAnomalous;
  } catch (error) {
    console.error("[Refresh Token Manager] 检测异常登录失败:", error);
    return false;
  }
}
