/**
 * Admin Session 管理工具
 * 基于 HttpOnly Cookie 实现管理员会话管理
 */

import { cookies } from "next/headers";
import { getCurrentAdminRegion, type AdminRegion } from "@/lib/admin/region";

const SESSION_COOKIE_NAME = "admin_session";
const SESSION_MAX_AGE = 60 * 60 * 24;
const SECRET_KEY =
  process.env.ADMIN_SESSION_SECRET || "admin-secret-key-change-in-production";

export interface AdminSession {
  userId: string;
  username: string;
  region: AdminRegion;
  createdAt: number;
  expiresAt: number;
}

function encryptSession(session: AdminSession): string {
  const payload = JSON.stringify(session);
  const encoded = Buffer.from(payload).toString("base64");
  const signature = Buffer.from(`${encoded}.${SECRET_KEY}`).toString("base64");
  return `${encoded}.${signature.slice(0, 16)}`;
}

function decryptSession(token: string): AdminSession | null {
  try {
    const [encoded, sig] = token.split(".");
    if (!encoded || !sig) return null;

    const expectedSig = Buffer.from(`${encoded}.${SECRET_KEY}`)
      .toString("base64")
      .slice(0, 16);

    if (sig !== expectedSig) return null;

    const payload = Buffer.from(encoded, "base64").toString("utf-8");
    return JSON.parse(payload) as AdminSession;
  } catch {
    return null;
  }
}

function isSessionRegionValid(session: AdminSession | null): session is AdminSession {
  return !!session && session.region === getCurrentAdminRegion();
}

export async function createAdminSession(
  userId: string,
  username: string
): Promise<void> {
  const now = Date.now();
  const session: AdminSession = {
    userId,
    username,
    region: getCurrentAdminRegion(),
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

export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  const session = decryptSession(token);
  if (!session) return null;

  if (Date.now() > session.expiresAt || !isSessionRegionValid(session)) {
    await destroyAdminSession();
    return null;
  }

  return session;
}

export async function verifyAdminSession(): Promise<boolean> {
  const session = await getAdminSession();
  return session !== null;
}

export async function destroyAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function refreshAdminSession(): Promise<void> {
  const session = await getAdminSession();
  if (session) {
    await createAdminSession(session.userId, session.username);
  }
}

export function verifyAdminSessionToken(token: string): AdminSession | null {
  const session = decryptSession(token);
  if (!session) return null;

  if (Date.now() > session.expiresAt || !isSessionRegionValid(session)) {
    return null;
  }

  return session;
}
