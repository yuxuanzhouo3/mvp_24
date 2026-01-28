/**
 * Admin Session 管理工具
 * 基于 HttpOnly Cookie 实现管理员会话管理
 */

import { cookies } from "next/headers";

// Session 配置
const SESSION_COOKIE_NAME = "admin_session";
const SESSION_MAX_AGE = 60 * 60 * 24; // 24小时

// 加密密钥
const SECRET_KEY = process.env.ADMIN_SESSION_SECRET || "admin-secret-key-change-in-production";

export interface AdminSession {
  userId: string;
  username: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * 加密 Session
 */
function encryptSession(session: AdminSession): string {
  const payload = JSON.stringify(session);
  const encoded = Buffer.from(payload).toString("base64");
  // 添加简单签名
  const signature = Buffer.from(
    `${encoded}.${SECRET_KEY}`
  ).toString("base64");
  return `${encoded}.${signature.slice(0, 16)}`;
}

/**
 * 解密 Session
 */
function decryptSession(token: string): AdminSession | null {
  try {
    const [encoded, sig] = token.split(".");
    if (!encoded || !sig) return null;

    // 验证签名
    const expectedSig = Buffer.from(
      `${encoded}.${SECRET_KEY}`
    ).toString("base64").slice(0, 16);

    if (sig !== expectedSig) return null;

    const payload = Buffer.from(encoded, "base64").toString("utf-8");
    return JSON.parse(payload) as AdminSession;
  } catch {
    return null;
  }
}

/**
 * 创建管理员会话
 */
export async function createAdminSession(
  userId: string,
  username: string
): Promise<void> {
  const now = Date.now();
  const session: AdminSession = {
    userId,
    username,
    createdAt: now,
    expiresAt: now + SESSION_MAX_AGE * 1000,
  };

  const token = encryptSession(session);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

/**
 * 获取当前管理员会话
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  const session = decryptSession(token);
  if (!session) return null;

  // 检查是否过期
  if (Date.now() > session.expiresAt) {
    await destroyAdminSession();
    return null;
  }

  return session;
}

/**
 * 验证管理员会话是否有效
 */
export async function verifyAdminSession(): Promise<boolean> {
  const session = await getAdminSession();
  return session !== null;
}

/**
 * 销毁管理员会话（登出）
 */
export async function destroyAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * 刷新会话（延长过期时间）
 */
export async function refreshAdminSession(): Promise<void> {
  const session = await getAdminSession();
  if (session) {
    await createAdminSession(session.userId, session.username);
  }
}

/**
 * 验证 Session Token（用于 middleware）
 * 注意：这个函数不使用 cookies()，而是直接接收 token
 */
export function verifyAdminSessionToken(token: string): AdminSession | null {
  const session = decryptSession(token);
  if (!session) return null;

  // 检查是否过期
  if (Date.now() > session.expiresAt) {
    return null;
  }

  return session;
}
