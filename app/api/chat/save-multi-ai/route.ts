/**
 * Save Multi-AI Message API
 * POST /api/chat/save-multi-ai
 * 保存多AI协作的完整响应到数据库
 */

import { NextRequest } from "next/server";
import { verifyAuthToken, extractTokenFromHeader } from "@/lib/auth-utils";
import { isChinaRegion } from "@/lib/config/region";
import { saveMultiAIMessage } from "@/lib/cloudbase-db";
import {
  saveIntlMultiAISessionTurn,
  type MultiAIResponsePayload,
} from "@/lib/chat/save-multi-ai-intl";
import type { TaskGraphExecutionRun, TaskGraphSpec } from "@/types/task-graph";

export const runtime = "nodejs";

interface AIResponse {
  agentId: string;
  agentName: string;
  content: string;
  model: string;
  status: string;
  timestamp: Date;
  nodeId?: string;
  nodeTitle?: string;
  dependsOn?: string[];
  tokens?: number;
  cost?: number;
}

type MultiAICollaborationMode = "parallel" | "sequential" | "deep" | "graph";

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
    const {
      sessionId,
      userMessageId,
      assistantMessageId,
      userMessage,
      aiResponses,
      taskGraph,
      collaborationMode,
    } = body as {
      sessionId: string;
      userMessageId?: string;
      assistantMessageId?: string;
      userMessage: string;
      aiResponses: AIResponse[];
      taskGraph?: { spec: TaskGraphSpec; run?: TaskGraphExecutionRun };
      collaborationMode?: MultiAICollaborationMode;
    };

    if (
      collaborationMode !== undefined &&
      collaborationMode !== "parallel" &&
      collaborationMode !== "sequential" &&
      collaborationMode !== "deep" &&
      collaborationMode !== "graph"
    ) {
      return Response.json({ error: "Invalid collaborationMode" }, { status: 400 });
    }

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
        user_message_id: userMessageId,
        assistant_message_id: assistantMessageId,
        ai_responses: aiResponses,
        collaboration_mode: collaborationMode,
        task_graph: taskGraph,
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
        await saveIntlMultiAISessionTurn({
          sessionId,
          userId,
          userMessageId,
          assistantMessageId,
          userMessage,
          aiResponses: aiResponses as MultiAIResponsePayload[],
          collaborationMode,
          taskGraph,
        });

        return Response.json({
          success: true,
          data: { savedCount: aiResponses.length },
        });
      } catch (error) {
        console.error("[save-multi-ai] Supabase error:", error);
        if (error instanceof Error && error.message.includes("Session not found")) {
          return Response.json({ error: "Session not found" }, { status: 404 });
        }
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
