/**
 * Chat Messages API
 * GET /api/chat/sessions/[id]/messages - 获取会话的消息历史
 */

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * GET /api/chat/sessions/[id]/messages
 * 获取指定会话的所有消息
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: sessionId } = await params;

    // 验证会话所有权
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("gpt_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (sessionError || !session) {
      return Response.json(
        { error: "Session not found or access denied" },
        { status: 404 }
      );
    }

    // 获取查询参数
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");
    const before = searchParams.get("before"); // 用于分页：获取某个时间之前的消息

    // 构建查询
    let query = supabaseAdmin
      .from("gpt_messages")
      .select("*", { count: "exact" })
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (before) {
      query = query.lt("created_at", before);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: messages, error, count } = await query;

    if (error) {
      console.error("Failed to fetch messages:", error);
      return Response.json(
        { error: "Failed to fetch messages" },
        { status: 500 }
      );
    }

    // 计算总Token使用量
    const totalTokens =
      messages?.reduce((sum, msg) => sum + (msg.tokens_used || 0), 0) || 0;

    return Response.json({
      messages: messages || [],
      total: count || 0,
      limit,
      offset,
      stats: {
        totalMessages: count || 0,
        totalTokens,
      },
    });
  } catch (error) {
    console.error("Get messages API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/chat/sessions/[id]/messages
 * 清空会话的所有消息（保留会话本身）
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: sessionId } = await params;

    // 验证会话所有权
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("gpt_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (sessionError || !session) {
      return Response.json(
        { error: "Session not found or access denied" },
        { status: 404 }
      );
    }

    // 删除所有消息
    const { error } = await supabaseAdmin
      .from("gpt_messages")
      .delete()
      .eq("session_id", sessionId);

    if (error) {
      console.error("Failed to delete messages:", error);
      return Response.json(
        { error: "Failed to delete messages" },
        { status: 500 }
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Delete messages API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
