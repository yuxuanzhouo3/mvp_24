import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isChinaRegion } from "@/lib/config/region";
import { verifyAuthToken, extractTokenFromHeader } from "@/lib/auth-utils";
import { countAssistantMessagesInMonth } from "@/lib/usage/count-assistant-messages";

export const runtime = "nodejs";

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
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let used = 0;
    let limit = 50; // 默认免费额度
    let plan = "free";

    if (isChinaRegion()) {
      const cloudbase = require("@cloudbase/node-sdk")
        .init({
          env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
          secretId: process.env.CLOUDBASE_SECRET_ID,
          secretKey: process.env.CLOUDBASE_SECRET_KEY,
        })
        .database();

      // 1. 获取订阅计划
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
          plan = "pro";
          limit = 999999; // Pro 用户无限制或极高限制
        }
      }

      // 2. 统计本月使用量
      const conversationsResult = await cloudbase
        .collection("ai_conversations")
        .where({
          user_id: userId,
        })
        .get();

      if (conversationsResult.data && Array.isArray(conversationsResult.data)) {
        used = countAssistantMessagesInMonth(conversationsResult.data, startOfMonth);
      }
    } else {
      // 国际版
      // 1. 获取订阅计划
      const { data: profile } = await supabaseAdmin
        .from("user_profiles")
        .select("subscription_plan")
        .eq("id", userId)
        .single();

      plan = profile?.subscription_plan || "free";
      if (plan === "pro") {
        limit = 999999;
      }

      // 2. 统计本月使用量
      const { data: sessions } = await supabaseAdmin
        .from("gpt_sessions")
        .select("messages")
        .eq("user_id", userId);

      if (sessions && Array.isArray(sessions)) {
        used = countAssistantMessagesInMonth(sessions, startOfMonth);
      }
    }

    return NextResponse.json({
      used,
      limit,
      plan,
      remaining: Math.max(0, limit - used),
    });
  } catch (error) {
    console.error("Error fetching user usage:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
