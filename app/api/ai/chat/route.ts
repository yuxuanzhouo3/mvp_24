import { NextRequest, NextResponse } from "next/server";
import { getAI } from "@/lib/ai/adapter";
import { getDefaultRuntimeModel, listEnabledRuntimeModelKeys } from "@/lib/ai/runtime-models";
import { z } from "zod";

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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

    const { messages, model, stream = false } = validationResult.data;
    const ai = getAI();
    const resolvedModel = model || (await getDefaultRuntimeModel());

    if (stream) {
      const response = await ai.chatStream(messages, resolvedModel);
      return new Response(response.stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const response = await ai.chat(messages, resolvedModel);
    return NextResponse.json({
      success: true,
      content: response.content,
      model: response.model || resolvedModel,
      usage: response.usage,
    });
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

export async function GET(request: NextRequest) {
  try {
    const models = await listEnabledRuntimeModelKeys();
    const defaultModel = await getDefaultRuntimeModel();

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
