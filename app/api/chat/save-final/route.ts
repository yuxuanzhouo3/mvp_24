/**
 * Save Final Answer API
 * POST /api/chat/save-final
 *
 * Used by sequential collaboration mode:
 * - During sequential run, each agent call uses /api/chat/send with skipSave=true
 * - After the run completes, we persist ONLY:
 *   1) user question
 *   2) final answer (last successful AI output)
 *
 * This keeps conversation history clean (question + final answer only),
 * while preserving existing parallel multi-AI storage via /api/chat/save-multi-ai.
 */

import { NextRequest } from "next/server";
import { verifyAuthToken, extractTokenFromHeader } from "@/lib/auth-utils";
import { isChinaRegion } from "@/lib/config/region";
import { appendSessionMessages } from "@/lib/chat-session-store";
import { createMessageId } from "@/lib/chat/message-id";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
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

    const body = await req.json();
    const {
      sessionId,
      userMessageId,
      assistantMessageId,
      userMessage,
      finalAnswer,
      finalAgentId,
      finalAgentName,
      finalModel,
    } = body as {
      sessionId: string;
      userMessageId?: string;
      assistantMessageId?: string;
      userMessage: string;
      finalAnswer: string;
      finalAgentId?: string;
      finalAgentName?: string;
      finalModel?: string;
    };

    if (!sessionId || !userMessage || !finalAnswer) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const timestamp = new Date().toISOString();

    if (isChinaRegion()) {
      const cloudbase = require("@cloudbase/node-sdk")
        .init({
          env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
          secretId: process.env.CLOUDBASE_SECRET_ID,
          secretKey: process.env.CLOUDBASE_SECRET_KEY,
        })
        .database();

      // Validate ownership
      const sessionResult = await cloudbase
        .collection("ai_conversations")
        .doc(sessionId)
        .get();

      if (!sessionResult.data || sessionResult.data.length === 0) {
        return Response.json({ error: "Session not found" }, { status: 404 });
      }

      const conv = sessionResult.data[0];
      if (conv.user_id !== userId) {
        return Response.json(
          { error: "Session not found or access denied" },
          { status: 404 }
        );
      }

      const dbCmd = cloudbase.command;
      const messagesToAppend = [
        {
          id: userMessageId && userMessageId.trim() ? userMessageId : createMessageId("msg"),
          role: "user",
          content: userMessage,
          timestamp,
          tokens_used: 0,
        },
        {
          id:
            assistantMessageId && assistantMessageId.trim()
              ? assistantMessageId
              : createMessageId("msg"),
          role: "assistant",
          content: finalAnswer,
          timestamp,
          // Optional metadata for debugging/attribution
          finalAgentId: finalAgentId || undefined,
          finalAgentName: finalAgentName || undefined,
          model: finalModel || undefined,
        },
      ];

      await cloudbase.collection("ai_conversations").doc(sessionId).update({
        messages: dbCmd.push(...messagesToAppend),
        updated_at: timestamp,
      });

      return Response.json({ success: true, data: { savedCount: 2 } });
    }

    // Supabase (international)
    try {
      await appendSessionMessages({
        sessionId,
        userId,
        messages: [
          {
            id: userMessageId && userMessageId.trim() ? userMessageId : createMessageId("msg"),
            content: userMessage,
            role: "user",
            timestamp,
            tokens_used: 0,
          },
          {
            id:
              assistantMessageId && assistantMessageId.trim()
                ? assistantMessageId
                : createMessageId("msg"),
            content: finalAnswer,
            role: "assistant",
            timestamp,
            tokens_used: 0,
            finalAgentId: finalAgentId || undefined,
            finalAgentName: finalAgentName || undefined,
            model: finalModel || undefined,
          },
        ],
      });
    } catch (saveError) {
      if (saveError instanceof Error && saveError.message.includes("Session not found")) {
        return Response.json({ error: "Session not found" }, { status: 404 });
      }
      return Response.json({ error: "Failed to save messages" }, { status: 500 });
    }

    return Response.json({ success: true, data: { savedCount: 2 } });
  } catch (error) {
    console.error("[save-final] API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
