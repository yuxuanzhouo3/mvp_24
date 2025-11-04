/**
 * Chat Send API - 流式聊天端点
 * POST /api/chat/send
 * 支持Server-Sent Events (SSE) 流式响应
 */

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { aiRouter } from "@/lib/ai/router";
import { calculateCost, recordUsage } from "@/lib/ai/token-counter";
import { AIMessage } from "@/lib/ai/types";
import { edgeChatRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";

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
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

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
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("gpt_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: "Session not found or access denied" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // ========================================
    // 4. 获取用户订阅信息并检查限额
    // ========================================
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("subscription_plan")
      .eq("id", user.id)
      .single();

    const subscriptionPlan = profile?.subscription_plan || "free";

    // 如果是免费用户，检查月度限额
    if (subscriptionPlan === "free") {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const { count, error: countError } = await supabaseAdmin
        .from("gpt_messages")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("role", "assistant")
        .gte("created_at", startOfMonth.toISOString());

      if (countError) {
        console.error("Error checking usage limit:", countError);
      } else if ((count || 0) >= 100) {
        return new Response(
          JSON.stringify({
            error: "Monthly quota exceeded",
            message:
              "You have reached the free tier limit of 100 messages per month. Please upgrade to continue.",
            quota: { limit: 100, used: count },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // ========================================
    // 5. 获取会话历史消息
    // ========================================
    const { data: history } = await supabaseAdmin
      .from("gpt_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(20); // 最近20条消息（控制上下文长度）

    const messages: AIMessage[] = [
      ...(history || []).map((msg: { role: string; content: string }) => ({
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content,
      })),
      { role: "user" as const, content: message },
    ];

    // ========================================
    // 6. 保存用户消息到数据库
    // ========================================
    const { error: saveUserMsgError } = await supabaseAdmin
      .from("gpt_messages")
      .insert({
        session_id: sessionId,
        user_id: user.id,
        role: "user",
        content: message,
        tokens_used: 0,
      });

    if (saveUserMsgError) {
      console.error("Failed to save user message:", saveUserMsgError);
    }

    // ========================================
    // 7. 获取AI Provider并开始流式响应
    // ========================================
    const provider = aiRouter.getProviderForModel(model);
    const stream = provider.chatStream(messages, {
      model,
      temperature,
      maxTokens,
      user: user.id,
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
          for await (const chunk of stream) {
            fullResponse += chunk.content;

            if (chunk.done) {
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
              await supabaseAdmin.from("gpt_messages").insert({
                session_id: sessionId,
                user_id: user.id,
                role: "assistant",
                content: fullResponse,
                tokens_used: completionTokens,
              });

              // 记录Token使用
              const costUsd = calculateCost(
                model,
                promptTokens,
                completionTokens
              );

              await recordUsage({
                userId: user.id,
                sessionId,
                model,
                promptTokens,
                completionTokens,
                totalTokens,
                costUsd,
              });

              // 更新会话的最后更新时间
              await supabaseAdmin
                .from("gpt_sessions")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", sessionId);

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
          console.error("Stream error:", error);

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
