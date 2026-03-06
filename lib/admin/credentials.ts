import { timingSafeEqual } from "crypto";
import { verifyPassword } from "@/lib/admin/password";

export interface VerifiedAdminPrincipal {
  userId: string;
  username: string;
}

interface ResolvedAdminCredentials {
  username: string;
  password?: string;
  passwordHash?: string;
}

function normalize(value: unknown): string {
  return String(value || "").trim();
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveAdminCredentialsFromEnv(): ResolvedAdminCredentials | null {
  const username = normalize(process.env.ADMIN_USERNAME);
  const passwordHash = normalize(process.env.ADMIN_PASSWORD_HASH);
  const password = normalize(process.env.ADMIN_PASSWORD);

  if (!username) {
    return null;
  }

  if (!passwordHash && !password) {
    return null;
  }

  return {
    username,
    password: password || undefined,
    passwordHash: passwordHash || undefined,
  };
}

export function isAdminCredentialsConfigured(): boolean {
  return resolveAdminCredentialsFromEnv() !== null;
}

export async function verifyAdminCredentialsFromEnv(input: {
  username?: string;
  password?: string;
}): Promise<VerifiedAdminPrincipal | null> {
  const resolved = resolveAdminCredentialsFromEnv();
  if (!resolved) {
    return null;
  }

  const username = normalize(input.username);
  const password = normalize(input.password);
  if (!username || !password) {
    return null;
  }

  if (!safeCompare(username, resolved.username)) {
    return null;
  }

  if (resolved.passwordHash) {
    const isValid = await verifyPassword(password, resolved.passwordHash);
    if (!isValid) {
      return null;
    }
  } else if (!safeCompare(password, resolved.password || "")) {
    return null;
  }

  return {
    userId: `env-admin:${resolved.username}`,
    username: resolved.username,
  };
}

