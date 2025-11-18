/**
 * 用户资料 API 路由
 * GET: 获取当前用户的资料
 * POST: 保存/更新当前用户的资料
 */

import { NextRequest, NextResponse } from "next/server";
import { isChinaRegion } from "@/lib/config/region";
import { logSecurityEvent } from "@/lib/logger";
import cloudbase from "@cloudbase/js-sdk";
import adapter from "@cloudbase/adapter-node";
import { getDatabase } from "@/lib/cloudbase-service";
import { verifyAuthToken, extractTokenFromHeader } from "@/lib/auth-utils";
import { createClient } from "@supabase/supabase-js";

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
          const subscription = subscriptionResult.data[0] as any;
          membershipExpiresAt = subscription.current_period_end;
          console.log("✅ [/api/profile] 从 subscriptions 表读取会员过期时间:", membershipExpiresAt);
        }
      } catch (error) {
        console.warn("⚠️ [/api/profile] 从 subscriptions 表读取失败，使用用户表中的值:", error);
      }

      const response = {
        id: user._id || user.id,
        email: user.email,
        name: user.name || "",
        avatar: user.avatar || "",
        phone: user.phone || "",
        pro: user.pro || false,
        subscription_plan:
          user.subscription_plan || (user.pro ? "pro" : "free"),
        subscription_status:
          user.subscription_status || (user.pro ? "active" : "inactive"),
        subscription_expires_at: user.subscription_expires_at,
        membership_expires_at: membershipExpiresAt, // ✅ 使用从 subscriptions 读取的值
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
        data: { user },
        error,
      } = await getSupabaseAdmin().auth.admin.getUserById(userId);

      if (error || !user) {
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
          .single();

        if (!subError && subscriptions?.current_period_end) {
          membershipExpiresAt = subscriptions.current_period_end;
          console.log("✅ [/api/profile] 从 subscriptions 表读取会员过期时间:", membershipExpiresAt);
        }
      } catch (error) {
        console.warn("⚠️ [/api/profile] 从 subscriptions 表读取失败，使用 user_metadata 中的值:", error);
      }

      // 构建响应数据
      const response = {
        id: user.id,
        email: user.email || "",
        name:
          user.user_metadata?.displayName ||
          user.user_metadata?.full_name ||
          "",
        avatar: user.user_metadata?.avatar || "",
        phone: user.user_metadata?.phone || "",
        pro: user.user_metadata?.pro || false,
        subscription_plan:
          user.user_metadata?.subscription_plan ||
          (user.user_metadata?.pro ? "pro" : "free"),
        subscription_status:
          user.user_metadata?.subscription_status ||
          (user.user_metadata?.pro ? "active" : "inactive"),
        subscription_expires_at: user.user_metadata?.subscription_expires_at,
        membership_expires_at: membershipExpiresAt, // ✅ 使用从 subscriptions 读取的值
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
      if (avatar !== undefined) updateData.avatar = avatar;
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
          name: user.user_metadata?.displayName || "",
          avatar: user.user_metadata?.avatar || "",
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
