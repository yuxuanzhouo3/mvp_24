import { NextRequest, NextResponse } from "next/server";
import { readMarketAdminSessionFromRequest } from "@/lib/market/admin-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = readMarketAdminSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ success: false, authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    authenticated: true,
    admin: {
      userId: session.userId,
      username: session.username,
    },
  });
}
