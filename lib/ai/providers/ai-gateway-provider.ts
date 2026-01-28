/**
 * Vercel AI Gateway Provider
 *
 * 使用统一的 AI Gateway API 访问多个 AI 提供商
 * 支持 OpenAI、Anthropic、Google、Meta、Mistral 等
 */

import { StreamChunk, AIMessage, ChatOptions } from "../types";

export class AIGatewayProvider {
  name = "ai-gateway";
  private apiKey: string;
  private baseURL: string = "https://ai-gateway.vercel.sh/v1";

  constructor() {
    const apiKey = process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) {
      throw new Error("AI_GATEWAY_API_KEY environment variable is required");
    }
    this.apiKey = apiKey;
    console.log("[AI Gateway] Initialized with base URL:", this.baseURL);
  }

  /**
   * 聊天流式接口（兼容 BaseAIProvider）
   */
  async *chatStream(
    messages: AIMessage[],
    options: ChatOptions = {}
  ): AsyncGenerator<StreamChunk> {
    const { model = "openai/gpt-4o-mini", temperature = 0.7 } = options;

    console.log(`[AI Gateway] Streaming chat with model: ${model}`);

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI Gateway] API error (${response.status}):`, errorText);
      throw new Error(
        `AI Gateway API error: ${response.status} ${response.statusText}`
      );
    }

    if (!response.body) {
      throw new Error("Response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let totalTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log("[AI Gateway] Stream completed");
          yield {
            content: "",
            done: true,
            tokens: totalTokens,
          };
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith("data: ")) {
            continue;
          }

          const data = trimmedLine.slice(6); // Remove "data: " prefix

          if (data === "[DONE]") {
            console.log("[AI Gateway] Received [DONE] signal");
            yield {
              content: "",
              done: true,
              tokens: totalTokens,
            };
            return;
          }

          try {
            const parsed = JSON.parse(data);

            // 处理流式响应
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              yield {
                content: delta.content,
                done: false,
              };
            }

            // 提取 token 使用信息
            if (parsed.usage) {
              totalTokens = parsed.usage.total_tokens || 0;
            }
          } catch (error) {
            console.error("[AI Gateway] Failed to parse SSE data:", data);
          }
        }
      }
    } catch (error) {
      console.error("[AI Gateway] Stream error:", error);
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 简化的流式聊天接口（原始方法）
   */
  async *streamChat(
    model: string,
    messages: Array<{ role: string; content: string }>,
    systemPrompt?: string
  ): AsyncGenerator<StreamChunk> {
    // 转换为 AIMessage 格式并调用 chatStream
    const aiMessages: AIMessage[] = systemPrompt
      ? [
          { role: "system" as const, content: systemPrompt },
          ...messages.map((msg) => ({
            role: msg.role as "system" | "user" | "assistant",
            content: msg.content,
          })),
        ]
      : messages.map((msg) => ({
          role: msg.role as "system" | "user" | "assistant",
          content: msg.content,
        }));

    yield* this.chatStream(aiMessages, { model });
  }

  /**
   * 计算消息的token数量（估算）
   * @param messages 消息列表
   * @param model 可选：指定模型
   * @returns token数量估算
   */
  countTokens(messages: AIMessage[], model?: string): number {
    // 简单的字符计数估算：平均每个token约4个字符
    const totalChars = messages.reduce(
      (sum, msg) => sum + msg.content.length,
      0
    );
    return Math.ceil(totalChars / 4);
  }

  /**
   * 非流式聊天完成
   * @param messages 消息历史
   * @param options 聊天选项
   * @returns AI响应
   */
  async chat(messages: AIMessage[], options?: ChatOptions): Promise<any> {
    const { model = "openai/gpt-4o-mini", temperature = 0.7 } = options || {};

    let fullContent = "";
    let totalTokens = 0;

    for await (const chunk of this.chatStream(messages, {
      model,
      temperature,
    })) {
      if (chunk.content) {
        fullContent += chunk.content;
      }
      if (chunk.done && chunk.tokens) {
        totalTokens = chunk.tokens;
      }
    }

    return {
      content: fullContent,
      tokens: {
        prompt: Math.floor(totalTokens * 0.4),
        completion: Math.floor(totalTokens * 0.6),
        total: totalTokens,
      },
      model,
      finish_reason: "stop",
    };
  }
}
