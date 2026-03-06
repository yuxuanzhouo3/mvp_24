import { NextRequest, NextResponse } from "next/server";
import {
  createAdminSession,
  destroyAdminSession,
  verifyAdminSessionToken,
} from "@/lib/admin/session";
import {
  verifyAdminCredentialsFromEnv,
} from "@/lib/admin/credentials";

export const MARKET_ADMIN_SESSION_COOKIE = "admin_session";

export interface MarketAdminPrincipal {
  userId: string;
  username: string;
}

export async function verifyMarketAdminLogin(input: {
  username?: string;
  password?: string;
}): Promise<MarketAdminPrincipal | null> {
  const principal = await verifyAdminCredentialsFromEnv(input);
  if (!principal) {
    return null;
  }

  return principal;
}

export async function createMarketAdminSession(admin: MarketAdminPrincipal) {
  await createAdminSession(admin.userId, admin.username);
}

export async function clearMarketAdminSession() {
  await destroyAdminSession();
}

export function decodeMarketAdminSessionToken(
  token?: string | null
): MarketAdminPrincipal | null {
  if (!token) {
    return null;
  }

  const session = verifyAdminSessionToken(token);
  if (!session) {
    return null;
  }

  return {
    userId: session.userId,
    username: session.username,
  };
}

export function readMarketAdminSessionFromRequest(
  request: NextRequest
): MarketAdminPrincipal | null {
  const token = request.cookies.get(MARKET_ADMIN_SESSION_COOKIE)?.value;
  return decodeMarketAdminSessionToken(token || null);
}

export function verifyMarketAdminToken(
  request: NextRequest
):
  | { ok: true; admin: MarketAdminPrincipal }
  | { ok: false; response: NextResponse } {
  const session = readMarketAdminSessionFromRequest(request);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  return { ok: true, admin: session };
}
