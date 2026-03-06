import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyPassword } from "@/lib/admin/password";
import {
  CloudBaseConnector,
  isCloudBaseConfigured,
} from "@/lib/admin/cloudbase-connector";
import {
  createAdminSession,
  destroyAdminSession,
  verifyAdminSessionToken,
} from "@/lib/admin/session";
import { IS_DOMESTIC_VERSION } from "@/config";

export const MARKET_ADMIN_SESSION_COOKIE = "admin_session";

export interface MarketAdminPrincipal {
  userId: string;
  username: string;
}

async function getCloudbaseDb() {
  const connector = new CloudBaseConnector();
  await connector.initialize();
  return connector.getClient();
}

export async function verifyMarketAdminLogin(input: {
  username?: string;
  password?: string;
}): Promise<MarketAdminPrincipal | null> {
  const username = String(input.username || "").trim();
  const password = String(input.password || "").trim();
  if (!username || !password) {
    return null;
  }

  try {
    let admin: { id: string; username: string; password_hash: string } | null =
      null;

    if (IS_DOMESTIC_VERSION && isCloudBaseConfigured()) {
      const db = await getCloudbaseDb();
      const result = await db
        .collection("admin_users")
        .where({ username })
        .limit(1)
        .get();

      if (result.data && result.data.length > 0) {
        const row = result.data[0];
        admin = {
          id: row._id || row.id,
          username: String(row.username || username),
          password_hash: String(row.password_hash || ""),
        };
      }
    } else {
      const { data } = await supabaseAdmin
        .from("admin_users")
        .select("id, username, password_hash")
        .eq("username", username)
        .maybeSingle();

      if (data) {
        admin = {
          id: data.id,
          username: data.username,
          password_hash: data.password_hash,
        };
      }
    }

    if (!admin) {
      return null;
    }

    const valid = await verifyPassword(password, admin.password_hash);
    if (!valid) {
      return null;
    }

    return {
      userId: admin.id,
      username: admin.username,
    };
  } catch {
    return null;
  }
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
