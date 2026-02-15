/**
 * Chat Sessions API
 * GET /api/chat/sessions - 获取用户所有会话
 * POST /api/chat/sessions - 创建新会话
 *
 * 国内版(CN): 使用 CloudBase
 * 国际版(INTL): 使用 Supabase
 */

import { NextRequest } from "next/server";
import { isChinaRegion } from "@/lib/config/region";
import { ApiValidator, commonSchemas } from "@/lib/api-validation";
import { verifyAuthToken, extractTokenFromHeader } from "@/lib/auth-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getGptSessions as getCloudBaseSessions,
  createGptSession as createCloudBaseSession,
} from "@/lib/cloudbase-db";

const GET_SESSION_SUMMARIES_RPC = "get_gpt_session_summaries";

function isRpcMissing(error: any): boolean {
  const text = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return (
    error?.code === "PGRST202" ||
    text.includes("could not find the function") ||
    text.includes("does not exist")
  );
}

function normalizePreview(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getLastMessagePreview(messages: any[]): string {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "";
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) {
    return "";
  }

  let raw = "";
  if (typeof lastMessage.content === "string") {
    raw = lastMessage.content;
  } else if (Array.isArray(lastMessage.content)) {
    const firstRespWithContent = lastMessage.content.find(
      (item: any) => typeof item?.content === "string" && item.content.trim()
    );
    raw = firstRespWithContent?.content || "";
  } else if (lastMessage.content && typeof lastMessage.content === "object") {
    raw = typeof lastMessage.content.content === "string" ? lastMessage.content.content : "";
  }

  const cleaned = normalizePreview(raw);
  return cleaned.length > 120 ? `${cleaned.slice(0, 120)}...` : cleaned;
}

/**
 * GET /api/chat/sessions
 * 获取当前用户的所有会话列表
 */
