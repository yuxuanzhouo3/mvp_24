/**
 * AssemblyAI Provider
 * AssemblyAI 语音转文字模型的实现
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
 * AssemblyAI Provider实现
 */
export class AssemblyAIProvider extends BaseAIProvider {
  readonly name = "assemblyai";
  readonly models = [
    "assemblyai-transcriber",
  ];
  readonly defaultModel = "assemblyai-transcriber";

  private apiKey: string;
  private baseURL: string;
  private modelInfoCache: Map<string, ModelInfo> = new Map();

  constructor() {
    super();

    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
      throw new AIProviderError(
        "ASSEMBLYAI_API_KEY environment variable is required",
        "missing_api_key",
        500
      );
    }

    this.apiKey = apiKey;
    this.baseURL =
      process.env.ASSEMBLYAI_BASE_URL || "https://api.assemblyai.com";

    console.log("[AssemblyAI] Using base URL:", this.baseURL);

    this.initializeModelInfo();
  }

  /**
   * 初始化模型信息
   */
  private initializeModelInfo(): void {
    this.modelInfoCache.set("assemblyai-transcriber", {
      id: "assemblyai-transcriber",
      name: "AssemblyAI Transcriber",
      provider: "assemblyai",
      contextWindow: 10000,
      pricing: {
        prompt: 0.0000025, // 按分钟计费
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
   * 非流式聊天 - AssemblyAI 用于语音转文字
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

      // AssemblyAI 处理音频转文字
      // 这里我们模拟返回转录结果
      const aiResponse: AIResponse = {
        content: `Transcription processed: ${userMessage.content}`,
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
   * 流式聊天 - AssemblyAI 支持流式转录
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
    // AssemblyAI 按分钟计费
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
        `${this.baseURL}/v2/account`,
        {
          method: "GET",
          headers: {
            Authorization: this.apiKey,
          },
        }
      );

      return response.ok;
    } catch (error) {
      return false;
    }
  }
}
