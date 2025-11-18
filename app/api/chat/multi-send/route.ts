/**
 * Multi-Agent Chat API
 * POST /api/chat/multi-send
 * 支持多个AI协同工作（顺序、并行、辩论、综合模式）
 */

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  multiAgentOrchestrator,
  CollaborationMode,
} from "@/lib/ai/multi-agent-orchestrator";
import { validateAgents, getAgentById } from "@/lib/ai/ai-agents.config";
import { recordUsage } from "@/lib/ai/token-counter";
import { captureException } from "@/lib/sentry";
import { verifyAuthToken, extractTokenFromHeader } from "@/lib/auth-utils";
import { isChinaRegion } from "@/lib/config/region";
import { saveGptMessage as saveCloudBaseMessage } from "@/lib/cloudbase-db";

export const runtime = "nodejs";

/**
 * POST /api/chat/multi-send
 * 多AI协作聊天
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

    // 解析请求
    const body = await req.json();
    const {
      sessionId,
      message,
      agentIds, // 选中的多个AI的ID数组
      mode = "parallel", // 协作模式: sequential, parallel, debate, synthesis
      rounds = 2, // 辩论模式的轮数
    } = body as {
      sessionId: string;
      message: string;
      agentIds: string[];
      mode?: CollaborationMode;
      rounds?: number;
    };

    // 验证参数
    if (!sessionId || !message || !agentIds || agentIds.length === 0) {
      return Response.json(
        { error: "sessionId, message, and agentIds are required" },
        { status: 400 }
      );
    }

    if (agentIds.length > 10) {
      return Response.json(
        { error: "Maximum 10 agents allowed per request" },
        { status: 400 }
      );
    }

    // 获取用户订阅
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("subscription_plan")
      .eq("id", userId)
      .single();

    const userPlan = profile?.subscription_plan || "free";

    // 验证AI可用性
    const validation = validateAgents(agentIds, userPlan);

    if (validation.invalid.length > 0) {
      return Response.json(
        {
          error: "Some agents are not available",
          invalid: validation.invalid,
        },
        { status: 400 }
      );
    }

    if (validation.needsUpgrade.length > 0) {
      return Response.json(
        {
          error: "Some agents require premium subscription",
          needsUpgrade: validation.needsUpgrade,
          upgradeUrl: "/payment",
        },
        { status: 403 }
      );
    }

    // 检查免费用户限额
    if (userPlan === "free") {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const { count } = await supabaseAdmin
        .from("gpt_messages")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("role", "assistant")
        .gte("created_at", startOfMonth.toISOString());

      if ((count || 0) >= 100) {
        return Response.json(
          {
            error: "Monthly quota exceeded",
            message: "Free tier限制为100次/月",
            upgradeUrl: "/payment",
          },
          { status: 429 }
        );
      }
    }

    // 验证会话所有权
    let session: any;
    let sessionError: any;

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

      if (result.data && result.data.length > 0) {
        const conv = result.data[0];
        if (conv.user_id === userId) {
          session = conv;
        } else {
          sessionError = { message: "Access denied" };
        }
      } else {
        sessionError = { message: "Session not found" };
      }
    } else {
      // 国际版：从 Supabase 获取
      const result = await supabaseAdmin
        .from("gpt_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("user_id", userId)
        .single();
      session = result.data;
      sessionError = result.error;
    }

    if (sessionError || !session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    // 保存用户消息
    if (isChinaRegion()) {
      await saveCloudBaseMessage({
        session_id: sessionId,
        user_id: userId,
        role: "user",
        content: message,
      });
    } else {
      await supabaseAdmin.from("gpt_messages").insert({
        session_id: sessionId,
        user_id: userId,
        role: "user",
        content: message,
        tokens_used: 0,
      });
    }

    // 执行多AI协作
    let result;

    switch (mode) {
      case "sequential":
        result = await multiAgentOrchestrator.sequential(
          validation.valid,
          message
        );
        break;

      case "parallel":
        result = await multiAgentOrchestrator.parallel(
          validation.valid,
          message
        );
        break;

      case "debate":
        result = await multiAgentOrchestrator.debate(
          validation.valid,
          message,
          rounds
        );
        break;

      case "synthesis":
        result = await multiAgentOrchestrator.synthesis(
          validation.valid,
          message
        );
        break;

      default:
        return Response.json(
          { error: "Invalid collaboration mode" },
          { status: 400 }
        );
    }

    // 保存所有AI响应到数据库
    for (const response of result.responses) {
      if (!response.error) {
        if (isChinaRegion()) {
          await saveCloudBaseMessage({
            session_id: sessionId,
            user_id: userId,
            role: "assistant",
            content: `[${response.agentName}]\n${response.content}`,
            tokens_used: response.tokens,
          });
        } else {
          await supabaseAdmin.from("gpt_messages").insert({
            session_id: sessionId,
            user_id: userId,
            role: "assistant",
            content: `[${response.agentName}]\n${response.content}`,
            tokens_used: response.tokens,
          });
        }

        // 记录Token使用
        const agent = getAgentById(response.agentId);
        if (agent) {
          await recordUsage({
            userId,
            sessionId,
            model: agent.model,
            promptTokens: Math.floor(response.tokens * 0.4),
            completionTokens: Math.floor(response.tokens * 0.6),
            totalTokens: response.tokens,
            costUsd: response.cost,
          });
        }
      }
    }

    // 如果有综合结论，也保存
    if (result.synthesis) {
      if (isChinaRegion()) {
        await saveCloudBaseMessage({
          session_id: sessionId,
          user_id: userId,
          role: "assistant",
          content: `[综合结论]\n${result.synthesis}`,
        });
      } else {
        await supabaseAdmin.from("gpt_messages").insert({
          session_id: sessionId,
          user_id: userId,
          role: "assistant",
          content: `[综合结论]\n${result.synthesis}`,
          tokens_used: 0,
        });
      }
    }

    // 更新会话时间
    if (isChinaRegion()) {
      const cloudbase = require("@cloudbase/node-sdk")
        .init({
          env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
          secretId: process.env.CLOUDBASE_SECRET_ID,
          secretKey: process.env.CLOUDBASE_SECRET_KEY,
        })
        .database();

      await cloudbase.collection("ai_conversations").doc(sessionId).update({
        updated_at: new Date().toISOString(),
      });
    } else {
      await supabaseAdmin
        .from("gpt_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", sessionId);
    }

    // 返回结果
    return Response.json({
      success: true,
      mode: result.mode,
      responses: result.responses.map((r) => ({
        agentId: r.agentId,
        agentName: r.agentName,
        content: r.content,
        tokens: r.tokens,
        cost: r.cost,
        error: r.error,
      })),
      synthesis: result.synthesis,
      summary: {
        totalAgents: result.responses.length,
        totalTokens: result.totalTokens,
        totalCost: result.totalCost,
        successCount: result.responses.filter((r) => !r.error).length,
        errorCount: result.responses.filter((r) => r.error).length,
      },
    });
  } catch (error) {
    console.error("Multi-agent chat error:", error);
    captureException(error);
    return Response.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/chat/multi-send
 * 获取可用的AI列表和协作模式
 */
export async function GET(req: NextRequest) {
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

    // 获取用户订阅
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("subscription_plan")
      .eq("id", userId)
      .single();

    const userPlan = profile?.subscription_plan || "free";

    // 导入AI配置
    const { getEnabledAgents, COLLABORATION_MODES } = await import(
      "@/lib/ai/ai-agents.config"
    );
    const agents = getEnabledAgents();

    // 标记哪些AI需要付费
    const agentsWithAccess = agents.map((agent) => ({
      ...agent,
      available: !agent.isPremium || userPlan !== "free",
      requiresUpgrade: agent.isPremium && userPlan === "free",
    }));

    return Response.json({
      agents: agentsWithAccess,
      collaborationModes: Object.values(COLLABORATION_MODES),
      userPlan,
    });
  } catch (error) {
    console.error("Get agents error:", error);
    captureException(error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
