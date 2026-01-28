/**
 * Chat Send API - 流式聊天端点
 * POST /api/chat/send
 * 支持Server-Sent Events (SSE) 流式响应
 */

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { aiRouter } from "@/lib/ai/router";
import { calculateCost, recordUsage } from "@/lib/ai/token-counter";
import { AIMessage } from "@/lib/ai/types";
import { edgeChatRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";
import { verifyAuthToken, extractTokenFromHeader } from "@/lib/auth-utils";
import { isChinaRegion } from "@/lib/config/region";
import {
  getGptMessages as getCloudBaseMessages,
  saveGptMessage as saveCloudBaseMessage,
} from "@/lib/cloudbase-db";
import { countAssistantMessagesInMonth } from "@/lib/usage/count-assistant-messages";

// 使用Node.js Runtime以支持winston日志库
export const runtime = "nodejs";

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
        .select("*")
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

    // ✅ 改进：无论单AI还是多AI，都应该检查sessionConfig
    // 前端总是传递agentId，所以后端应该接受
    if (agentId && sessionConfig) {
      // 验证agentId是否在锁定的列表中
      if (!sessionConfig.selectedAgentIds.includes(agentId)) {
        return new Response(
          JSON.stringify({
            error: "Agent not in session configuration",
            allowedAgents: sessionConfig.selectedAgentIds,
            requestedAgent: agentId
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        );
      }
    } else if (agentId && !sessionConfig) {
      // ✅ 如果sessionConfig不存在，这是旧数据，允许通过
      // 但记录警告日志
      console.warn(
        `[WARN] Session ${sessionId} has no multi_ai_config but agentId was provided. This might be legacy data.`
      );
    } else if (!agentId && sessionConfig && sessionConfig.isMultiAI) {
      // 多AI会话但没有提供agentId - 这是真正的错误
      return new Response(
        JSON.stringify({
          error: "This session is multi-AI configured but no agentId provided",
          expectedAgents: sessionConfig.selectedAgentIds
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

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
      const { data: profile } = await supabaseAdmin
        .from("user_profiles")
        .select("subscription_plan")
        .eq("id", userId)
        .single();

      subscriptionPlan = profile?.subscription_plan || "free";
    }

    // 如果是免费用户，检查月度限额
    if (subscriptionPlan === "free") {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      let count = 0;
      let countError = null;

      if (isChinaRegion()) {
        // 国内版：从 CloudBase 的 ai_conversations 集合计数
        try {
          const cloudbase = require("@cloudbase/node-sdk")
            .init({
              env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
              secretId: process.env.CLOUDBASE_SECRET_ID,
              secretKey: process.env.CLOUDBASE_SECRET_KEY,
            })
            .database();

          // 查询用户的所有会话（不按时间过滤会话，按消息时间过滤）
          const conversationsResult = await cloudbase
            .collection("ai_conversations")
            .where({
              user_id: userId,
            })
            .get();

          // 使用统一的计数函数
          if (conversationsResult.data && Array.isArray(conversationsResult.data)) {
            count = countAssistantMessagesInMonth(conversationsResult.data, startOfMonth);
          }
        } catch (err) {
          console.error("[CloudBase] Error checking usage limit:", err);
          countError = err;
        }
      } else {
        // 国际版：从 Supabase 的 gpt_sessions 表计数
        try {
          const { data: sessions, error: sessionsError } = await supabaseAdmin
            .from("gpt_sessions")
            .select("messages")
            .eq("user_id", userId);

          if (sessionsError) {
            countError = sessionsError;
          } else if (sessions && Array.isArray(sessions)) {
            // 使用统一的计数函数
            count = countAssistantMessagesInMonth(sessions, startOfMonth);
          }
        } catch (err) {
          console.error("Error checking usage limit:", err);
          countError = err;
        }
      }

      if (countError) {
        console.error("Error checking usage limit:", countError);
      } else if (count >= 50) {
        return new Response(
          JSON.stringify({
            error: "Monthly quota exceeded",
            message:
              "You have reached the free tier limit of 50 messages per month. Please upgrade to continue.",
            quota: { limit: 50, used: count },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // ========================================
    // 5. 获取会话历史消息（带过滤）
    // ========================================
    let history: any[] = [];

    if (isChinaRegion()) {
      // 国内版：从 CloudBase 获取消息
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

      if (sessionResult.data && sessionResult.data.length > 0) {
        const conv = sessionResult.data[0];
        history = (conv.messages || [])
          .slice(-20) // 最近20条消息
          .map((msg: any) => {
            // ========================================
            // 核心过滤逻辑
            // ========================================
            // 如果是多AI消息，需要按agentId过滤
            if (msg.isMultiAI && Array.isArray(msg.content)) {
              if (agentId) {
                // 多AI模式：只获取当前agentId的回复
                const relevantResponses = msg.content.filter(
                  (resp: any) => resp.agentId === agentId
                );

                // 如果找到该agentId的历史回复，保留
                if (relevantResponses.length > 0) {
                  return {
                    role: msg.role,
                    content: relevantResponses.map((r: any) => r.content).join('\n'),
                    agentId: agentId,
                  };
                } else {
                  // 该agentId在此多AI消息中没有回复，跳过
                  return null;
                }
              } else {
                // 单AI模式：跳过多AI消息（保持隔离）
                return null;
              }
            } else if (!msg.isMultiAI) {
              // 单AI消息或用户消息，保留
              return {
                role: msg.role,
                content: msg.content,
              };
            }

            return null;
          })
          .filter((msg: any) => msg !== null); // 移除null项
      }
    } else {
      // 国际版：从 Supabase 获取消息（从 gpt_sessions.messages）
      const result = await supabaseAdmin
        .from("gpt_sessions")
        .select("messages")
        .eq("id", sessionId)
        .eq("user_id", userId)
        .single();

      if (result.data && result.data.messages && Array.isArray(result.data.messages)) {
        // 取最近20条消息
        const allMessages = result.data.messages;
        const recentMessages = allMessages.slice(-20);

        history = recentMessages
          .map((msg: any) => {
            // ========================================
            // 核心过滤逻辑
            // ========================================
            // 如果是多AI消息，需要按agentId过滤
            if (msg.isMultiAI && Array.isArray(msg.content)) {
              if (agentId) {
                // 多AI模式：只获取当前agentId的回复
                const relevantResponses = msg.content.filter(
                  (resp: any) => resp.agentId === agentId
                );

                // 如果找到该agentId的历史回复，保留
                if (relevantResponses.length > 0) {
                  return {
                    role: msg.role,
                    content: relevantResponses.map((r: any) => r.content).join('\n'),
                    agentId: agentId,
                  };
                } else {
                  // 该agentId在此多AI消息中没有回复，跳过
                  return null;
                }
              } else {
                // 单AI模式：跳过多AI消息（保持隔离）
                return null;
              }
            } else if (!msg.isMultiAI) {
              // 单AI消息或用户消息
              let contentStr = "";

              if (typeof msg.content === "string") {
                contentStr = msg.content;
              } else if (msg.content && typeof msg.content === "object") {
                contentStr = msg.content.content || "";
              }

              return {
                role: msg.role,
                content: contentStr,
              };
            }

            return null;
          })
          .filter((msg: any) => msg !== null); // 移除null项
      }
    }

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
          content: message,
          role: "user",
          timestamp: new Date().toISOString(),
          tokens_used: 0,
        };

        // 获取当前会话的消息数组
        const { data: session } = await supabaseAdmin
          .from("gpt_sessions")
          .select("messages")
          .eq("id", sessionId)
          .eq("user_id", userId)
          .single();

        if (session) {
          const updatedMessages = [...(session.messages || []), userMsg];
          const { error: updateError } = await supabaseAdmin
            .from("gpt_sessions")
            .update({ messages: updatedMessages })
            .eq("id", sessionId)
            .eq("user_id", userId);

          if (updateError) {
            console.error("Failed to save user message:", updateError);
          }
        }
      }
    }

    // ========================================
    // 7. 获取AI Provider并开始流式响应
    // ========================================
    console.log(`[Chat API] Getting provider for model: ${model}`);
    const provider = aiRouter.getProviderForModel(model);
    console.log(`[Chat API] Provider found: ${provider.name}`);

    // 验证参数有效性
    console.log("[Chat API] Request parameters:", {
      model,
      temperature: temperature,
      maxTokens: maxTokens,
      messagesCount: messages.length,
      firstMessage: messages[0],
    });

    // 确保参数是有效的数字
    const validMaxTokens = maxTokens && !isNaN(maxTokens) && maxTokens > 0 ? maxTokens : undefined;
    const validTemperature = temperature !== undefined && !isNaN(temperature) ? temperature : undefined;

    const stream = provider.chatStream(messages, {
      model,
      temperature: validTemperature,
      maxTokens: validMaxTokens,
      user: userId,
    });

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
        try {
          // 发送开始事件
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "start" })}\n\n`)
          );

          // 处理流式响应
          let isDone = false;
          for await (const chunk of stream) {
            if (isDone) continue; // 跳过已完成后的额外chunk

            fullResponse += chunk.content;

            if (chunk.done) {
              isDone = true;
              // 流结束，计算Token
              const calculatedTokens = provider.countTokens([
                ...messages,
                { role: "assistant", content: fullResponse },
              ]);

              totalTokens = chunk.tokens || calculatedTokens;

              // 估算输入/输出Token比例（假设历史消息占80%输入）
              promptTokens = Math.floor(totalTokens * 0.4);
              completionTokens = totalTokens - promptTokens;

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
                      content: fullResponse,
                      role: "assistant",
                      timestamp: new Date().toISOString(),
                      tokens_used: completionTokens,
                    };

                    // 获取当前 messages
                    const { data: session } = await supabaseAdmin
                      .from("gpt_sessions")
                      .select("messages")
                      .eq("id", sessionId)
                      .eq("user_id", userId)
                      .single();

                    if (session) {
                      const updatedMessages = [...(session.messages || []), aiMsg];
                      await supabaseAdmin
                        .from("gpt_sessions")
                        .update({ messages: updatedMessages })
                        .eq("id", sessionId)
                        .eq("user_id", userId);
                    }
                  }
                  // 多AI模式由前端统一调用 save-multi-ai，不在这里保存
                }
              }

              // 记录Token使用
              const costUsd = calculateCost(
                model,
                promptTokens,
                completionTokens
              );

              await recordUsage({
                userId,
                sessionId,
                model,
                promptTokens,
                completionTokens,
                totalTokens,
                costUsd,
              });

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
                  .eq("id", sessionId);
              }

              // 发送完成事件
              const endTime = Date.now();
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "done",
                    tokens: {
                      prompt: promptTokens,
                      completion: completionTokens,
                      total: totalTokens,
                    },
                    cost: costUsd,
                    duration: endTime - startTime,
                  })}\n\n`
                )
              );

              controller.close();
            } else {
              // 发送内容块
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "content",
                    content: chunk.content,
                  })}\n\n`
                )
              );
            }
          }
        } catch (error) {
          console.error("[Chat API] Stream error:", error);
          console.error("[Chat API] Error details:", {
            message: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            model,
            provider: provider.name,
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
