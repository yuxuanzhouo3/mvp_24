import { NextRequest, NextResponse } from "next/server";
import { createReferralLink, listReferralLinksByUser } from "@/lib/market/referrals";
import { verifyMarketAdminToken } from "@/lib/market/admin-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = verifyMarketAdminToken(request);
  if (!auth.ok) return auth.response;

  try {
    const userId = String(request.nextUrl.searchParams.get("userId") || "").trim();
    const limit = Number(request.nextUrl.searchParams.get("limit") || 50);
    const region = String(request.nextUrl.searchParams.get("region") || "ALL").trim();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 }
      );
    }

    const links = await listReferralLinksByUser(userId, limit, region as any);
    return NextResponse.json({ success: true, links });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load referral links" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = verifyMarketAdminToken(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId || "").trim();
    const toolSlug = String(body?.toolSlug || "").trim();
    const sourceDefault = String(body?.source || "").trim();
    const region = String(body?.region || "ALL").trim();

    if (!userId || !toolSlug) {
      return NextResponse.json(
        { success: false, error: "userId and toolSlug are required" },
        { status: 400 }
      );
    }

    const result = await createReferralLink({
      creatorUserId: userId,
      toolSlug,
      sourceDefault,
      origin: process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin,
      region: region as any,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to create referral link" },
      { status: 500 }
    );
  }
}
