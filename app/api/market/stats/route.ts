import { NextRequest, NextResponse } from "next/server";
import { getReferralStatsByUser } from "@/lib/market/referrals";
import { verifyMarketAdminToken } from "@/lib/market/admin-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = verifyMarketAdminToken(request);
  if (!auth.ok) return auth.response;

  try {
    const userId = String(request.nextUrl.searchParams.get("userId") || "").trim();
    const region = String(request.nextUrl.searchParams.get("region") || "ALL").trim();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 }
      );
    }

    const stats = await getReferralStatsByUser(userId, region as any);
    return NextResponse.json({ success: true, stats });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load referral stats" },
      { status: 500 }
    );
  }
}
