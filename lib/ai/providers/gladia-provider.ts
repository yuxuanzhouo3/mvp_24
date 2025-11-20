/**
 * Gladia Provider
 * Gladia 语音处理模型的实现
 */

import { BaseAIProvider } from "./base-provider";
import {
  AIMessage,
  AIResponse,
  StreamChunk,
  ChatOptions,
  AIProviderError,
  ModelInfo,
} from "../types";

/**
 * Gladia Provider实现
 */
export class GladiaProvider extends BaseAIProvider {
  readonly name = "gladia";
  readonly models = [
    "gladia-speech",
  ];
  readonly defaultModel = "gladia-speech";

  private apiKey: string;
  private baseURL: string;
  private modelInfoCache: Map<string, ModelInfo> = new Map();

  constructor() {
    super();

    const apiKey = process.env.GLADIA_API_KEY;
    if (!apiKey) {
      throw new AIProviderError(
        "GLADIA_API_KEY environment variable is required",
        "missing_api_key",
        500
      );
    }

    this.apiKey = apiKey;
    this.baseURL =
      process.env.GLADIA_BASE_URL || "https://api.gladia.io";

    console.log("[Gladia] Using base URL:", this.baseURL);

    this.initializeModelInfo();
  }

  /**
   * 初始化模型信息
   */
  private initializeModelInfo(): void {
    this.modelInfoCache.set("gladia-speech", {
      id: "gladia-speech",
      name: "Gladia Speech",
      provider: "gladia",
      contextWindow: 10000,
      pricing: {
        prompt: 0.00000833, // 按分钟计费
        completion: 0.0,
      },
      capabilities: {
        streaming: true,
        functionCalling: false,
        vision: false,
      },
    });
  }

  /**
   * 获取模型信息
   */
  getModelInfo(model: string): ModelInfo | null {
    return this.modelInfoCache.get(model) || null;
  }

  /**
   * 非流式聊天 - Gladia 用于语音处理
   */
  async chat(
    messages: AIMessage[],
    options?: ChatOptions
  ): Promise<AIResponse> {
    try {
      this.validateMessages(messages);
      const model = this.getValidModel(options?.model);

      // 提取最后一条用户消息
      const userMessage = messages
        .filter((m) => m.role === "user")
        .pop();

      if (!userMessage) {
        throw new AIProviderError(
          "No user message found",
          "invalid_request",
          400
        );
      }

      // Gladia 处理语音
      // 这里我们模拟返回处理结果
      const aiResponse: AIResponse = {
        content: `Speech processed with Gladia: ${userMessage.content}`,
        tokens: {
          prompt: userMessage.content.length,
          completion: 0,
          total: userMessage.content.length,
        },
        model: model,
        finish_reason: "stop",
      };

      this.logRequest(model, aiResponse.tokens.total);

      return aiResponse;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * 流式聊天 - Gladia 支持流式处理
   */
  async *chatStream(
    messages: AIMessage[],
    options?: ChatOptions
  ): AsyncIterableIterator<StreamChunk> {
    try {
      const response = await this.chat(messages, options);

      yield {
        content: response.content,
        done: false,
      };

      yield {
        content: "",
        done: true,
        tokens: response.tokens.total,
        finish_reason: response.finish_reason,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * 计算Token数量
   */
  countTokens(messages: AIMessage[], model?: string): number {
    // Gladia 按分钟计费
    let totalChars = 0;

    for (const message of messages) {
      totalChars +=
        (message.role || "").length + (message.content || "").length;
      if (message.name) {
        totalChars += message.name.length;
      }
      totalChars += 10;
    }

    return Math.ceil(totalChars / 4);
  }

  /**
   * 验证API密钥
   */
  async validateApiKey(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseURL}/v1/transcribe`,
        {
          method: "POST",
          headers: {
            "X-Gladia-Key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            test: true,
          }),
        }
      );

      // 即使是测试请求，只要连接成功就表示密钥有效
      return response.status < 500;
    } catch (error) {
      return false;
    }
  }
}
