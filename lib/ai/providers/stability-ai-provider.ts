/**
 * Stability AI Provider
 * Stability AI 图像生成模型的实现
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
 * Stability AI Provider实现
 */
export class StabilityAIProvider extends BaseAIProvider {
  readonly name = "stability";
  readonly models = [
    "stable-diffusion-xl",
    "stable-image-core",
  ];
  readonly defaultModel = "stable-diffusion-xl";

  private apiKey: string;
  private baseURL: string;
  private modelInfoCache: Map<string, ModelInfo> = new Map();

  constructor() {
    super();

    const apiKey = process.env.STABILITY_API_KEY;
    if (!apiKey) {
      throw new AIProviderError(
        "STABILITY_API_KEY environment variable is required",
        "missing_api_key",
        500
      );
    }

    this.apiKey = apiKey;
    this.baseURL =
      process.env.STABILITY_BASE_URL || "https://api.stability.ai";

    console.log("[Stability AI] Using base URL:", this.baseURL);

    this.initializeModelInfo();
  }

  /**
   * 初始化模型信息
   */
  private initializeModelInfo(): void {
    this.modelInfoCache.set("stable-diffusion-xl", {
      id: "stable-diffusion-xl",
      name: "Stable Diffusion XL",
      provider: "stability",
      contextWindow: 1000,
      pricing: {
        prompt: 0.015, // 每次请求成本
        completion: 0.0,
      },
      capabilities: {
        streaming: false,
        functionCalling: false,
        vision: false,
      },
    });

    this.modelInfoCache.set("stable-image-core", {
      id: "stable-image-core",
      name: "Stable Image Core",
      provider: "stability",
      contextWindow: 1000,
      pricing: {
        prompt: 0.02,
        completion: 0.0,
      },
      capabilities: {
        streaming: false,
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
   * 非流式聊天 - Stability AI 用于图像生成，这里返回提示信息
   */
  async chat(
    messages: AIMessage[],
    options?: ChatOptions
  ): Promise<AIResponse> {
    try {
      this.validateMessages(messages);
      const model = this.getValidModel(options?.model);

      // 提取最后一条用户消息作为图像生成提示
      const userMessage = messages
        .filter((m) => m.role === "user")
        .pop();

      if (!userMessage) {
        throw new AIProviderError(
          "No user message found for image generation",
          "invalid_request",
          400
        );
      }

      // 调用 Stability AI 图像生成 API
      const response = await fetch(
        `${this.baseURL}/v2beta/stable-image/generate/core`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            prompt: userMessage.content,
            output_format: "jpeg",
            model: model,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        throw new AIProviderError(
          `Stability AI API error: ${response.status} ${errorData}`,
          "api_error",
          response.status
        );
      }

      // 返回成功响应
      const aiResponse: AIResponse = {
        content: `Image generated successfully with prompt: "${userMessage.content}"`,
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
   * 流式聊天 - Stability AI 不支持流式，返回一次性响应
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
    // Stability AI 按请求计费，而不是按token计费
    // 这里返回消息长度作为估算
    let totalChars = 0;

    for (const message of messages) {
      totalChars +=
        (message.role || "").length + (message.content || "").length;
      if (message.name) {
        totalChars += message.name.length;
      }
      totalChars += 10;
    }

    // 简单估算
    return Math.ceil(totalChars / 4);
  }

  /**
   * 验证API密钥
   */
  async validateApiKey(): Promise<boolean> {
    try {
      // 测试API调用
      const response = await fetch(
        `${this.baseURL}/v1/engines/list`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      return response.ok;
    } catch (error) {
      return false;
    }
  }
}
