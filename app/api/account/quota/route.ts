import {
  getFreeDailyLimit,
  getFreeContextMsgLimit,
  getBasicDailyLimit,
  getBasicContextMsgLimit,
  getProDailyLimit,
  getProContextMsgLimit,
  getEnterpriseDailyLimit,
  getEnterpriseContextMsgLimit,
  getCurrentYearMonth,
  getModelCategory,
} from "@/utils/model-limits";
import { coercePlanId, getPlanQuotaSettings } from "@/lib/plan-quota-settings";
import { getPlanInfo } from "@/utils/plan-utils";
import { checkDailyExternalQuota, getWalletStats, seedWalletForPlan } from "@/services/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getLimits(planLower: string) {
  const planId = coercePlanId(planLower);
  const planQuotas = await getPlanQuotaSettings(planId);

  switch (planId) {
    case "basic":
      return {
        dailyLimit: getBasicDailyLimit(),
        contextLimit: getBasicContextMsgLimit(),
        photoLimit: planQuotas.imageLimit,
        videoLimit: planQuotas.videoAudioLimit,
        label: "basic",
      };
    case "pro":
      return {
        dailyLimit: getProDailyLimit(),
        contextLimit: getProContextMsgLimit(),
        photoLimit: planQuotas.imageLimit,
        videoLimit: planQuotas.videoAudioLimit,
        label: "pro",
      };
    case "enterprise":
      return {
        dailyLimit: getEnterpriseDailyLimit(),
        contextLimit: getEnterpriseContextMsgLimit(),
        photoLimit: planQuotas.imageLimit,
        videoLimit: planQuotas.videoAudioLimit,
        label: "enterprise",
      };
    default:
      return {
        dailyLimit: getFreeDailyLimit(),
        contextLimit: getFreeContextMsgLimit(),
        photoLimit: planQuotas.imageLimit,
        videoLimit: planQuotas.videoAudioLimit,
        label: "free",
      };
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const { token, error: tokenError } = extractTokenFromHeader(authHeader);

    if (tokenError || !token) {
      return NextResponse.json({ error: tokenError || "Unauthorized" }, { status: 401 });
    }

    const authResult = await verifyAuthToken(token);
    if (!authResult.success || !authResult.userId) {
      return NextResponse.json({ error: authResult.error || "Unauthorized" }, { status: 401 });
    }

    const userId = authResult.userId;
    const modelId = req.nextUrl.searchParams.get("modelId") || "";
    const modelCategory = modelId ? getModelCategory(modelId) : null;

    if (isChinaRegion()) {
      const db = getDatabase();
      const userResult = await db.collection("web_users").doc(userId).get();
      const userDoc = userResult?.data?.[0] || userResult?.data || authResult.user || {};

      const planInfo = getPlanInfo(userDoc, null);
      const limits = await getLimits(planInfo.planLower);

      let walletStats = await getWalletStats(userId);
      if (!walletStats) {
        await seedWalletForPlan(userId, planInfo.planLower || "free");
        walletStats = await getWalletStats(userId);
      }

      const today = new Date().toISOString().slice(0, 10);
      const currentMonth = getCurrentYearMonth();
      const dailyCheck = await checkDailyExternalQuota(userId, planInfo.planLower || "free", 0);
      const dailyUsed = Math.max(0, dailyCheck.limit - dailyCheck.remaining);

      const walletSafe = walletStats || {
        monthly: { image: limits.photoLimit, video: limits.videoLimit },
        addon: { image: 0, video: 0 },
        total: { image: limits.photoLimit, video: limits.videoLimit },
        dailyExternal: { used: 0, day: today },
      };

      const monthlyMedia = {
        period: currentMonth,
        photoUsed: Math.max(0, limits.photoLimit - walletSafe.monthly.image),
        photoLimit: limits.photoLimit + walletSafe.addon.image,
        photoRemaining: walletSafe.total.image,
        videoAudioUsed: Math.max(0, limits.videoLimit - walletSafe.monthly.video),
        videoAudioLimit: limits.videoLimit + walletSafe.addon.video,
        videoAudioRemaining: walletSafe.total.video,
      };

      const daily = {
        period: today,
        used: dailyUsed,
        limit: dailyCheck.limit,
        remaining: dailyCheck.remaining,
      };

      const planExpIso = planInfo.planExp ? planInfo.planExp.toISOString() : null;

      if (modelCategory === "general") {
        return NextResponse.json({
          plan: limits.label,
          planExp: planExpIso,
          quotaType: "unlimited",
          modelCategory: "general",
          contextMsgLimit: limits.contextLimit,
          daily,
          wallet: walletSafe,
        });
      }

      if (modelCategory === "external") {
        return NextResponse.json({
          plan: limits.label,
          planExp: planExpIso,
          period: today,
          used: daily.used,
          limit: daily.limit,
          remaining: daily.remaining,
          quotaType: "daily",
          modelCategory: "external",
          contextMsgLimit: limits.contextLimit,
          daily,
          wallet: walletSafe,
        });
      }

      if (modelCategory === "advanced_multimodal") {
        return NextResponse.json({
          plan: limits.label,
          planExp: planExpIso,
          period: currentMonth,
          quotaType: "monthly_media",
          modelCategory: "advanced_multimodal",
          contextMsgLimit: limits.contextLimit,
          daily,
          textConsumesDaily: true,
          photoUsed: monthlyMedia.photoUsed,
          photoLimit: monthlyMedia.photoLimit,
          photoRemaining: monthlyMedia.photoRemaining,
          videoAudioUsed: monthlyMedia.videoAudioUsed,
          videoAudioLimit: monthlyMedia.videoAudioLimit,
          videoAudioRemaining: monthlyMedia.videoAudioRemaining,
          monthlyMedia,
          wallet: walletSafe,
        });
      }

      return NextResponse.json({
        plan: limits.label,
        planExp: planExpIso,
        daily,
        monthlyMedia,
        contextMsgLimit: limits.contextLimit,
        modelCategory: modelCategory || null,
        wallet: walletSafe,
      });
    }

    const authUser = authResult.user as any;
    const authMeta = authUser?.user_metadata || {};

    const { data: walletRow } = await supabaseAdmin
      .from("user_wallets")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const planInfo = getPlanInfo(authMeta, walletRow || null);
    const limits = await getLimits(planInfo.planLower);

    if (!walletRow) {
      await seedWalletForPlan(userId, planInfo.planLower || "free");
    }

    const walletStats = await getWalletStats(userId);
    const today = new Date().toISOString().slice(0, 10);
    const currentMonth = getCurrentYearMonth();
    const dailyCheck = await checkDailyExternalQuota(userId, planInfo.planLower || "free", 0);
    const dailyUsed = Math.max(0, dailyCheck.limit - dailyCheck.remaining);

    const walletSafe = walletStats || {
      monthly: { image: limits.photoLimit, video: limits.videoLimit },
      addon: { image: 0, video: 0 },
      total: { image: limits.photoLimit, video: limits.videoLimit },
      dailyExternal: { used: 0, day: today },
    };

    const monthlyMedia = {
      period: currentMonth,
      photoUsed: Math.max(0, limits.photoLimit - walletSafe.monthly.image),
      photoLimit: limits.photoLimit + walletSafe.addon.image,
      photoRemaining: walletSafe.total.image,
      videoAudioUsed: Math.max(0, limits.videoLimit - walletSafe.monthly.video),
      videoAudioLimit: limits.videoLimit + walletSafe.addon.video,
      videoAudioRemaining: walletSafe.total.video,
    };

    const daily = {
      period: today,
      used: dailyUsed,
      limit: dailyCheck.limit,
      remaining: dailyCheck.remaining,
    };

    const planExpIso = planInfo.planExp ? planInfo.planExp.toISOString() : null;

    if (modelCategory === "general") {
      return NextResponse.json({
        plan: limits.label,
        planExp: planExpIso,
        quotaType: "unlimited",
        modelCategory: "general",
        contextMsgLimit: limits.contextLimit,
        daily,
        wallet: walletSafe,
      });
    }

    if (modelCategory === "external") {
      return NextResponse.json({
        plan: limits.label,
        planExp: planExpIso,
        period: today,
        used: daily.used,
        limit: daily.limit,
        remaining: daily.remaining,
        quotaType: "daily",
        modelCategory: "external",
        contextMsgLimit: limits.contextLimit,
        daily,
        wallet: walletSafe,
      });
    }

    if (modelCategory === "advanced_multimodal") {
      return NextResponse.json({
        plan: limits.label,
        planExp: planExpIso,
        period: currentMonth,
        quotaType: "monthly_media",
        modelCategory: "advanced_multimodal",
        contextMsgLimit: limits.contextLimit,
        daily,
        textConsumesDaily: true,
        photoUsed: monthlyMedia.photoUsed,
        photoLimit: monthlyMedia.photoLimit,
        photoRemaining: monthlyMedia.photoRemaining,
        videoAudioUsed: monthlyMedia.videoAudioUsed,
        videoAudioLimit: monthlyMedia.videoAudioLimit,
        videoAudioRemaining: monthlyMedia.videoAudioRemaining,
        monthlyMedia,
        wallet: walletSafe,
      });
    }

    return NextResponse.json({
      plan: limits.label,
      planExp: planExpIso,
      daily,
      monthlyMedia,
      contextMsgLimit: limits.contextLimit,
      modelCategory: modelCategory || null,
      wallet: walletSafe,
    });
  } catch (error) {
    console.error("[account/quota] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
