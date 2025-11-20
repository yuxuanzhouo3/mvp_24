/**
 * Save Multi-AI Message API
 * POST /api/chat/save-multi-ai
 * 保存多AI协作的完整响应到数据库
 */

import { NextRequest } from "next/server";
import { verifyAuthToken, extractTokenFromHeader } from "@/lib/auth-utils";
import { isChinaRegion } from "@/lib/config/region";
import { saveMultiAIMessage } from "@/lib/cloudbase-db";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

interface AIResponse {
  agentId: string;
  agentName: string;
  content: string;
  model: string;
  status: string;
  timestamp: Date;
}

/**
 * POST /api/chat/save-multi-ai
 * 保存多AI协作消息
 */
export async function POST(req: NextRequest) {
  try {
    // 鉴权验证
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

    // 解析请求体
    const body = await req.json();
    const { sessionId, userMessage, aiResponses } = body as {
      sessionId: string;
      userMessage: string;
      aiResponses: AIResponse[];
    };

    if (!sessionId || !userMessage || !aiResponses || aiResponses.length === 0) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // 根据地区保存到不同数据库
    if (isChinaRegion()) {
      // 国内版：保存到CloudBase
      const result = await saveMultiAIMessage({
        session_id: sessionId,
        user_id: userId,
        user_message: userMessage,
        ai_responses: aiResponses,
      });

      if (result.error) {
        console.error("[save-multi-ai] Failed to save to CloudBase:", result.error);
        return Response.json(
          { error: "Failed to save multi-AI message" },
          { status: 500 }
        );
      }

      return Response.json({
        success: true,
        data: result.data,
      });
    } else {
      // 国际版：保存到 Supabase - 统一使用 gpt_sessions.messages 结构
      try {
        // 1. 获取当前会话的消息数组
        const { data: session, error: fetchError } = await supabaseAdmin
          .from("gpt_sessions")
          .select("messages")
          .eq("id", sessionId)
          .eq("user_id", userId)
          .single();

        if (fetchError) {
          console.error("[save-multi-ai] Failed to fetch session:", fetchError);
          return Response.json(
            { error: "Failed to fetch session" },
            { status: 500 }
          );
        }

        if (!session) {
          return Response.json(
            { error: "Session not found" },
            { status: 404 }
          );
        }

        const currentMessages = session.messages || [];
        const timestamp = new Date().toISOString();
        const updatedMessages = [...currentMessages];

        // 2. 检查用户消息是否已经保存（如果没有保存则添加）
        const userMessageExists = updatedMessages.some(
          (msg) => msg.role === "user" && msg.content === userMessage
        );

        if (!userMessageExists) {
          updatedMessages.push({
            content: userMessage,
            role: "user",
            timestamp,
            tokens_used: 0,
          });
        }

        // 3. 添加所有 AI 响应（使用多 AI 格式）
        updatedMessages.push({
          content: aiResponses.map((response) => ({
            agentName: response.agentName,
            agentId: response.agentId,
            model: response.model,
            content: response.content,
            status: response.status,
            timestamp: response.timestamp,
          })),
          role: "assistant",
          timestamp,
          tokens_used: 0,
          isMultiAI: true,
        });

        // 4. 更新会话的消息数组
        const { error: updateError } = await supabaseAdmin
          .from("gpt_sessions")
          .update({ messages: updatedMessages })
          .eq("id", sessionId)
          .eq("user_id", userId);

        if (updateError) {
          console.error("[save-multi-ai] Failed to update session:", updateError);
          return Response.json(
            { error: "Failed to save messages" },
            { status: 500 }
          );
        }

        return Response.json({
          success: true,
          data: { savedCount: aiResponses.length },
        });
      } catch (error) {
        console.error("[save-multi-ai] Supabase error:", error);
        return Response.json(
          { error: "Failed to save to Supabase" },
          { status: 500 }
        );
      }
    }
  } catch (error) {
    console.error("[save-multi-ai] API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
