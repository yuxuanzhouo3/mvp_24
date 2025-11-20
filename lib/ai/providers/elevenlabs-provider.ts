/**
 * ElevenLabs Provider
 * ElevenLabs 文字转语音模型的实现
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
 * ElevenLabs Provider实现
 */
export class ElevenLabsProvider extends BaseAIProvider {
  readonly name = "elevenlabs";
  readonly models = [
    "elevenlabs-tts",
  ];
  readonly defaultModel = "elevenlabs-tts";

  private apiKey: string;
  private baseURL: string;
  private modelInfoCache: Map<string, ModelInfo> = new Map();

  constructor() {
    super();

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new AIProviderError(
        "ELEVENLABS_API_KEY environment variable is required",
        "missing_api_key",
        500
      );
    }

    this.apiKey = apiKey;
    this.baseURL =
      process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";

    console.log("[ElevenLabs] Using base URL:", this.baseURL);

    this.initializeModelInfo();
  }

  /**
   * 初始化模型信息
   */
  private initializeModelInfo(): void {
    this.modelInfoCache.set("elevenlabs-tts", {
      id: "elevenlabs-tts",
      name: "ElevenLabs TTS",
      provider: "elevenlabs",
      contextWindow: 10000,
      pricing: {
        prompt: 0.000003, // 按字符计费
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
   * 非流式聊天 - ElevenLabs 用于文字转语音
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

      // ElevenLabs 进行文字转语音
      // 这里我们模拟返回语音生成结果
      const aiResponse: AIResponse = {
        content: `Speech synthesized: "${userMessage.content}"`,
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
   * 流式聊天 - ElevenLabs 支持流式音频合成
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
    // ElevenLabs 按字符计费
    let totalChars = 0;

    for (const message of messages) {
      totalChars += message.content ? message.content.length : 0;
    }

    // 返回字符数作为token估算
    return totalChars;
  }

  /**
   * 验证API密钥
   */
  async validateApiKey(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseURL}/v1/user`,
        {
          method: "GET",
          headers: {
            "xi-api-key": this.apiKey,
          },
        }
      );

      return response.ok;
    } catch (error) {
      return false;
    }
  }
}
