/**
 * Chat Send API - 流式聊天端点
 * POST /api/chat/send
 * 支持Server-Sent Events (SSE) 流式响应
 */

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { aiRouter } from "@/lib/ai/router";
import type { BaseAIProvider } from "@/lib/ai/providers/base-provider";
import { calculateCost, getUserMonthlyUsage, recordUsage } from "@/lib/ai/token-counter";
import { AIMessage } from "@/lib/ai/types";
import { edgeChatRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";
import { verifyAuthToken, extractTokenFromHeader } from "@/lib/auth-utils";
import { isChinaRegion } from "@/lib/config/region";
import {
  saveGptMessage as saveCloudBaseMessage,
} from "@/lib/cloudbase-db";
import { appendSessionMessages } from "@/lib/chat-session-store";
import { resolveIntlUserPlan } from "@/lib/user-plan";
import { coercePlanId, getPlanQuotaSettings } from "@/lib/plan-quota-settings";
import { createMessageId } from "@/lib/chat/message-id";
import { resolveSmartModel } from "@/lib/ai/smart-model-router";
import { grantReferralFirstUseReward } from "@/lib/market/referrals";

// 使用Node.js Runtime以支持winston日志库
export const runtime = "nodejs";

type HistoryRole = "system" | "user" | "assistant";

interface HistoryMessage {
  role: HistoryRole;
  content: string;
}

const MAX_SMART_MODEL_ATTEMPTS = 3;
const CHINA_SMART_COLLAB_MODELS = [
  "deepseek-v3.2",
  "qwen3-max-2026-01-23",
  "qwen-plus-2025-12-01",
] as const;
const CHINA_SMART_COLLAB_MODEL_SET = new Set<string>(CHINA_SMART_COLLAB_MODELS);

function toHistoryRole(value: unknown): HistoryRole | null {
  if (value === "system" || value === "user" || value === "assistant") {
    return value;
  }
  return null;
}

function normalizeHistoryContent(content: unknown, role?: HistoryRole): string {
  if (typeof content === "string") {
    return content;
  }

  if (content && typeof content === "object") {
    if (role === "user") {
      const maybeModelInput = (content as any).modelInput ?? (content as any).model_input;
      if (typeof maybeModelInput === "string" && maybeModelInput.trim().length > 0) {
        return maybeModelInput;
      }
    }

    const maybeContent = (content as any).content;
    if (typeof maybeContent === "string") {
      return maybeContent;
    }
  }

  return "";
}

function extractHistoryMessages(
  sourceMessages: unknown[],
  currentAgentId?: string
): HistoryMessage[] {
  if (!Array.isArray(sourceMessages) || sourceMessages.length === 0) {
    return [];
  }

  const recentMessages = sourceMessages.slice(-20);

  return recentMessages
    .map((raw: any) => {
      const role = toHistoryRole(raw?.role);
      if (!role) {
        return null;
      }

      if (raw?.isMultiAI && Array.isArray(raw?.content)) {
        if (!currentAgentId) {
          return null;
        }

        const pieces = raw.content
          .filter((resp: any) => resp?.agentId === currentAgentId)
          .map((resp: any) => normalizeHistoryContent(resp?.content, role))
          .filter((text: string) => text.trim().length > 0);

        if (pieces.length === 0) {
          return null;
        }

        return {
          role,
          content: pieces.join("\n"),
        } as HistoryMessage;
      }

      const plainContent = normalizeHistoryContent(raw?.content, role);
      if (!plainContent.trim()) {
        return null;
      }

      return {
        role,
        content: plainContent,
      } as HistoryMessage;
    })
    .filter((item: HistoryMessage | null): item is HistoryMessage => item !== null);
}

function buildSmartModelAttemptList(input: {
  requestedModel: string;
  primaryModel: string;
  message: string;
  collaborationMode?: string;
  availableModels: string[];
  fallbackModel?: string;
  maxAttempts?: number;
}): string[] {
  const {
    requestedModel,
    primaryModel,
    message,
    collaborationMode,
    availableModels,
    fallbackModel,
    maxAttempts = MAX_SMART_MODEL_ATTEMPTS,
  } = input;

  const attempts: string[] = [];
  const used = new Set<string>();
  const boundedAttempts = Math.max(1, maxAttempts);

  if (primaryModel) {
    attempts.push(primaryModel);
    used.add(primaryModel);
  }

  for (let idx = attempts.length; idx < boundedAttempts; idx += 1) {
    const nextResolved = resolveSmartModel({
      requestedModel,
      message,
      collaborationMode,
      availableModels: availableModels.filter((modelId) => !used.has(modelId)),
      fallbackModel,
    });
    const nextModel = (nextResolved.model || "").trim();
    if (!nextModel || used.has(nextModel)) {
      break;
    }
    attempts.push(nextModel);
    used.add(nextModel);
  }

  if (attempts.length > 0) {
    return attempts;
  }
  return [fallbackModel || primaryModel || "gpt-3.5-turbo"];
}

function buildChinaCollabFallbackAttempts(
  requestedModel: string,
  availableModels: string[],
  maxAttempts = MAX_SMART_MODEL_ATTEMPTS
): string[] {
  const normalizedRequested = (requestedModel || "").trim();
  const availableSet = new Set(availableModels);
  const attempts: string[] = [];
  const used = new Set<string>();
  const boundedAttempts = Math.max(1, maxAttempts);

  if (
    normalizedRequested &&
    CHINA_SMART_COLLAB_MODEL_SET.has(normalizedRequested) &&
    availableSet.has(normalizedRequested)
  ) {
    attempts.push(normalizedRequested);
    used.add(normalizedRequested);
  }

  for (const candidate of CHINA_SMART_COLLAB_MODELS) {
    if (attempts.length >= boundedAttempts) break;
    if (!availableSet.has(candidate) || used.has(candidate)) continue;
    attempts.push(candidate);
    used.add(candidate);
  }

  if (attempts.length > 0) {
    return attempts;
  }
  return [normalizedRequested || CHINA_SMART_COLLAB_MODELS[0]];
}

/**
 * POST /api/chat/send
 * 发送消息并获取AI流式响应
 */
export async function POST(req: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await edgeChatRateLimit(req);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const startTime = Date.now();

  try {
    // ========================================
    // 1. 鉴权验证
    // ========================================
    const authHeader = req.headers.get("authorization");
    const { token, error: tokenError } = extractTokenFromHeader(authHeader);

    if (tokenError || !token) {
      return new Response(
        JSON.stringify({
          error: tokenError || "Missing or invalid authorization header",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const authResult = await verifyAuthToken(token);
    if (!authResult.success || !authResult.userId) {
      return new Response(
        JSON.stringify({
          error: authResult.error || "Invalid or expired token",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const userId = authResult.userId;

    // ========================================
    // 2. 解析请求参数
    // ========================================
    const body = await req.json();
    const {
      sessionId,
      message,
      model = "gpt-3.5-turbo",
      temperature,
      maxTokens,
      agentName, // 统一：Agent名称（单AI和多AI都传）
      agentId, // 统一：Agent ID（单AI和多AI都传）
      skipSave = false, // 国内版需要：跳过直接保存，由前端统一调用save-multi-ai
    } = body;

    // 验证必填参数
    if (!sessionId || !message) {
      return new Response(
        JSON.stringify({ error: "sessionId and message are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (typeof message !== "string" || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "message must be a non-empty string" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ========================================
    // 3. 验证会话所有权
    // ========================================
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

      try {
        const sessionResult = await cloudbase
          .collection("ai_conversations")
          .doc(sessionId)
          .get();

        if (sessionResult.data && sessionResult.data.length > 0) {
          const conv = sessionResult.data[0];
          if (conv.user_id === userId) {
            session = conv;
          } else {
            sessionError = { message: "Access denied" };
          }
        } else {
          sessionError = { message: "Session not found" };
        }
      } catch (err) {
        console.error("[CloudBase] Session query error:", err);
        sessionError = err;
      }
    } else {
      // 国际版：从 Supabase 获取会话
      const result = await supabaseAdmin
        .from("gpt_sessions")
        .select("id, user_id, messages, multi_ai_config")
        .eq("id", sessionId)
        .eq("user_id", userId)
        .single();
      session = result.data;
      sessionError = result.error;
    }

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: "Session not found or access denied" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // ========================================
    // 3.5 验证会话配置和agentId匹配
    // ========================================
    const sessionConfig = session.multi_ai_config;
    const lockedAgentIds = Array.isArray(sessionConfig?.selectedAgentIds)
      ? sessionConfig.selectedAgentIds.filter(
          (value: unknown): value is string =>
            typeof value === "string" && value.length > 0
        )
      : [];

    // ✅ 改进：无论单AI还是多AI，都应该检查sessionConfig
    // 前端总是传递agentId，所以后端应该接受
    if (agentId && sessionConfig) {
      // 验证agentId是否在锁定的列表中
      if (lockedAgentIds.length > 0 && !lockedAgentIds.includes(agentId)) {
        return new Response(
          JSON.stringify({
            error: "Agent not in session configuration",
            allowedAgents: lockedAgentIds,
            requestedAgent: agentId
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        );
      }

      if (lockedAgentIds.length === 0) {
        console.warn(
          `[WARN] Session ${sessionId} has multi_ai_config but no selectedAgentIds; skipping strict agent validation.`
        );
      }
    } else if (agentId && !sessionConfig) {
      // ✅ 如果sessionConfig不存在，这是旧数据，允许通过
      // 但记录警告日志
      console.warn(
        `[WARN] Session ${sessionId} has no multi_ai_config but agentId was provided. This might be legacy data.`
      );
    } else if (!agentId && sessionConfig && sessionConfig.isMultiAI && lockedAgentIds.length > 0) {
      // 多AI会话但没有提供agentId - 这是真正的错误
      return new Response(
        JSON.stringify({
          error: "This session is multi-AI configured but no agentId provided",
          expectedAgents: lockedAgentIds
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    const availableModels = aiRouter.getAllModels();
    const routerDefaultModel = aiRouter.getDefaultModel();
    const collaborationModeForRouting =
      typeof sessionConfig?.collaborationMode === "string"
        ? sessionConfig.collaborationMode
        : undefined;

    const resolvedModel = resolveSmartModel({
      requestedModel: model,
      message,
      collaborationMode: collaborationModeForRouting,
      availableModels,
      fallbackModel: routerDefaultModel,
    });
    const effectiveModel = resolvedModel.model;

    // ========================================
    // 4. 获取用户订阅信息并检查限额
    // ========================================
    let subscriptionPlan = "free";

    if (isChinaRegion()) {
      // 国内版：从 CloudBase 获取用户订阅状态
      const cloudbase = require("@cloudbase/node-sdk")
        .init({
          env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
          secretId: process.env.CLOUDBASE_SECRET_ID,
          secretKey: process.env.CLOUDBASE_SECRET_KEY,
        })
        .database();

      try {
        // ✅ 修复：使用正确的表名 subscriptions（不是 web_subscriptions）
        const subscriptionResult = await cloudbase
          .collection("subscriptions")
          .where({
            user_id: userId,
            status: "active",
          })
          .orderBy("current_period_end", "desc")
          .limit(1)
          .get();

        // 如果有有效的订阅且未过期
        if (
          subscriptionResult.data &&
          subscriptionResult.data.length > 0
        ) {
          const subscription = subscriptionResult.data[0];
          const expireTime = new Date(subscription.current_period_end);
          if (expireTime > new Date()) {
            // ✅ 修复：从 web_users 表中读取 pro 字段来确定订阅计划
            subscriptionPlan = "pro"; // 有有效订阅则为 pro
          }
        }
      } catch (err) {
        console.error("[CloudBase] Failed to fetch subscription:", err);
        // 默认为免费用户
        subscriptionPlan = "free";
      }
    } else {
      // 国际版：从 Supabase 获取用户订阅状态
      subscriptionPlan = await resolveIntlUserPlan(
        userId,
        (authResult.user as any)?.user_metadata || {}
      );
    }

    const planId = coercePlanId(subscriptionPlan);
    const quotaSettings = await getPlanQuotaSettings(planId);

    if (quotaSettings.tokenLimit > 0) {
      let usedTokens = 0;
      try {
        usedTokens = await getUserMonthlyUsage(userId);
      } catch (err) {
        console.error("[chat/send] Failed to check token quota:", err);
      }

      if (usedTokens >= quotaSettings.tokenLimit) {
        return new Response(
          JSON.stringify({
            error: "Monthly token quota exceeded",
            message:
              "You have reached your monthly token limit. Please upgrade or wait for the next cycle.",
            quota: { limit: quotaSettings.tokenLimit, used: usedTokens },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // ========================================
    // 5. 获取会话历史消息（带过滤）
    // ========================================
    const sessionMessages = Array.isArray(session.messages) ? session.messages : [];
    const history = extractHistoryMessages(sessionMessages, agentId);

    const messages: AIMessage[] = [
      ...history.map((msg: { role: string; content: string }) => ({
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content,
      })),
      { role: "user" as const, content: message },
    ];

    // ========================================
    // 6. 保存用户消息到数据库
    // ========================================
    if (!skipSave) {
      if (isChinaRegion()) {
        // 国内版：保存到 CloudBase（但只在非多AI模式下直接保存）
        // 多AI模式由前端统一调用 save-multi-ai
        if (!agentName) {
          await saveCloudBaseMessage({
            session_id: sessionId,
            user_id: userId,
            role: "user",
            content: message,
          });
        }
      } else {
        // 国际版：保存用户消息到 gpt_sessions.messages（和国内版相同结构）
        const userMsg = {
          id: createMessageId("msg"),
          content: message,
          role: "user",
          timestamp: new Date().toISOString(),
          tokens_used: 0,
        };

        try {
          await appendSessionMessages({
            sessionId,
            userId,
            messages: [userMsg],
          });
        } catch (saveError) {
          console.error("Failed to save user message:", saveError);
        }
      }
    }

    // ========================================
    // 7. 解析模型尝试链路并准备流式响应
    // ========================================
    const shouldUseChinaCollabFallback =
      isChinaRegion() &&
      typeof model === "string" &&
      CHINA_SMART_COLLAB_MODEL_SET.has(model.trim()) &&
      availableModels.some((m) => CHINA_SMART_COLLAB_MODEL_SET.has(m));

    const smartAttemptModels = shouldUseChinaCollabFallback
      ? buildChinaCollabFallbackAttempts(model, availableModels, MAX_SMART_MODEL_ATTEMPTS)
      : resolvedModel.routedFromSmart
        ? buildSmartModelAttemptList({
            requestedModel: model,
            primaryModel: effectiveModel,
            message,
            collaborationMode: collaborationModeForRouting,
            availableModels,
            fallbackModel: routerDefaultModel,
          })
        : [effectiveModel];

    console.log(
      `[Chat API] Model plan: ${smartAttemptModels.join(" -> ")}` +
        (shouldUseChinaCollabFallback
          ? ` (requested=${model}, reason=china_collab_fallback)`
          : resolvedModel.routedFromSmart
            ? ` (requested=${model}, reason=${resolvedModel.reason})`
            : "")
    );

    // 验证参数有效性
    console.log("[Chat API] Request parameters:", {
      requestedModel: model,
      effectiveModel,
      smartReason: shouldUseChinaCollabFallback
        ? "china_collab_fallback"
        : resolvedModel.routedFromSmart
          ? resolvedModel.reason
          : undefined,
      temperature: temperature,
      maxTokens: maxTokens,
      attemptModels: smartAttemptModels,
      messagesCount: messages.length,
      firstMessage: messages[0],
    });

    // 确保参数是有效的数字
    const validMaxTokens = maxTokens && !isNaN(maxTokens) && maxTokens > 0 ? maxTokens : undefined;
    const validTemperature = temperature !== undefined && !isNaN(temperature) ? temperature : undefined;

    // ========================================
    // 8. 创建SSE流式响应
    // ========================================
    const encoder = new TextEncoder();
    let fullResponse = "";
    let totalTokens = 0;
    let promptTokens = 0;
    let completionTokens = 0;

    const readableStream = new ReadableStream({
      async start(controller) {
        let activeModelForError = smartAttemptModels[0] || effectiveModel;
        let activeProviderForError = "unknown";
        let usageSource: "provider" | "estimated" = "estimated";

        try {
          // 发送开始事件
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "start" })}\n\n`)
          );

          let responseModel = effectiveModel;
          let streamResolved = false;
          let lastStreamError: unknown = null;
          const isFallbackRetryEnabled =
            resolvedModel.routedFromSmart || shouldUseChinaCollabFallback;

          for (
            let attemptIndex = 0;
            attemptIndex < smartAttemptModels.length;
            attemptIndex += 1
          ) {
            const attemptModel = smartAttemptModels[attemptIndex];
            activeModelForError = attemptModel;
            let attemptProvider: BaseAIProvider;

            try {
              attemptProvider = aiRouter.getProviderForModel(attemptModel);
            } catch (providerError) {
              lastStreamError = providerError;
              const hasMoreFallback = attemptIndex < smartAttemptModels.length - 1;
              console.error("[Chat API] Provider resolve failed:", {
                attemptIndex,
                model: attemptModel,
                error:
                  providerError instanceof Error
                    ? providerError.message
                    : String(providerError),
              });
              if (isFallbackRetryEnabled && hasMoreFallback) {
                continue;
              }
              throw providerError;
            }

            activeProviderForError = attemptProvider.name;

            if (attemptIndex > 0) {
              const fromModel = smartAttemptModels[attemptIndex - 1];
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "model_switch",
                    fromModel,
                    toModel: attemptModel,
                    reason: "empty_text_retry",
                  })}\n\n`
                )
              );
            }

            let attemptResponse = "";
            let attemptTokens = 0;
            let attemptPromptTokens = 0;
            let attemptCompletionTokens = 0;
            let attemptUsageSource: "provider" | "estimated" = "estimated";
            let isDone = false;

            try {
              console.log(
                `[Chat API] Streaming attempt ${attemptIndex + 1}/${smartAttemptModels.length} model=${attemptModel}`
              );

              const stream = attemptProvider.chatStream(messages, {
                model: attemptModel,
                temperature: validTemperature,
                maxTokens: validMaxTokens,
                user: userId,
              });

              for await (const chunk of stream) {
                if (isDone) continue; // 跳过已完成后的额外chunk

                const chunkContent = chunk.content || "";
                if (chunkContent) {
                  attemptResponse += chunkContent;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "content",
                        content: chunkContent,
                      })}\n\n`
                    )
                  );
                }

                if (chunk.done) {
                  isDone = true;
                  if (chunk.usage) {
                    if (typeof chunk.usage.prompt === "number" && chunk.usage.prompt >= 0) {
                      attemptPromptTokens = chunk.usage.prompt;
                    }
                    if (
                      typeof chunk.usage.completion === "number" &&
                      chunk.usage.completion >= 0
                    ) {
                      attemptCompletionTokens = chunk.usage.completion;
                    }
                    if (
                      typeof chunk.usage.source === "string" &&
                      (chunk.usage.source === "provider" ||
                        chunk.usage.source === "estimated")
                    ) {
                      attemptUsageSource = chunk.usage.source;
                    }
                  }
                  const calculatedTokens = attemptProvider.countTokens([
                    ...messages,
                    { role: "assistant", content: attemptResponse },
                  ]);
                  const usageTotal =
                    typeof chunk.usage?.total === "number" && chunk.usage.total > 0
                      ? chunk.usage.total
                      : 0;
                  attemptTokens =
                    usageTotal ||
                    (typeof chunk.tokens === "number" && chunk.tokens > 0
                      ? chunk.tokens
                      : calculatedTokens);
                }
              }
            } catch (attemptError) {
              lastStreamError = attemptError;
              const hasMoreFallback =
                isFallbackRetryEnabled &&
                attemptIndex < smartAttemptModels.length - 1;
              const hasPartialText = attemptResponse.trim().length > 0;
              console.error("[Chat API] Stream attempt failed:", {
                attemptIndex,
                model: attemptModel,
                provider: attemptProvider.name,
                error:
                  attemptError instanceof Error
                    ? attemptError.message
                    : String(attemptError),
              });
              if (hasMoreFallback && !hasPartialText) {
                continue;
              }
              if (hasMoreFallback && hasPartialText) {
                console.warn(
                  `[Chat API] Retry skipped because partial text already streamed from ${attemptModel}`
                );
              }
              throw attemptError;
            }

            if (!attemptTokens) {
              attemptTokens = attemptProvider.countTokens([
                ...messages,
                { role: "assistant", content: attemptResponse },
              ]);
            }

            if (attemptPromptTokens <= 0 && attemptCompletionTokens <= 0) {
              // 回退：无 provider usage 时，按输入消息 token 与总 token 反推
              const promptEstimate = attemptProvider.countTokens(messages, attemptModel);
              attemptPromptTokens = Math.min(promptEstimate, attemptTokens);
              attemptCompletionTokens = Math.max(
                0,
                attemptTokens - attemptPromptTokens
              );
              attemptUsageSource = "estimated";
            } else if (
              attemptTokens > 0 &&
              attemptPromptTokens > 0 &&
              attemptCompletionTokens <= 0
            ) {
              attemptCompletionTokens = Math.max(
                0,
                attemptTokens - attemptPromptTokens
              );
            } else if (
              attemptTokens > 0 &&
              attemptCompletionTokens > 0 &&
              attemptPromptTokens <= 0
            ) {
              attemptPromptTokens = Math.max(0, attemptTokens - attemptCompletionTokens);
            } else if (attemptTokens <= 0) {
              attemptTokens = attemptPromptTokens + attemptCompletionTokens;
            }

            const hasTextResponse = attemptResponse.trim().length > 0;
            const canRetryOnEmpty =
              isFallbackRetryEnabled &&
              attemptIndex < smartAttemptModels.length - 1;

            if (!hasTextResponse && canRetryOnEmpty) {
              console.warn(
                `[Chat API] Empty text response from ${attemptModel}, switching to next fallback model`
              );
              continue;
            }

            fullResponse = attemptResponse;
            totalTokens = attemptTokens;
            promptTokens = attemptPromptTokens;
            completionTokens = attemptCompletionTokens;
            usageSource = attemptUsageSource;
            responseModel = attemptModel;
            streamResolved = true;
            break;
          }

          if (!streamResolved) {
            if (lastStreamError) {
              throw lastStreamError instanceof Error
                ? lastStreamError
                : new Error(String(lastStreamError));
            }
            throw new Error("No response from available models");
          }

          if (promptTokens + completionTokens <= 0 && totalTokens > 0) {
            const promptEstimate = Math.floor(totalTokens * 0.5);
            promptTokens = promptEstimate;
            completionTokens = Math.max(0, totalTokens - promptEstimate);
            usageSource = "estimated";
          }

          // 保存AI响应到数据库
          if (!skipSave) {
            if (isChinaRegion()) {
              // 国内版：保存到 CloudBase（但只在非多AI模式下直接保存）
              // 多AI模式由前端统一调用 save-multi-ai
              if (!agentName) {
                await saveCloudBaseMessage({
                  session_id: sessionId,
                  user_id: userId,
                  role: "assistant",
                  content: fullResponse,
                  tokens_used: completionTokens,
                });
              }
            } else {
              // 国际版：保存AI响应到 gpt_sessions.messages（和国内版相同结构）
              if (!agentName) {
                // 单AI模式：直接保存响应
                const aiMsg = {
                  id: createMessageId("msg"),
                  content: fullResponse,
                  role: "assistant",
                  timestamp: new Date().toISOString(),
                  tokens_used: completionTokens,
                  model: responseModel,
                };

                await appendSessionMessages({
                  sessionId,
                  userId,
                  messages: [aiMsg],
                });
              }
              // 多AI模式由前端统一调用 save-multi-ai，不在这里保存
            }
          }

          // 记录Token使用
          const costUsd = calculateCost(
            responseModel,
            promptTokens,
            completionTokens
          );

          await recordUsage({
            userId,
            sessionId,
            model: responseModel,
            promptTokens,
            completionTokens,
            totalTokens,
            costUsd,
          });

          if (fullResponse.trim().length > 0) {
            await grantReferralFirstUseReward({
              invitedUserId: userId,
              toolId: agentId || responseModel || model,
              region: isChinaRegion() ? "CN" : "INTL",
            }).catch((rewardError) => {
              console.warn("[Chat API] Failed to grant referral first-use reward:", rewardError);
            });
          }

          // 更新会话的最后更新时间
          if (isChinaRegion()) {
            // 国内版：更新 CloudBase
            const cloudbase = require("@cloudbase/node-sdk")
              .init({
                env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
                secretId: process.env.CLOUDBASE_SECRET_ID,
                secretKey: process.env.CLOUDBASE_SECRET_KEY,
              })
              .database();

            await cloudbase
              .collection("ai_conversations")
              .doc(sessionId)
              .update({
                updated_at: new Date().toISOString(),
              });
          } else {
            // 国际版：更新 Supabase
            await supabaseAdmin
              .from("gpt_sessions")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", sessionId)
              .eq("user_id", userId);
          }

          // 发送完成事件
          const endTime = Date.now();
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "done",
                model: responseModel,
                tokens: {
                  prompt: promptTokens,
                  completion: completionTokens,
                  total: totalTokens,
                },
                cost: costUsd,
                usageSource,
                duration: endTime - startTime,
              })}\n\n`
            )
          );

          controller.close();
        } catch (error) {
          console.error("[Chat API] Stream error:", error);
          console.error("[Chat API] Error details:", {
            message: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            model: activeModelForError,
            provider: activeProviderForError,
          });

          // 发送错误事件
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: error instanceof Error ? error.message : "Unknown error",
              })}\n\n`
            )
          );

          controller.close();
        }
      },
    });

    // 返回SSE流
    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // 禁用Nginx缓冲
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    captureException(error);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * OPTIONS 处理CORS预检请求
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
