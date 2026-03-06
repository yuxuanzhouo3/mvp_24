import { NextRequest, NextResponse } from "next/server";
import { getUserInviteCenterData } from "@/lib/market/referrals";
import { isChinaRegion } from "@/lib/config/region";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const userId = String(request.nextUrl.searchParams.get("userId") || "").trim();
    const regionParam = String(request.nextUrl.searchParams.get("region") || "")
      .trim()
      .toUpperCase();
    const region = (
      regionParam === "CN" || regionParam === "INTL"
        ? regionParam
        : isChinaRegion()
          ? "CN"
          : "INTL"
    ) as "CN" | "INTL";
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 }
      );
    }

    const summary = await getUserInviteCenterData({
      userId,
      origin: process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin,
      region: region as any,
    });
    return NextResponse.json({ success: true, summary });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load invite summary" },
      { status: 500 }
    );
  }
}
