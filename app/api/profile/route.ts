/**
 * 用户资料 API 路由
 * GET: 获取当前用户的资料
 * POST: 保存/更新当前用户的资料
 */

import { NextRequest, NextResponse } from "next/server";
import { isChinaRegion } from "@/lib/config/region";
import { getDatabase } from "@/lib/cloudbase-service";
import { verifyAuthToken, extractTokenFromHeader } from "@/lib/auth-utils";
import { createClient } from "@supabase/supabase-js";
import { getPlanInfo } from "@/utils/plan-utils";
import { resolveIntlUserPlan } from "@/lib/user-plan";

// 延迟初始化 Supabase 管理员客户端
let supabaseAdminInstance: ReturnType<typeof createClient> | null = null;

function getSupabaseAdmin() {
  if (supabaseAdminInstance) {
    return supabaseAdminInstance;
  }

  supabaseAdminInstance = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  );

  return supabaseAdminInstance;
}

function parseDateLike(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function pickLatestDate(
  ...dates: Array<Date | null | undefined>
): Date | null {
  const validDates = dates.filter(
    (date): date is Date => !!date && Number.isFinite(date.getTime())
  );
  if (validDates.length === 0) {
    return null;
  }

  return validDates.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest
  );
}

function isInvalidApiKeyError(error: unknown): boolean {
  const text =
    typeof error === "object" && error !== null
      ? `${(error as any).message || ""} ${(error as any).details || ""}`
      : String(error || "");
  return text.toLowerCase().includes("invalid api key");
}

function pickFirstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function getIntlDisplayName(user: any): string {
  const metadata = (user?.user_metadata || {}) as Record<string, unknown>;
  return pickFirstString(
    metadata.displayName,
    metadata.full_name,
    metadata.name
  );
}

function getIntlAvatar(user: any): string {
  const metadata = (user?.user_metadata || {}) as Record<string, unknown>;
  return pickFirstString(
    metadata.avatar,
    metadata.avatar_url,
    metadata.picture,
    metadata.photo_url
  );
}

