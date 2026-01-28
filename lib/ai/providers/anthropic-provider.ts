/**
 * Anthropic Claude Provider
 * Claude系列模型的实现
 */

import Anthropic from "@anthropic-ai/sdk";
import { BaseAIProvider } from "./base-provider";
import {
  AIMessage,
  AIResponse,
  StreamChunk,
  ChatOptions,
  AIProviderError,
  ModelInfo,
} from "../types";

export class AnthropicProvider extends BaseAIProvider {
  readonly name = "anthropic";
  readonly models = [
    "claude-3-5-sonnet-20241022",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307",
  ];
  readonly defaultModel = "claude-3-5-sonnet-20241022";

  private client: Anthropic;
  private modelInfoCache: Map<string, ModelInfo> = new Map();

  constructor() {
    super();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new AIProviderError(
        "ANTHROPIC_API_KEY environment variable is required",
        "missing_api_key",
        500
      );
    }

    // 使用 Vercel AI Gateway 或自定义 baseURL
    const baseURL = process.env.ANTHROPIC_BASE_URL || undefined;

    this.client = new Anthropic({
      apiKey,
      baseURL,
    });

    if (baseURL) {
      console.log("[Anthropic] Using base URL:", baseURL);
    }

    this.initializeModelInfo();
  }

  private initializeModelInfo(): void {
    this.modelInfoCache.set("claude-3-5-sonnet-20241022", {
      id: "claude-3-5-sonnet-20241022",
      name: "Claude 3.5 Sonnet",
      provider: "anthropic",
      contextWindow: 200000,
      pricing: {
        prompt: 0.003,
        completion: 0.015,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: true,
      },
    });

    this.modelInfoCache.set("claude-3-opus-20240229", {
      id: "claude-3-opus-20240229",
      name: "Claude 3 Opus",
      provider: "anthropic",
      contextWindow: 200000,
      pricing: {
        prompt: 0.015,
        completion: 0.075,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: true,
      },
    });

    this.modelInfoCache.set("claude-3-haiku-20240307", {
      id: "claude-3-haiku-20240307",
      name: "Claude 3 Haiku",
      provider: "anthropic",
      contextWindow: 200000,
      pricing: {
        prompt: 0.00025,
        completion: 0.00125,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: true,
      },
    });
  }

  getModelInfo(model: string): ModelInfo | null {
    return this.modelInfoCache.get(model) || null;
  }

  async chat(
    messages: AIMessage[],
    options?: ChatOptions
  ): Promise<AIResponse> {
    try {
      this.validateMessages(messages);
      const model = this.getValidModel(options?.model);

      // Claude要求system消息单独处理
      const systemMessage = messages.find((m) => m.role === "system");
      const conversationMessages = messages.filter((m) => m.role !== "system");

      const response = await this.client.messages.create({
        model,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature,
        top_p: options?.topP,
        system: systemMessage?.content,
        messages: conversationMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      });

      const result: AIResponse = {
        content:
          response.content[0].type === "text" ? response.content[0].text : "",
        tokens: {
          prompt: response.usage.input_tokens,
          completion: response.usage.output_tokens,
          total: response.usage.input_tokens + response.usage.output_tokens,
        },
        model: response.model,
        finish_reason: response.stop_reason,
      };

      this.logRequest(model, result.tokens.total);
      return result;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async *chatStream(
    messages: AIMessage[],
    options?: ChatOptions
  ): AsyncIterableIterator<StreamChunk> {
    try {
      this.validateMessages(messages);
      const model = this.getValidModel(options?.model);

      const systemMessage = messages.find((m) => m.role === "system");
      const conversationMessages = messages.filter((m) => m.role !== "system");

      const stream = await this.client.messages.create({
        model,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature,
        top_p: options?.topP,
        system: systemMessage?.content,
        messages: conversationMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        stream: true,
      });

      let totalContent = "";

      for await (const event of stream) {
        if (event.type === "content_block_start") {
          continue;
        }

        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            totalContent += event.delta.text;
            yield {
              content: event.delta.text,
              done: false,
            };
          }
        }

        if (event.type === "message_delta") {
          yield {
            content: "",
            done: false,
          };
        }

        if (event.type === "message_stop") {
          const tokens = this.countTokens([
            ...messages,
            { role: "assistant", content: totalContent },
          ]);

          yield {
            content: "",
            done: true,
            tokens,
            finish_reason: "stop",
          };

          this.logRequest(model, tokens);
        }
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }

  countTokens(messages: AIMessage[], model?: string): number {
    // Claude的token计数需要调用API
    // 这里使用简化估算：1 token ≈ 4字符
    return messages.reduce(
      (sum, msg) => sum + Math.ceil(msg.content.length / 4),
      0
    );
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 10,
        messages: [{ role: "user", content: "test" }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
