/**
 * Chat Session by ID API
 * GET /api/chat/sessions/[id] - 获取会话详情
 * DELETE /api/chat/sessions/[id] - 删除会话
 * PATCH /api/chat/sessions/[id] - 更新会话
 *
 * 国内版(CN): 使用 CloudBase
 * 国际版(INTL): 使用 Supabase
 */

import { NextRequest } from "next/server";
import { isChinaRegion } from "@/lib/config/region";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAuthToken, extractTokenFromHeader } from "@/lib/auth-utils";
import {
  deleteGptSession as deleteCloudBaseSession,
  updateGptSession as updateCloudBaseSession,
} from "@/lib/cloudbase-db";

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
    const { token, error: tokenError } = extractTokenFromHeader(authHeader);

    if (tokenError || !token) {
      return Response.json(
        { error: tokenError || "Unauthorized" },
        { status: 401 }
      );
    }

    const authResult = await verifyAuthToken(token);
    if (!authResult.success || !authResult.userId) {
      return Response.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.userId;
    const { id: sessionId } = await params;

    // 获取会话
    if (isChinaRegion()) {
      // 国内版：从 CloudBase 获取
      const cloudbase = require("@cloudbase/node-sdk")
        .init({
          env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
          secretId: process.env.CLOUDBASE_SECRET_ID,
          secretKey: process.env.CLOUDBASE_SECRET_KEY,
        })
        .database();

      const result = await cloudbase
        .collection("ai_conversations")
        .doc(sessionId)
        .get();

      if (!result.data || result.data.length === 0) {
        return Response.json({ error: "Session not found" }, { status: 404 });
      }

      const session = result.data[0];
      if (session.user_id !== userId) {
        return Response.json({ error: "Session not found" }, { status: 404 });
      }

      return Response.json({ session });
    } else {
      // 国际版：从 Supabase 获取
      const { data: session, error } = await supabaseAdmin
        .from("gpt_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("user_id", userId)
        .single();

      if (error || !session) {
        return Response.json({ error: "Session not found" }, { status: 404 });
      }

      return Response.json({ session });
    }
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
    const { token, error: tokenError } = extractTokenFromHeader(authHeader);

    if (tokenError || !token) {
      return Response.json(
        { error: tokenError || "Unauthorized" },
        { status: 401 }
      );
    }

    const authResult = await verifyAuthToken(token);
    if (!authResult.success || !authResult.userId) {
      return Response.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.userId;
    const { id: sessionId } = await params;

    // 删除会话（数据库的ON DELETE CASCADE会自动删除关联的消息）
    if (isChinaRegion()) {
      // 国内版：从 CloudBase 删除
      const error = await deleteCloudBaseSession(sessionId, userId);
      if (error) {
        console.error("Failed to delete session:", error);
        return Response.json(
          { error: "Failed to delete session" },
          { status: 500 }
        );
      }
    } else {
      // 国际版：从 Supabase 删除
      const { error } = await supabaseAdmin
        .from("gpt_sessions")
        .delete()
        .eq("id", sessionId)
        .eq("user_id", userId);

      if (error) {
        console.error("Failed to delete session:", error);
        return Response.json(
          { error: "Failed to delete session" },
          { status: 500 }
        );
      }
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
    const { token, error: tokenError } = extractTokenFromHeader(authHeader);

    if (tokenError || !token) {
      return Response.json(
        { error: tokenError || "Unauthorized" },
        { status: 401 }
      );
    }

    const authResult = await verifyAuthToken(token);
    if (!authResult.success || !authResult.userId) {
      return Response.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.userId;
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
    if (isChinaRegion()) {
      // 国内版：更新 CloudBase
      const error = await updateCloudBaseSession(sessionId, userId, {
        title: title?.trim(),
      });

      if (error) {
        console.error("Failed to update session:", error);
        return Response.json(
          { error: "Failed to update session" },
          { status: 500 }
        );
      }

      // 返回更新后的会话
      const cloudbase = require("@cloudbase/node-sdk")
        .init({
          env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
          secretId: process.env.CLOUDBASE_SECRET_ID,
          secretKey: process.env.CLOUDBASE_SECRET_KEY,
        })
        .database();

      const result = await cloudbase
        .collection("ai_conversations")
        .doc(sessionId)
        .get();

      if (!result.data || result.data.length === 0) {
        return Response.json({ error: "Session not found" }, { status: 404 });
      }

      return Response.json({ session: result.data[0] });
    } else {
      // 国际版：更新 Supabase
      const { data: session, error } = await supabaseAdmin
        .from("gpt_sessions")
        .update({
          title: title?.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId)
        .eq("user_id", userId)
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
    }
  } catch (error) {
    console.error("Update session API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
