import { NextRequest, NextResponse } from "next/server";
import { verifyMarketAdminToken } from "@/lib/market/admin-auth";
import { getMarketAdminChannels } from "@/lib/market/referrals";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = verifyMarketAdminToken(request);
  if (!auth.ok) return auth.response;

  try {
    const limit = Number(request.nextUrl.searchParams.get("limit") || 12);
    const region = String(request.nextUrl.searchParams.get("region") || "ALL").trim();
    const channels = await getMarketAdminChannels({ limit, region: region as any });
    return NextResponse.json({ success: true, channels });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load channel data" },
      { status: 500 }
    );
  }
}
