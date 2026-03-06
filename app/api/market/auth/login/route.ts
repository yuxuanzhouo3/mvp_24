import { NextRequest, NextResponse } from "next/server";
import {
  createMarketAdminSession,
  verifyMarketAdminLogin,
} from "@/lib/market/admin-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "").trim();

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: "username and password are required" },
        { status: 400 }
      );
    }

    const admin = await verifyMarketAdminLogin({ username, password });
    if (!admin) {
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 }
      );
    }

    await createMarketAdminSession(admin);
    return NextResponse.json({ success: true, admin: { username: admin.username } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Login failed" },
      { status: 500 }
    );
  }
}
