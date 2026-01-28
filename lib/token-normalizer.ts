/**
 * Token 标准化器
 * 将 CloudBase 和 Supabase 的不同 JWT 格式统一为标准格式
 */

export interface NormalizedToken {
  userId: string;
  email?: string;
  region: "CN" | "INTL";
  iat: number;
  exp: number;
  phone?: string;
}

/**
 * 规范化 Token Payload
 * 将 CloudBase JWT 和 Supabase JWT 转换为统一格式
 */
export function normalizeTokenPayload(
  payload: any,
  region: "CN" | "INTL"
): NormalizedToken {
  if (region === "CN") {
    // CloudBase JWT 格式: { userId, email, phone, iat, exp, ... }
    return {
      userId: payload.userId,
      email: payload.email,
      phone: payload.phone,
      region: "CN",
      iat: payload.iat,
      exp: payload.exp,
    };
  } else {
    // Supabase JWT 格式: { sub, user: { email }, iat, exp, ... }
    return {
      userId: payload.sub,
      email: payload.user?.email,
      phone: payload.user?.phone,
      region: "INTL",
      iat: payload.iat,
      exp: payload.exp,
    };
  }
}

/**
 * 验证规范化的 Token 是否过期
 */
export function isTokenExpired(normalized: NormalizedToken): boolean {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return nowSeconds > normalized.exp;
}

/**
 * 获取 Token 剩余时间（毫秒）
 */
export function getTokenExpiresIn(normalized: NormalizedToken): number {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresInSeconds = normalized.exp - nowSeconds;
  return Math.max(0, expiresInSeconds * 1000);
}

/**
 * 检查 Token 是否即将过期（X 秒内）
 */
export function isTokenExpiringWithin(
  normalized: NormalizedToken,
  secondsThreshold: number = 300
): boolean {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return normalized.exp - nowSeconds < secondsThreshold;
}
