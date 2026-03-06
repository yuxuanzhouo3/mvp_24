import { NextRequest, NextResponse } from "next/server";
import { clearMarketAdminSession } from "@/lib/market/admin-auth";

export const runtime = "nodejs";

export async function POST(_request: NextRequest) {
  await clearMarketAdminSession();
  return NextResponse.json({ success: true });
}
