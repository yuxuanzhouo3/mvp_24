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
import { aiRouter } from "@/lib/ai/router";
import { validateAgents, getAgentById } from "@/lib/ai/ai-agents.config";
import { recordUsage } from "@/lib/ai/token-counter";
import { captureException } from "@/lib/sentry";
import { verifyAuthToken, extractTokenFromHeader } from "@/lib/auth-utils";
import { isChinaRegion } from "@/lib/config/region";
import { saveGptMessage as saveCloudBaseMessage } from "@/lib/cloudbase-db";
import { resolveIntlUserPlan } from "@/lib/user-plan";
import { coercePlanId } from "@/lib/plan-quota-settings";
import { appendSessionMessages } from "@/lib/chat-session-store";
import { createMessageId } from "@/lib/chat/message-id";
import { grantReferralFirstUseReward } from "@/lib/market/referrals";
import {
  resolveSmartModel,
  SMART_AGENT_ID,
  SMART_MODEL_ID,
} from "@/lib/ai/smart-model-router";
import {
  buildCatalogAgent,
  getDefaultRuntimeModel,
  listEnabledRuntimeModels,
} from "@/lib/ai/runtime-models";
import {
  authorizeCreditUsage,
  buildCreditReservationErrorPayload,
  estimateTextMetrics,
  releaseCreditUsageReservation,
  settleCreditUsage,
} from "@/lib/billing/engine";
import type { AIMessage } from "@/lib/ai/types";

export const runtime = "nodejs";

/**
 * POST /api/chat/multi-send
 * 多AI协作聊天
 */
