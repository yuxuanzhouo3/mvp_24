/**
 * OpenRouter Provider
 * 国际版统一通过 OpenRouter API 访问模型
 */

import { BaseAIProvider } from "./base-provider";
import {
  StreamChunk,
  AIMessage,
  ChatOptions,
  AIResponse,
  AIProviderError,
  ModelInfo,
} from "../types";

export class OpenRouterProvider extends BaseAIProvider {
  readonly name = "openrouter";
  readonly models: string[];
  readonly defaultModel: string;
  private apiKey: string;
  private baseURL = "https://openrouter.ai/api/v1";

  constructor(models: string[] = [], defaultModel?: string) {
    super();
    const apiKey = process.env.OPENROUTER_API;
    if (!apiKey) {
      throw new AIProviderError(
        "OPENROUTER_API environment variable is required",
        "missing_api_key",
        500
      );
    }
    this.apiKey = apiKey;
    this.models = Array.from(new Set(models.filter(Boolean)));
    this.defaultModel = defaultModel || this.models[0] || "openai/gpt-4o-mini";
  }

  getModelInfo(model: string): ModelInfo | null {
    return {
      id: model,
      name: model,
      provider: this.name,
      contextWindow: 128000,
      pricing: { prompt: 0, completion: 0 },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: true,
      },
    };
  }

  private buildHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000",
      "X-Title": process.env.APP_NAME || "MultiGPT",
    };
  }

  async *chatStream(
    messages: AIMessage[],
    options: ChatOptions = {}
  ): AsyncGenerator<StreamChunk> {
    const { model = this.defaultModel, temperature = 0.7, maxTokens } = options;
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AIProviderError(
        `OpenRouter API error: ${response.status} ${response.statusText}`,
        "api_error",
        response.status,
        errorText
      );
    }

    if (!response.body) {
      throw new AIProviderError("Response body is null", "empty_body", 500);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let totalTokens = 0;
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          yield {
            content: "",
            done: true,
            tokens: totalTokens,
            usage: {
              prompt: promptTokens || undefined,
              completion: completionTokens || undefined,
              total: totalTokens || undefined,
              source: totalTokens > 0 ? "provider" : "estimated",
            },
          };
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith("data: ")) continue;
          const data = trimmedLine.slice(6);
          if (data === "[DONE]") {
            yield {
              content: "",
              done: true,
              tokens: totalTokens,
              usage: {
                prompt: promptTokens || undefined,
                completion: completionTokens || undefined,
                total: totalTokens || undefined,
                source: totalTokens > 0 ? "provider" : "estimated",
              },
            };
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              yield { content: delta.content, done: false };
            }
            const usage = parsed.usage;
            if (usage) {
              if (typeof usage.prompt_tokens === "number") promptTokens = usage.prompt_tokens;
              if (typeof usage.completion_tokens === "number") completionTokens = usage.completion_tokens;
              if (typeof usage.total_tokens === "number") totalTokens = usage.total_tokens;
            }
          } catch {
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  countTokens(messages: AIMessage[], model?: string): number {
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  async chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse> {
    const { model = this.defaultModel, temperature = 0.7, maxTokens } = options || {};
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AIProviderError(
        `OpenRouter API error: ${response.status} ${response.statusText}`,
        "api_error",
        response.status,
        errorText
      );
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || "",
      model: data.model || model,
      tokens: {
        prompt: data.usage?.prompt_tokens || 0,
        completion: data.usage?.completion_tokens || 0,
        total: data.usage?.total_tokens || 0,
      },
      finish_reason: data.choices?.[0]?.finish_reason || "stop",
    };
  }
}
