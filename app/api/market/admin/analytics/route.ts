import { NextRequest, NextResponse } from "next/server";
import { verifyMarketAdminToken } from "@/lib/market/admin-auth";
import { getMarketAdminAnalytics } from "@/lib/market/analytics";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = verifyMarketAdminToken(request);
  if (!auth.ok) return auth.response;

  try {
    const days = Number(request.nextUrl.searchParams.get("days") || 30);
    const region = String(request.nextUrl.searchParams.get("region") || "ALL").trim();
    const analytics = await getMarketAdminAnalytics({ days, region: region as any });
    return NextResponse.json({ success: true, analytics });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load market analytics" },
      { status: 500 }
    );
  }
}