export async function POST(req: NextRequest) {
  const reservedRequestIds: string[] = [];
  let currentUserId = "";

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
    currentUserId = userId;

    const body = await req.json();
    const {
      sessionId,
      message,
      agentIds,
      mode = "parallel",
      rounds = 2,
    } = body as {
      sessionId: string;
      message: string;
      agentIds: string[];
      mode?: CollaborationMode;
      rounds?: number;
    };

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

    let userPlan = "free";

    if (isChinaRegion()) {
      const cloudbase = require("@cloudbase/node-sdk")
        .init({
          env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
          secretId: process.env.CLOUDBASE_SECRET_ID,
          secretKey: process.env.CLOUDBASE_SECRET_KEY,
        })
        .database();

      try {
        const subscriptionResult = await cloudbase
          .collection("subscriptions")
          .where({
            user_id: userId,
            status: "active",
          })
          .orderBy("current_period_end", "desc")
          .limit(1)
          .get();

        if (subscriptionResult.data && subscriptionResult.data.length > 0) {
          const subscription = subscriptionResult.data[0];
          const expireTime = new Date(subscription.current_period_end);
          if (expireTime > new Date()) {
            userPlan = "pro";
          }
        }
      } catch (err) {
        console.error("[CloudBase] Failed to fetch subscription:", err);
        userPlan = "free";
      }
    } else {
      userPlan = await resolveIntlUserPlan(
        userId,
        (authResult.user as any)?.user_metadata || {}
      );
    }

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

    const planId = coercePlanId(userPlan);

    let session: any;
    let sessionError: any;

    if (isChinaRegion()) {
      const cloudbase = require("@cloudbase/node-sdk")
        .init({
          env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
          secretId: process.env.CLOUDBASE_SECRET_ID,
          secretKey: process.env.CLOUDBASE_SECRET_KEY,
        })
        .database();

      const result = await cloudbase
        .collection("ai_conversations")
        .where({ user_id: userId, _id: sessionId })
        .limit(1)
        .get();
      session = result.data?.[0];
      sessionError = !session ? new Error("Session not found") : null;
    } else {
      const result = await supabaseAdmin
        .from("gpt_sessions")
        .select("id, user_id")
        .eq("id", sessionId)
        .eq("user_id", userId)
        .single();
      session = result.data;
      sessionError = result.error;
    }

    if (sessionError || !session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    const availableEntries = await listEnabledRuntimeModels();
    const availableModels = availableEntries.map((entry) => entry.modelKey).filter(Boolean);
    const routerDefaultModel = await getDefaultRuntimeModel();
    const billingBatchId = `multi:${sessionId}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    const groupedEstimates = new Map<
      string,
      { requestId: string; metrics: Record<string, number> }
    >();
    let synthesisEstimate:
      | { modelKey: string; metrics: Record<string, number> }
      | null = null;

    const addEstimate = async (
      runtimeModel: string,
      messagesForEstimate: AIMessage[],
      multiplier: number,
      maxTokens?: number
    ) => {
      const estimated = await estimateTextMetrics({
        messages: messagesForEstimate,
        modelKey: runtimeModel,
        maxTokens,
      });
      const current = groupedEstimates.get(runtimeModel) || {
        requestId: `${billingBatchId}:${runtimeModel}`,
        metrics: { input_tokens: 0, output_tokens: 0, request_count: 0 },
      };
      current.metrics.input_tokens += (estimated.input_tokens || 0) * multiplier;
      current.metrics.output_tokens += (estimated.output_tokens || 0) * multiplier;
      current.metrics.request_count += Math.max(1, multiplier);
      groupedEstimates.set(runtimeModel, current);
      return estimated;
    };

    for (const agentId of validation.valid) {
      const agent = getAgentById(agentId);
      if (!agent) continue;
      const runtimeModel = resolveSmartModel({
        requestedModel: agent.model,
        message,
        collaborationMode: mode,
        availableEntries,
        availableModels,
        fallbackModel: routerDefaultModel,
        userPlan,
      }).model;
      const messagesForEstimate: AIMessage[] = [
        { role: "system", content: agent.systemPrompt || "" },
        { role: "user", content: message },
      ];
      const multiplier = mode === "debate" ? Math.max(1, rounds) : 1;
      await addEstimate(runtimeModel, messagesForEstimate, multiplier, agent.maxTokens);
    }

    if (mode === "synthesis") {
      const synthesizer = getAgentById(agentIds[0]);
      if (synthesizer) {
        const synthesisModel = resolveSmartModel({
          requestedModel: synthesizer.model,
          message,
          collaborationMode: mode,
          availableEntries,
          availableModels,
          fallbackModel: routerDefaultModel,
          userPlan,
        }).model;
        const metrics = await addEstimate(
          synthesisModel,
          [
            { role: "system", content: synthesizer.systemPrompt || "" },
            { role: "user", content: message },
          ],
          1,
          synthesizer.maxTokens
        );
        synthesisEstimate = { modelKey: synthesisModel, metrics };
      }
    }

    for (const [modelKey, estimate] of groupedEstimates.entries()) {
      const reservation = await authorizeCreditUsage({
        userId,
        sessionId,
        requestId: estimate.requestId,
        planId,
        modelKey,
        metrics: estimate.metrics,
        metadata: {
          route: "chat/multi-send",
          mode,
        },
      });

      if (!reservation.success) {
        for (const requestId of reservedRequestIds) {
          await releaseCreditUsageReservation({
            userId,
            requestId,
            reason: "multi_authorize_failed",
          }).catch(() => undefined);
        }

        const payload = buildCreditReservationErrorPayload(reservation);
        return Response.json(payload, {
          status: reservation.failureCode === "reservation_failed" ? 503 : 402,
        });
      }

      reservedRequestIds.push(estimate.requestId);
    }

    if (isChinaRegion()) {
      await saveCloudBaseMessage({
        session_id: sessionId,
        user_id: userId,
        role: "user",
        content: message,
      });
    } else {
      const userMsg = {
        id: createMessageId("msg"),
        content: message,
        role: "user",
        timestamp: new Date().toISOString(),
        tokens_used: 0,
      };

      await appendSessionMessages({
        sessionId,
        userId,
        messages: [userMsg],
      });
    }

    let result;

    switch (mode) {
      case "sequential":
        result = await multiAgentOrchestrator.sequential(validation.valid, message);
        break;
      case "parallel":
        result = await multiAgentOrchestrator.parallel(validation.valid, message);
        break;
      case "debate":
        result = await multiAgentOrchestrator.debate(validation.valid, message, rounds);
        break;
      case "synthesis":
        result = await multiAgentOrchestrator.synthesis(validation.valid, message);
        break;
      default:
        return Response.json({ error: "Invalid collaboration mode" }, { status: 400 });
    }

    const groupedActual = new Map<
      string,
      { requestId: string; metrics: Record<string, number>; hasActual: boolean }
    >();

    for (const [modelKey, estimate] of groupedEstimates.entries()) {
      groupedActual.set(modelKey, {
        requestId: estimate.requestId,
        metrics: { input_tokens: 0, output_tokens: 0, request_count: 0 },
        hasActual: false,
      });
    }

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
          const aiMsg = {
            id: createMessageId("msg"),
            content: response.content,
            role: "assistant",
            timestamp: new Date().toISOString(),
            tokens_used: response.tokens,
            agentName: response.agentName,
            agentId: response.agentId,
            model: response.model || getAgentById(response.agentId)?.model,
          };

          await appendSessionMessages({
            sessionId,
            userId,
            messages: [aiMsg],
          });
        }

        const agent = getAgentById(response.agentId);
        if (agent) {
          const promptTokens =
            typeof (response as any).promptTokens === "number"
              ? Math.max(0, Number((response as any).promptTokens))
              : Math.floor(response.tokens * 0.5);
          const completionTokens =
            typeof (response as any).completionTokens === "number"
              ? Math.max(0, Number((response as any).completionTokens))
              : Math.max(0, response.tokens - promptTokens);
          const runtimeModel = response.model || agent.model;

          await recordUsage({
            userId,
            sessionId,
            model: runtimeModel,
            promptTokens,
            completionTokens,
            totalTokens: response.tokens,
            costUsd: response.cost,
          });

          const current = groupedActual.get(runtimeModel) || {
            requestId: `${billingBatchId}:${runtimeModel}`,
            metrics: { input_tokens: 0, output_tokens: 0, request_count: 0 },
            hasActual: false,
          };
          current.metrics.input_tokens += promptTokens;
          current.metrics.output_tokens += completionTokens;
          current.metrics.request_count += 1;
          current.hasActual = true;
          groupedActual.set(runtimeModel, current);
        }
      }
    }

    if (result.synthesis) {
      if (isChinaRegion()) {
        await saveCloudBaseMessage({
          session_id: sessionId,
          user_id: userId,
          role: "assistant",
          content: `[综合结论]\n${result.synthesis}`,
        });
      } else {
        const synthesisMsg = {
          id: createMessageId("msg"),
          content: result.synthesis,
          role: "assistant",
          timestamp: new Date().toISOString(),
          tokens_used: 0,
          isMultiAI: true,
        };

        await appendSessionMessages({
          sessionId,
          userId,
          messages: [synthesisMsg],
        });
      }

      if (synthesisEstimate) {
        const current = groupedActual.get(synthesisEstimate.modelKey) || {
          requestId: `${billingBatchId}:${synthesisEstimate.modelKey}`,
          metrics: { input_tokens: 0, output_tokens: 0, request_count: 0 },
          hasActual: false,
        };
        current.metrics.input_tokens += synthesisEstimate.metrics.input_tokens || 0;
        current.metrics.output_tokens += synthesisEstimate.metrics.output_tokens || 0;
        current.metrics.request_count += 1;
        current.hasActual = true;
        groupedActual.set(synthesisEstimate.modelKey, current);
      }
    }

    for (const [modelKey, actual] of groupedActual.entries()) {
      if (actual.hasActual) {
        await settleCreditUsage({
          userId,
          sessionId,
          requestId: actual.requestId,
          planId,
          modelKey,
          metrics: actual.metrics,
          metadata: { route: "chat/multi-send", mode },
        });
      } else {
        await releaseCreditUsageReservation({
          userId,
          requestId: actual.requestId,
          reason: "multi_call_not_used",
        });
      }
    }

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
        .eq("id", sessionId)
        .eq("user_id", userId);
    }

    const successfulResponses = result.responses.filter(
      (item: any) => !item.error && String(item.content || "").trim().length > 0
    );
    if (successfulResponses.length > 0) {
      await grantReferralFirstUseReward({
        invitedUserId: userId,
        toolId: successfulResponses[0]?.agentId || null,
        region: isChinaRegion() ? "CN" : "INTL",
      }).catch((rewardError) => {
        console.warn(
          "[Multi-Send API] Failed to grant referral first-use reward:",
          rewardError
        );
      });
    }

    return Response.json({
      success: true,
      mode: result.mode,
      responses: result.responses.map((r: any) => ({
        agentId: r.agentId,
        agentName: r.agentName,
        model: r.model,
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
        successCount: result.responses.filter((r: any) => !r.error).length,
        errorCount: result.responses.filter((r: any) => r.error).length,
      },
    });
  } catch (error) {
    for (const requestId of reservedRequestIds) {
      if (!currentUserId) continue;
      await releaseCreditUsageReservation({
        userId: currentUserId,
        requestId,
        reason: error instanceof Error ? error.message : "multi_send_error",
      }).catch(() => undefined);
    }
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
    let userPlan = "free";
    if (isChinaRegion()) {
      const cloudbase = require("@cloudbase/node-sdk")
        .init({
          env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
          secretId: process.env.CLOUDBASE_SECRET_ID,
          secretKey: process.env.CLOUDBASE_SECRET_KEY,
        })
        .database();

      const subscriptionResult = await cloudbase
        .collection("subscriptions")
        .where({
          user_id: userId,
          status: "active",
        })
        .orderBy("current_period_end", "desc")
        .limit(1)
        .get();

      if (subscriptionResult.data && subscriptionResult.data.length > 0) {
        const subscription = subscriptionResult.data[0];
        if (new Date(subscription.current_period_end) > new Date()) {
          userPlan = "pro";
        }
      }
    } else {
      userPlan = await resolveIntlUserPlan(
        userId,
        (authResult.user as any)?.user_metadata || {}
      );
    }

    // 导入AI配置
    const { getEnabledAgents, COLLABORATION_MODES } = await import(
      "@/lib/ai/ai-agents.config"
    );
    const baseAgents = isChinaRegion()
      ? getEnabledAgents()
      : await Promise.all(
          (await listEnabledRuntimeModels("INTL")).map((entry, index) =>
            buildCatalogAgent(entry, index)
          )
        );
    const agents = baseAgents.some((agent) => agent.id === SMART_AGENT_ID)
      ? baseAgents
      : [
          {
            id: SMART_AGENT_ID,
            name: isChinaRegion() ? "自动" : "Auto",
            provider: "auto",
            model: SMART_MODEL_ID,
            description: isChinaRegion()
              ? "自动选择最优模型"
              : "Automatically choose the best model",
            role: isChinaRegion() ? "自动路由" : "Auto Router",
            color: "bg-gray-500",
            systemPrompt: "You are the automatic model router.",
            temperature: 0.7,
            maxTokens: 4096,
            capabilities: {
              analysis: true,
              creative: true,
              research: true,
              translation: true,
              coding: true,
            },
            tags: ["analysis", "creative", "research", "translation", "coding"],
            enabled: true,
            isPremium: false,
            order: 0,
          },
          ...baseAgents,
        ];

    // 标记哪些AI需要付费
    const agentsWithAccess = agents.map((agent) => ({
      ...agent,
      available: !("isPremium" in agent && agent.isPremium) || userPlan !== "free",
      requiresUpgrade:
        Boolean("isPremium" in agent && agent.isPremium) && userPlan === "free",
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
