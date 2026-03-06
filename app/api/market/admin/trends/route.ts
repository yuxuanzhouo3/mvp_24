import { NextRequest, NextResponse } from "next/server";
import { verifyMarketAdminToken } from "@/lib/market/admin-auth";
import { getMarketAdminTrends } from "@/lib/market/referrals";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = verifyMarketAdminToken(request);
  if (!auth.ok) return auth.response;

  try {
    const days = Number(request.nextUrl.searchParams.get("days") || 14);
    const region = String(request.nextUrl.searchParams.get("region") || "ALL").trim();
    const trends = await getMarketAdminTrends({ days, region: region as any });
    return NextResponse.json({ success: true, trends });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load trend data" },
      { status: 500 }
    );
  }
}
