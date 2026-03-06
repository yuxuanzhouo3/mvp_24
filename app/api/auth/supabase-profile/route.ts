import { NextRequest, NextResponse } from "next/server";
import { createAuthErrorResponse, requireAuth } from "@/lib/auth";
import { isChinaRegion } from "@/lib/config/region";
import { ensureUserWallet } from "@/services/wallet-supabase";
import { bindReferralFromRequest } from "@/lib/market/referrals";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (isChinaRegion()) {
      return NextResponse.json(
        { success: false, error: "Not supported in CN region" },
        { status: 400 }
      );
    }

    const authResult = await requireAuth(request);
    if (!authResult?.user?.id) {
      return createAuthErrorResponse();
    }

    const user = authResult.user;
    const userId = String(user.id || "").trim();
    if (!userId) {
      return createAuthErrorResponse();
    }

    await ensureUserWallet(userId);

    const bindResult = await bindReferralFromRequest({
      request,
      invitedUserId: userId,
      invitedEmail: String(user.email || "").trim() || null,
      region: "INTL",
    }).catch(() => ({ bound: false, reason: "bind_failed" as const }));

    return NextResponse.json({
      success: true,
      userId,
      referral: bindResult,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to sync supabase profile" },
      { status: 500 }
    );
  }
}
