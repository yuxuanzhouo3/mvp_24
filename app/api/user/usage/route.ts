import { NextRequest, NextResponse } from "next/server";
import { isChinaRegion } from "@/lib/config/region";
import { verifyAuthToken, extractTokenFromHeader } from "@/lib/auth-utils";
import { resolveIntlUserPlan } from "@/lib/user-plan";
import { coercePlanId } from "@/lib/plan-quota-settings";
import { getUserCreditOverview } from "@/lib/billing/engine";
import {
  getPlanMediaLimits,
  getWalletStats,
  seedWalletForPlan,
} from "@/services/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const { token, error: tokenError } = extractTokenFromHeader(authHeader);

    if (tokenError || !token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authResult = await verifyAuthToken(token);
    if (!authResult.success || !authResult.userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const userId = authResult.userId;
    let plan = "free";

    if (isChinaRegion()) {
      const cloudbase = require("@cloudbase/node-sdk")
        .init({
          env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
          secretId: process.env.CLOUDBASE_SECRET_ID,
          secretKey: process.env.CLOUDBASE_SECRET_KEY,
        })
        .database();

      const subscriptionResult = await cloudbase
        .collection("subscriptions")
        .where({
          user_id: userId,
          status: "active",
        })
        .orderBy("current_period_end", "desc")
        .limit(1)
        .get();

      if (subscriptionResult.data && subscriptionResult.data.length > 0) {
        const subscription = subscriptionResult.data[0];
        if (new Date(subscription.current_period_end) > new Date()) {
          plan = coercePlanId(subscription.plan || subscription.plan_id || "pro");
        }
      }
    } else {
      plan = await resolveIntlUserPlan(
        userId,
        (authResult.user as any)?.user_metadata || {}
      );
    }

    const planId = coercePlanId(plan);
    const creditOverview = await getUserCreditOverview(userId, planId);

    let multimodal: {
      image: { used: number; limit: number; remaining: number };
      videoAudio: { used: number; limit: number; remaining: number };
    } | null = null;

    try {
      await seedWalletForPlan(userId, (plan || "free").toLowerCase());
      const walletStats = await getWalletStats(userId);
      if (walletStats) {
        const mediaLimits = await getPlanMediaLimits((plan || "free").toLowerCase());
        multimodal = {
          image: {
            used: Math.max(0, mediaLimits.imageLimit - walletStats.monthly.image),
            limit: mediaLimits.imageLimit + walletStats.addon.image,
            remaining: walletStats.total.image,
          },
          videoAudio: {
            used: Math.max(0, mediaLimits.videoLimit - walletStats.monthly.video),
            limit: mediaLimits.videoLimit + walletStats.addon.video,
            remaining: walletStats.total.video,
          },
        };
      }
    } catch (error) {
      console.error("Error fetching multimodal usage stats:", error);
    }

    return NextResponse.json(
      {
        used: creditOverview.spentThisMonth,
        limit: creditOverview.monthlyGrant,
        plan,
        remaining: creditOverview.availableCredits,
        credits: {
          balance: creditOverview.availableCredits,
          monthlyGrant: creditOverview.monthlyGrant,
          dailyCap: creditOverview.dailyCreditCap,
          spentThisMonth: creditOverview.spentThisMonth,
          spentToday: creditOverview.spentToday,
          remainingThisMonth: creditOverview.remainingThisMonth,
          monthlyGrantBalance: creditOverview.wallet.monthlyGrantBalance,
          rechargeBalance: creditOverview.wallet.rechargeBalance,
          bonusBalance: creditOverview.wallet.bonusBalance,
        },
        multimodal,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching user usage:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
