import { NextRequest, NextResponse } from "next/server";
import { getAI, getDefaultAIModel } from "@/lib/ai/adapter";
import { z } from "zod";

// AI 聊天请求验证schema
const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    })
  ),
  model: z.string().optional(),
  stream: z.boolean().optional().default(false),
});

/**
 * POST /api/ai/chat
 * AI 聊天接口，支持流式和非流式响应
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 验证输入
    const validationResult = chatSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          code: "VALIDATION_ERROR",
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const {
      messages,
      model = getDefaultAIModel(),
      stream = false,
    } = validationResult.data;

    // 获取 AI 适配器
    const ai = getAI();

    if (stream) {
      // 流式响应
      const response = await ai.chatStream(messages, model);

      return new Response(response.stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } else {
      // 非流式响应
      const response = await ai.chat(messages, model);

      return NextResponse.json({
        success: true,
        content: response.content,
        model: response.model,
        usage: response.usage,
      });
    }
  } catch (error) {
    console.error("AI chat error:", error);

    return NextResponse.json(
      {
        error: "AI service error",
        code: "AI_ERROR",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai/models
 * 获取可用模型列表
 */
export async function GET(request: NextRequest) {
  try {
    const ai = getAI();
    const models = ai.getAvailableModels();
    const defaultModel = ai.getDefaultModel();

    return NextResponse.json({
      success: true,
      models,
      defaultModel,
    });
  } catch (error) {
    console.error("Get models error:", error);

    return NextResponse.json(
      {
        error: "Failed to get models",
        code: "MODELS_ERROR",
      },
      { status: 500 }
    );
  }
}
