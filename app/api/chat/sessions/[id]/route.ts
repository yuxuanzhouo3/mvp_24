/**
 * Chat Session by ID API
 * GET /api/chat/sessions/[id] - 获取会话详情
 * DELETE /api/chat/sessions/[id] - 删除会话
 * PATCH /api/chat/sessions/[id] - 更新会话
 */

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * GET /api/chat/sessions/[id]
 * 获取单个会话的详情
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

    // 获取会话
    const { data: session, error } = await supabaseAdmin
      .from("gpt_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (error || !session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    return Response.json({ session });
  } catch (error) {
    console.error("Get session API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/chat/sessions/[id]
 * 删除会话（级联删除所有消息）
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

    // 删除会话（数据库的ON DELETE CASCADE会自动删除关联的消息）
    const { error } = await supabaseAdmin
      .from("gpt_sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to delete session:", error);
      return Response.json(
        { error: "Failed to delete session" },
        { status: 500 }
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Delete session API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/chat/sessions/[id]
 * 更新会话（例如修改标题）
 */
export async function PATCH(
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

    // 解析请求体
    const body = await req.json();
    const { title } = body;

    // 验证参数
    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length === 0) {
        return Response.json(
          { error: "title must be a non-empty string" },
          { status: 400 }
        );
      }

      if (title.length > 200) {
        return Response.json(
          { error: "title must be less than 200 characters" },
          { status: 400 }
        );
      }
    }

    // 更新会话
    const { data: session, error } = await supabaseAdmin
      .from("gpt_sessions")
      .update({
        title: title?.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error || !session) {
      console.error("Failed to update session:", error);
      return Response.json(
        { error: "Failed to update session" },
        { status: 500 }
      );
    }

    return Response.json({ session });
  } catch (error) {
    console.error("Update session API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
