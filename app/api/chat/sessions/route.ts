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
      const normalizedSessions = (sessions || []).map((session: any) => ({
        id: session._id,
        ...session,
      }));

      return Response.json({
        sessions: normalizedSessions,
        total: normalizedSessions.length,
        limit: safeLimit,
        offset: safeOffset,
      });
    } else {
      // 国际版：Supabase
      const {
        data: sessions,
        error,
        count,
      } = await supabaseAdmin
        .from("gpt_sessions")
        .select("*", { count: "exact" })
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

      // 添加消息计数到每个会话
      const sessionsWithCount = (sessions || []).map((session: any) => ({
        ...session,
        message_count: session.messages ? session.messages.length : 0,
      }));

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

    // 验证请求体
    const bodyValidation = await ApiValidator.validateBody(
      req,
      commonSchemas.createSession
    );

    if (!bodyValidation.success) {
      return Response.json({ error: bodyValidation.error }, { status: 400 });
    }

    const { title, model } = bodyValidation.data;

    if (!title || !model) {
      return Response.json(
        { error: "title and model are required" },
        { status: 400 }
      );
    }

    // 根据区域选择数据库
    if (isChinaRegion()) {
      // 国内版：CloudBase
      const { data: session, error } = await createCloudBaseSession(
        userId,
        title,
        model
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
      const { data: session, error } = await supabaseAdmin
        .from("gpt_sessions")
        .insert({
          user_id: userId,
          title: title.trim(),
          model,
        })
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