export async function GET(request: NextRequest) {
  try {
    // 鉴权 - 与其他 API 保持一致
    const authHeader = request.headers.get("authorization");
    const { token, error: tokenError } = extractTokenFromHeader(authHeader);

    if (tokenError || !token) {
      return NextResponse.json(
        { error: tokenError || "Unauthorized" },
        { status: 401 }
      );
    }

    const authResult = await verifyAuthToken(token);
    if (!authResult.success || !authResult.userId) {
      return NextResponse.json(
        { error: authResult.error || "Invalid token" },
        { status: 401 }
      );
    }

    const userId = authResult.userId;

    if (isChinaRegion()) {
      // 方案 1: 单表设计 - 直接从 web_users 获取用户详细信息
      console.log("🔍 [/api/profile] 正在查询用户资料:", userId);
      const db = getDatabase();

      const userResult = await db.collection("web_users").doc(userId).get();
      if (!userResult || !userResult.data || userResult.data.length === 0) {
        console.error("❌ [/api/profile] 用户未找到");
        return NextResponse.json(
          {
            error: "User not found",
            code: "USER_NOT_FOUND",
          },
          { status: 404 }
        );
      }

      const user = userResult.data[0] as any;

      // ✅ 修复：从 subscriptions 表读取 current_period_end（会员有效期）
      let membershipExpiresAt = user.membership_expires_at; // 优先使用用户表中的字段
      try {
        const subscriptionResult = await db
          .collection("subscriptions")
          .where({
            user_id: userId,
            status: "active",
          })
          .get();

        if (subscriptionResult.data && subscriptionResult.data.length > 0) {
          const latestSubscription = [...subscriptionResult.data]
            .sort((a: any, b: any) => {
              const aTime = new Date(a.current_period_end || 0).getTime();
              const bTime = new Date(b.current_period_end || 0).getTime();
              return bTime - aTime;
            })[0] as any;
          membershipExpiresAt = latestSubscription?.current_period_end || membershipExpiresAt;
          console.log("✅ [/api/profile] 从 subscriptions 表读取会员过期时间:", membershipExpiresAt);
        }
      } catch (error) {
        console.warn("⚠️ [/api/profile] 从 subscriptions 表读取失败，使用用户表中的值:", error);
      }

      const walletResult = await db
        .collection("user_wallets")
        .where({ user_id: userId })
        .limit(1)
        .get();
      const wallet = walletResult?.data?.[0] || null;
      const planInfo = getPlanInfo(user, wallet);
      const walletPlanExpDate = parseDateLike(planInfo.planExp);
      const membershipExpiresDate = parseDateLike(membershipExpiresAt);
      const latestExpiryDate = pickLatestDate(
        walletPlanExpDate,
        membershipExpiresDate
      );
      const hasPaidFlag =
        planInfo.isBasic ||
        planInfo.isPro ||
        planInfo.isEnterprise ||
        !!(wallet?.pro ?? user.pro);
      const hasActiveSubscription =
        hasPaidFlag &&
        !!latestExpiryDate &&
        latestExpiryDate.getTime() > Date.now();
      const normalizedPlan = hasActiveSubscription
        ? (
            planInfo.planLower ||
            String(user.subscription_plan || "").toLowerCase() ||
            (user.pro ? "pro" : "free")
          ).toLowerCase()
        : "free";
      const normalizedMembershipExpiresAt = latestExpiryDate
        ? latestExpiryDate.toISOString()
        : null;

      const response = {
        id: user._id || user.id,
        email: user.email,
        name: user.name || "",
        avatar: user.avatar || "",
        phone: user.phone || "",
        pro: user.pro || false,
        subscription_plan: normalizedPlan,
        subscription_status: hasActiveSubscription ? "active" : "inactive",
        subscription_expires_at: user.subscription_expires_at,
        membership_expires_at: normalizedMembershipExpiresAt,
        subscription_tier:
          wallet?.subscription_tier || planInfo.planLabel || normalizedPlan,
        plan_exp: walletPlanExpDate ? walletPlanExpDate.toISOString() : null,
        isPaid: hasActiveSubscription,
        hasActiveSubscription,
        hide_ads: user.hide_ads ?? false,
        preferences: user.preferences || {
          language: "zh",
          theme: "light",
          notifications: true,
        },
        last_login_at: user.last_login_at,
        login_count: user.login_count || 0,
      };

      console.log("✅ [/api/profile] 返回用户信息:", response.id);
      return NextResponse.json(response);
    } else {
      // 方案 2: INTL 模式 - 从 Supabase auth.users 获取用户信息
      console.log("🔍 [/api/profile] INTL 模式，正在查询用户资料:", userId);

      // 从 Supabase 获取用户信息
      const {
        data: { user: adminUser },
        error,
      } = await getSupabaseAdmin().auth.admin.getUserById(userId);

      let user = adminUser;
      if ((!user || error) && authResult.user?.id === userId) {
        if (error && isInvalidApiKeyError(error)) {
          console.warn(
            "⚠️ [/api/profile] Supabase admin key invalid, fallback to token user payload."
          );
        }
        user = authResult.user as any;
      }

      if (!user) {
        if (error && isInvalidApiKeyError(error)) {
          console.error("❌ [/api/profile] Supabase API key invalid:", error);
          return NextResponse.json(
            {
              error: "Supabase API key invalid",
              code: "SUPABASE_API_KEY_INVALID",
            },
            { status: 500 }
          );
        }

        console.error("❌ [/api/profile] Supabase 用户未找到:", error);
        return NextResponse.json(
          {
            error: "User not found",
            code: "USER_NOT_FOUND",
          },
          { status: 404 }
        );
      }

      // ✅ 修复：从 subscriptions 表读取 current_period_end（会员有效期）
      let membershipExpiresAt = user.user_metadata?.membership_expires_at;
      try {
        const supabaseAdmin = getSupabaseAdmin();
        const { data: subscriptions, error: subError } = await supabaseAdmin
          .from("subscriptions")
          .select("current_period_end")
          .eq("user_id", userId)
          .eq("status", "active")
          .not("current_period_end", "is", null)
          .order("current_period_end", { ascending: false })
          .limit(1)
          .maybeSingle();
        const subscriptionRow = subscriptions as any;

        if (!subError && subscriptionRow?.current_period_end) {
          membershipExpiresAt = subscriptionRow.current_period_end;
          console.log("✅ [/api/profile] 从 subscriptions 表读取会员过期时间:", membershipExpiresAt);
        }
      } catch (error) {
        console.warn("⚠️ [/api/profile] 从 subscriptions 表读取失败，使用 user_metadata 中的值:", error);
      }

      const { data: wallet } = await getSupabaseAdmin()
        .from("user_wallets")
        .select("plan, subscription_tier, plan_exp, pro")
        .eq("user_id", userId)
        .maybeSingle();
      const walletRow = wallet as any;

      const planInfo = getPlanInfo(user.user_metadata || {}, walletRow || null);
      const resolvedPlan = await resolveIntlUserPlan(
        userId,
        user.user_metadata || {}
      );
      const walletPlanExpDate = parseDateLike(planInfo.planExp);
      const membershipExpiresDate = parseDateLike(membershipExpiresAt);
      const latestExpiryDate = pickLatestDate(
        walletPlanExpDate,
        membershipExpiresDate
      );
      const planCandidate =
        String(resolvedPlan || "").toLowerCase() !== "free"
          ? String(resolvedPlan).toLowerCase()
          : String(planInfo.planLower || (walletRow?.pro ? "pro" : "free")).toLowerCase();
      const hasActiveSubscription =
        planCandidate !== "free" &&
        !!latestExpiryDate &&
        latestExpiryDate.getTime() > Date.now();
      const normalizedPlan = hasActiveSubscription ? planCandidate : "free";
      const planExpIso = walletPlanExpDate
        ? walletPlanExpDate.toISOString()
        : latestExpiryDate
        ? latestExpiryDate.toISOString()
        : null;

      // 构建响应数据
      const response = {
        id: user.id,
        email: user.email || "",
        name: getIntlDisplayName(user),
        avatar: getIntlAvatar(user),
        phone: user.user_metadata?.phone || "",
        pro: user.user_metadata?.pro || walletRow?.pro || false,
        subscription_plan: normalizedPlan,
        subscription_status: hasActiveSubscription ? "active" : "inactive",
        subscription_expires_at: user.user_metadata?.subscription_expires_at,
        membership_expires_at: latestExpiryDate
          ? latestExpiryDate.toISOString()
          : null,
        subscription_tier:
          walletRow?.subscription_tier ||
          planInfo.planLabel ||
          normalizedPlan,
        plan_exp: planExpIso,
        isPaid: hasActiveSubscription,
        hasActiveSubscription,
        hide_ads: user.user_metadata?.hide_ads ?? false,
        preferences: user.user_metadata?.preferences || {
          language: "en",
          theme: "light",
          notifications: true,
        },
        last_login_at: user.last_sign_in_at,
        login_count: user.user_metadata?.login_count || 0,
      };

      console.log("✅ [/api/profile] INTL 返回用户信息:", response.id);
      return NextResponse.json(response);
    }
  } catch (error) {
    console.error(" [/api/profile GET] 异常:", error);
    return NextResponse.json({ error: "获取用户资料失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // 鉴权 - 与其他 API 保持一致
    const authHeader = request.headers.get("authorization");
    const { token, error: tokenError } = extractTokenFromHeader(authHeader);

    if (tokenError || !token) {
      return NextResponse.json(
        { error: tokenError || "Unauthorized" },
        { status: 401 }
      );
    }

    const authResult = await verifyAuthToken(token);
    if (!authResult.success || !authResult.userId) {
      return NextResponse.json(
        { error: authResult.error || "Invalid token" },
        { status: 401 }
      );
    }

    const userId = authResult.userId;

    if (isChinaRegion()) {
      // 方案 1: 单表设计 - 直接更新 web_users 表
      const body = await request.json();
      const { name, avatar, phone, preferences } = body;

      console.log("💾 [/api/profile] 更新用户资料:", {
        userId,
        name,
        avatar,
      });

      const db = getDatabase();

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (name !== undefined) updateData.name = name;
      if (avatar !== undefined) updateData.avatar = avatar;
      if (phone !== undefined) updateData.phone = phone;
      if (preferences !== undefined) updateData.preferences = preferences;

      // 直接更新 web_users 中的用户记录
      await db.collection("web_users").doc(userId).update(updateData);
      console.log("✅ [/api/profile] 更新用户资料成功:", userId);

      // 返回更新后的用户资料
      const updatedUserResult = await db
        .collection("web_users")
        .doc(userId)
        .get();

      if (updatedUserResult.data && updatedUserResult.data.length > 0) {
        const user = updatedUserResult.data[0];
        return NextResponse.json({
          id: user._id,
          email: user.email,
          name: user.name || "",
          avatar: user.avatar || "",
          phone: user.phone || "",
          pro: user.pro || false,
          subscription_plan:
            user.subscription_plan || (user.pro ? "pro" : "free"),
          subscription_status:
            user.subscription_status || (user.pro ? "active" : "inactive"),
          membership_expires_at: user.membership_expires_at,
          preferences: user.preferences || {
            language: "zh",
            theme: "light",
            notifications: true,
          },
        });
      }

      return NextResponse.json({ error: "更新失败" }, { status: 500 });
    } else {
      // 方案 2: INTL 模式 - 更新 Supabase user metadata
      const body = await request.json();
      const { name, avatar, phone, preferences } = body;

      console.log("💾 [/api/profile] INTL 更新用户资料:", {
        userId,
        name,
        avatar,
      });

      // 构建更新数据
      const updateData: any = {};
      if (name !== undefined) updateData.displayName = name;
      if (avatar !== undefined) {
        updateData.avatar = avatar;
        updateData.avatar_url = avatar;
      }
      if (phone !== undefined) updateData.phone = phone;
      if (preferences !== undefined) updateData.preferences = preferences;
      updateData.updated_at = new Date().toISOString();

      // 更新 Supabase user metadata
      const { data, error } = await getSupabaseAdmin().auth.admin.updateUserById(
        userId,
        {
          user_metadata: updateData,
        }
      );

      if (error) {
        console.error("❌ [/api/profile] Supabase 更新失败:", error);
        return NextResponse.json({ error: "更新失败" }, { status: 500 });
      }

      console.log("✅ [/api/profile] INTL 更新用户资料成功:", userId);

      // 返回更新后的用户资料
      if (data?.user) {
        const user = data.user;
        return NextResponse.json({
          id: user.id,
          email: user.email || "",
          name: getIntlDisplayName(user),
          avatar: getIntlAvatar(user),
          phone: user.user_metadata?.phone || "",
          pro: user.user_metadata?.pro || false,
          subscription_plan: user.user_metadata?.subscription_plan || "free",
          subscription_status:
            user.user_metadata?.subscription_status || "inactive",
          membership_expires_at: user.user_metadata?.membership_expires_at,
          preferences: user.user_metadata?.preferences || {
            language: "en",
            theme: "light",
            notifications: true,
          },
        });
      }

      return NextResponse.json({ error: "更新失败" }, { status: 500 });
    }
  } catch (error) {
    console.error(" [/api/profile POST] 异常:", error);
    return NextResponse.json({ error: "更新用户资料失败" }, { status: 500 });
  }
}
