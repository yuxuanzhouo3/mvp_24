/**
 * Chat Sessions API
 * GET /api/chat/sessions - 获取用户所有会话
 * POST /api/chat/sessions - 创建新会话
 */

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ApiValidator, commonSchemas } from "@/lib/api-validation";

/**
 * GET /api/chat/sessions
 * 获取当前用户的所有会话列表
 */
export async function GET(req: NextRequest) {
  try {
    // 鉴权
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return Response.json({ error: "Invalid token" }, { status: 401 });
    }

    // 获取查询参数
    const { searchParams } = new URL(req.url);
    const queryValidation = ApiValidator.validateQuery(
      searchParams,
      commonSchemas.pagination
    );

    if (!queryValidation.success) {
      return Response.json({ error: queryValidation.error }, { status: 400 });
    }

    const { limit, offset } = queryValidation.data;

    // 确保数值类型安全 (虽然schema已经验证，但TypeScript需要保证)
    const safeLimit = Math.min(Math.max(limit ?? 50, 1), 100);
    const safeOffset = Math.max(offset ?? 0, 0);

    // 查询会话
    const {
      data: sessions,
      error,
      count,
    } = await supabaseAdmin
      .from("gpt_sessions")
      .select("*, gpt_messages(count)", { count: "exact" })
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .range(safeOffset, safeOffset + safeLimit - 1);

    if (error) {
      console.error("Failed to fetch sessions:", error);
      return Response.json(
        { error: "Failed to fetch sessions" },
        { status: 500 }
      );
    }

    // 返回会话列表
    return Response.json({
      sessions: sessions || [],
      total: count || 0,
      limit: safeLimit,
      offset: safeOffset,
    });
  } catch (error) {
    console.error("Sessions API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/chat/sessions
 * 创建新会话
 */
export async function POST(req: NextRequest) {
  try {
    // 鉴权
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return Response.json({ error: "Invalid token" }, { status: 401 });
    }

    // 验证请求体
    const bodyValidation = await ApiValidator.validateBody(
      req,
      commonSchemas.createSession
    );

    if (!bodyValidation.success) {
      return Response.json({ error: bodyValidation.error }, { status: 400 });
    }

    const { title, model } = bodyValidation.data;

    // 创建会话
    const { data: session, error } = await supabaseAdmin
      .from("gpt_sessions")
      .insert({
        user_id: user.id,
        title: title.trim(),
        model,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create session:", error);
      return Response.json(
        { error: "Failed to create session" },
        { status: 500 }
      );
    }

    return Response.json({ session }, { status: 201 });
  } catch (error) {
    console.error("Create session API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
