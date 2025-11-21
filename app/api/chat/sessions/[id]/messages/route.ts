/**
 * Chat Messages API
 * GET /api/chat/sessions/[id]/messages - 获取会话的消息历史
 */

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAuthToken, extractTokenFromHeader } from "@/lib/auth-utils";
import { isChinaRegion } from "@/lib/config/region";
import {
  getGptMessages as getCloudBaseMessages,
  deleteGptMessages as deleteCloudBaseMessages,
} from "@/lib/cloudbase-db";

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

    // 验证会话所有权
    if (isChinaRegion()) {
      // 国内版：检查 CloudBase 中的会话
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
        return Response.json(
          { error: "Session not found or access denied" },
          { status: 404 }
        );
      }

      const session = result.data[0];
      if (session.user_id !== userId) {
        return Response.json(
          { error: "Session not found or access denied" },
          { status: 404 }
        );
      }
    } else {
      // 国际版：检查 Supabase 中的会话
      const { data: session, error: sessionError } = await supabaseAdmin
        .from("gpt_sessions")
        .select("id")
        .eq("id", sessionId)
        .eq("user_id", userId)
        .single();

      if (sessionError || !session) {
        return Response.json(
          { error: "Session not found or access denied" },
          { status: 404 }
        );
      }
    }

    // 获取查询参数
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    // 获取消息
    if (isChinaRegion()) {
      // 国内版：从 CloudBase 获取
      const result = await getCloudBaseMessages(sessionId, limit, offset);

      if (result.error) {
        console.error("Failed to fetch messages:", result.error);
        return Response.json(
          { error: "Failed to fetch messages" },
          { status: 500 }
        );
      }

      // 同时获取会话配置（用于前端显示锁定状态）
      const cloudbase = require("@cloudbase/node-sdk")
        .init({
          env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
          secretId: process.env.CLOUDBASE_SECRET_ID,
          secretKey: process.env.CLOUDBASE_SECRET_KEY,
        })
        .database();

      const sessionResult = await cloudbase
        .collection("ai_conversations")
        .doc(sessionId)
        .get();

      const sessionData = sessionResult.data?.[0];
      const multiAiConfig = sessionData?.multi_ai_config || null;

      return Response.json({
        messages: result.data || [],
        total: result.count || 0,
        limit,
        offset,
        sessionConfig: multiAiConfig,
      });
    } else {
      // 国际版：从 Supabase 的 gpt_sessions.messages 和 multi_ai_config 获取
      const { data: session, error: sessionError } = await supabaseAdmin
        .from("gpt_sessions")
        .select("messages, multi_ai_config")
        .eq("id", sessionId)
        .eq("user_id", userId)
        .single();

      if (sessionError || !session) {
        console.error("Failed to fetch session:", sessionError);
        return Response.json(
          { error: "Failed to fetch messages" },
          { status: 500 }
        );
      }

      const allMessages = session.messages || [];
      const totalMessages = allMessages.length;

      // 应用分页
      const paginatedMessages = allMessages.slice(offset, offset + limit);

      // 计算总Token使用量
      const totalTokens = allMessages.reduce((sum: number, msg: any) => sum + (msg.tokens_used || 0), 0);

      // 注意：与CloudBase一致，history API返回完整消息（不按agentId过滤）
      // 按agentId过滤只在/api/chat/send中进行，用于实现上下文隔离

      return Response.json({
        messages: paginatedMessages,
        total: totalMessages,
        limit,
        offset,
        sessionConfig: session.multi_ai_config || null,
        stats: {
          totalMessages,
          totalTokens,
        },
      });
    }
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

    // 验证会话所有权
    if (isChinaRegion()) {
      // 国内版：检查 CloudBase 中的会话
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
        return Response.json(
          { error: "Session not found or access denied" },
          { status: 404 }
        );
      }

      const session = result.data[0];
      if (session.user_id !== userId) {
        return Response.json(
          { error: "Session not found or access denied" },
          { status: 404 }
        );
      }

      // 删除所有消息
      const error = await deleteCloudBaseMessages(sessionId);
      if (error) {
        console.error("Failed to delete messages:", error);
        return Response.json(
          { error: "Failed to delete messages" },
          { status: 500 }
        );
      }
    } else {
      // 国际版：检查 Supabase 中的会话
      const { data: session, error: sessionError } = await supabaseAdmin
        .from("gpt_sessions")
        .select("id")
        .eq("id", sessionId)
        .eq("user_id", userId)
        .single();

      if (sessionError || !session) {
        return Response.json(
          { error: "Session not found or access denied" },
          { status: 404 }
        );
      }

      // 删除所有消息（清空 messages 数组）
      const { error } = await supabaseAdmin
        .from("gpt_sessions")
        .update({ messages: [] })
        .eq("id", sessionId)
        .eq("user_id", userId);

      if (error) {
        console.error("Failed to delete messages:", error);
        return Response.json(
          { error: "Failed to delete messages" },
          { status: 500 }
        );
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Delete messages API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
