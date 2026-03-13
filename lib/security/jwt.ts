import crypto from "crypto";
import * as jwt from "jsonwebtoken";

const DEV_FALLBACK_SECRET = crypto.randomBytes(32).toString("hex");

export type AccessTokenPayload = {
  userId: string;
  email: string;
  region: string;
  source?: string;
  tokenType: "access";
  iat?: number;
  exp?: number;
};

export type RefreshTokenPayload = {
  userId: string;
  tokenId: string;
  tokenType: "refresh";
  iat?: number;
  exp?: number;
};

export type ChatExportTokenPayload = {
  userId: string;
  region: "CN" | "INTL";
  sessionIds: string[];
  format: "markdown" | "pdf";
  language?: "zh" | "en";
  tokenType: "chat-export";
  iat?: number;
  exp?: number;
};

function getJwtSecret(): string {
  const configured = process.env.JWT_SECRET;
  if (configured && configured.trim().length > 0) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }

  console.warn(
    "[JWT] JWT_SECRET is not configured. Using ephemeral development secret."
  );
  return DEV_FALLBACK_SECRET;
}

export function signAccessToken(
  payload: Omit<AccessTokenPayload, "tokenType">
): string {
  return jwt.sign(
    {
      ...payload,
      tokenType: "access",
    },
    getJwtSecret(),
    { expiresIn: "1h" }
  );
}

export function signRefreshToken(
  payload: Omit<RefreshTokenPayload, "tokenType">
): string {
  return jwt.sign(
    {
      ...payload,
      tokenType: "refresh",
    },
    getJwtSecret(),
    { expiresIn: "7d" }
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, getJwtSecret()) as any;
  if (decoded.tokenType && decoded.tokenType !== "access") {
    throw new Error("Invalid token type");
  }
  // 兼容旧 token：历史 access token 可能没有 tokenType
  if (decoded.tokenType == null && decoded.tokenId) {
    throw new Error("Refresh token cannot be used as access token");
  }
  if (!decoded.userId || !decoded.email) {
    throw new Error("Invalid access token payload");
  }
  return decoded as AccessTokenPayload;
}

export function verifyRefreshTokenJwt(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, getJwtSecret()) as any;
  if (decoded.tokenType && decoded.tokenType !== "refresh") {
    throw new Error("Invalid token type");
  }
  // 兼容旧 token：历史 refresh token 可能没有 tokenType
  if (!decoded.userId || !decoded.tokenId) {
    throw new Error("Invalid refresh token payload");
  }
  if (decoded.tokenType == null && decoded.email) {
    throw new Error("Access token cannot be used as refresh token");
  }
  return decoded as RefreshTokenPayload;
}

export function signChatExportToken(
  payload: Omit<ChatExportTokenPayload, "tokenType">
): string {
  return jwt.sign(
    {
      ...payload,
      tokenType: "chat-export",
    },
    getJwtSecret(),
    { expiresIn: "15m" }
  );
}

export function verifyChatExportToken(token: string): ChatExportTokenPayload {
  const decoded = jwt.verify(token, getJwtSecret()) as any;
  if (decoded.tokenType !== "chat-export") {
    throw new Error("Invalid token type");
  }
  if (
    !decoded.userId ||
    !Array.isArray(decoded.sessionIds) ||
    decoded.sessionIds.length === 0 ||
    (decoded.format !== "markdown" && decoded.format !== "pdf") ||
    (decoded.region !== "CN" && decoded.region !== "INTL")
  ) {
    throw new Error("Invalid chat export token payload");
  }
  if (decoded.language && decoded.language !== "zh" && decoded.language !== "en") {
    throw new Error("Invalid language");
  }
  return decoded as ChatExportTokenPayload;
}