export async function GET(req: NextRequest) {
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
    const safeLimit = Math.min(Math.max(limit ?? 50, 1), 100);
    const safeOffset = Math.max(offset ?? 0, 0);

    // 根据区域选择数据库
    if (isChinaRegion()) {
      // 国内版：CloudBase
      const { data: sessions, error } = await getCloudBaseSessions(
        userId,
        safeLimit,
        safeOffset
      );

      if (error) {
        console.error("Failed to fetch sessions from CloudBase:", error);
        return Response.json(
          { error: "Failed to fetch sessions" },
          { status: 500 }
        );
      }

      // 标准化会话格式，确保有 id 字段
      const normalizedSessions = (sessions || []).map((session: any) => {
        const sessionMessages = Array.isArray(session.messages) ? session.messages : [];
        const { messages: _messages, ...rest } = session;
        return {
          id: session._id || session.id,
          ...rest,
          message_count: sessionMessages.length,
          last_message: getLastMessagePreview(sessionMessages),
        };
      });

      return Response.json({
        sessions: normalizedSessions,
        total: normalizedSessions.length,
        limit: safeLimit,
        offset: safeOffset,
      });
    } else {
      // 国际版：Supabase
      const { count, error: countError } = await supabaseAdmin
        .from("gpt_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      if (countError) {
        console.error("Failed to count sessions from Supabase:", countError);
        return Response.json(
          { error: "Failed to fetch sessions" },
          { status: 500 }
        );
      }

      const { data: summaries, error: summaryError } = await supabaseAdmin.rpc(
        GET_SESSION_SUMMARIES_RPC,
        {
          p_user_id: userId,
          p_limit: safeLimit,
          p_offset: safeOffset,
        }
      );

      if (summaryError && !isRpcMissing(summaryError)) {
        console.error("Failed to fetch session summaries from Supabase:", summaryError);
        return Response.json(
          { error: "Failed to fetch sessions" },
          { status: 500 }
        );
      }

      let sessionsWithCount: any[] = [];
      if (summaryError && isRpcMissing(summaryError)) {
        const { data: sessions, error } = await supabaseAdmin
          .from("gpt_sessions")
          .select("id, title, model, created_at, updated_at, multi_ai_config, messages")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .range(safeOffset, safeOffset + safeLimit - 1);

        if (error) {
          console.error("Failed to fetch sessions from Supabase:", error);
          return Response.json(
            { error: "Failed to fetch sessions" },
            { status: 500 }
          );
        }

        sessionsWithCount = (sessions || []).map((session: any) => {
          const sessionMessages = Array.isArray(session.messages) ? session.messages : [];
          return {
            id: session.id,
            title: session.title,
            model: session.model,
            created_at: session.created_at,
            updated_at: session.updated_at,
            multi_ai_config: session.multi_ai_config || null,
            message_count: sessionMessages.length,
            last_message: getLastMessagePreview(sessionMessages),
          };
        });
      } else {
        sessionsWithCount = (summaries || []).map((row: any) => ({
          id: row.id,
          title: row.title,
          model: row.model,
          created_at: row.created_at,
          updated_at: row.updated_at,
          multi_ai_config: row.multi_ai_config || null,
          message_count:
            typeof row.message_count === "number" ? row.message_count : Number(row.message_count || 0),
          last_message: typeof row.last_message === "string" ? row.last_message : "",
        }));
      }

      return Response.json({
        sessions: sessionsWithCount,
        total: count || 0,
        limit: safeLimit,
        offset: safeOffset,
      });
    }
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

    // 解析请求体（不使用validator，以支持新增的多AI字段）
    const body = await req.json();
    const {
      title,
      model,
      isMultiAI = false,
      selectedAgentIds = [],
      collaborationMode = "parallel",
    } = body;

    if (!title || !model) {
      return Response.json(
        { error: "title and model are required" },
        { status: 400 }
      );
    }

    // 验证多AI参数
    if (isMultiAI) {
      if (!Array.isArray(selectedAgentIds) || selectedAgentIds.length === 0) {
        return Response.json(
          { error: "selectedAgentIds must be a non-empty array for multi-AI sessions" },
          { status: 400 }
        );
      }
      const hasSmartAgent = selectedAgentIds.some(
        (value: unknown) =>
          typeof value === "string" && value.trim().toLowerCase() === "smart-model"
      );
      if (hasSmartAgent && selectedAgentIds.length > 1) {
        return Response.json(
          { error: "smart-model must be selected alone" },
          { status: 400 }
        );
      }
      if (selectedAgentIds.length > 10) {
        return Response.json(
          { error: "Maximum 10 agents per session" },
          { status: 400 }
        );
      }
    }

    // 构建multi_ai_config
    // ✅ 无论是单AI还是多AI，都创建config对象
    // 这样前端统一传递agentId时后端也能识别
    const multiAiConfig = {
      isMultiAI,
      selectedAgentIds: isMultiAI ? selectedAgentIds : [selectedAgentIds?.[0] || ""],
      collaborationMode: isMultiAI ? collaborationMode : "single",
      lockedAt: new Date().toISOString(),
      lockedBy: userId,
    };

    // 根据区域选择数据库
    if (isChinaRegion()) {
      // 国内版：CloudBase
      const { data: session, error } = await createCloudBaseSession(
        userId,
        title,
        model,
        multiAiConfig
      );

      if (error || !session) {
        console.error("Failed to create session in CloudBase:", error);
        return Response.json(
          { error: "Failed to create session" },
          { status: 500 }
        );
      }

      // 标准化会话格式，确保有 id 字段
      const normalizedSession = {
        id: session._id,
        ...session,
      };

      return Response.json({ session: normalizedSession }, { status: 201 });
    } else {
      // 国际版：Supabase
      const sessionData: any = {
        user_id: userId,
        title: title.trim(),
        model,
      };

      // ✅ 改进：总是添加多AI配置（即使是单AI会话）
      // 这样前端统一传递agentId时后端也能识别
      sessionData.multi_ai_config = multiAiConfig;

      const { data: session, error } = await supabaseAdmin
        .from("gpt_sessions")
        .insert(sessionData)
        .select()
        .single();

      if (error) {
        console.error("Failed to create session in Supabase:", error);
        return Response.json(
          { error: "Failed to create session" },
          { status: 500 }
        );
      }

      return Response.json({ session }, { status: 201 });
    }
  } catch (error) {
    console.error("Create session API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
