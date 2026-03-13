/**
 * Base AI Provider
 * 所有AI提供商的抽象基类
 */

import {
  AIMessage,
  AIResponse,
  StreamChunk,
  ChatOptions,
  AIProviderError,
  ModelInfo,
} from '../types';
import { isChinaRegion } from "@/lib/config/region";

/**
 * 抽象AI Provider基类
 * 所有具体的Provider（OpenAI, Anthropic等）都必须继承此类
 */
export abstract class BaseAIProvider {
  /**
   * Provider名称（如 'openai', 'anthropic'）
   */
  abstract readonly name: string;

  /**
   * 支持的模型列表
   */
  abstract readonly models: string[];

  /**
   * 默认模型
   */
  abstract readonly defaultModel: string;

  /**
   * 获取模型信息
   */
  abstract getModelInfo(model: string): ModelInfo | null;

  /**
   * 非流式聊天完成
   * @param messages 消息历史
   * @param options 聊天选项
   * @returns AI响应
   */
  abstract chat(
    messages: AIMessage[],
    options?: ChatOptions
  ): Promise<AIResponse>;

  /**
   * 流式聊天完成
   * @param messages 消息历史
   * @param options 聊天选项
   * @returns 异步迭代器，返回流式响应块
   */
  abstract chatStream(
    messages: AIMessage[],
    options?: ChatOptions
  ): AsyncIterableIterator<StreamChunk>;

  /**
   * 计算消息的token数量
   * @param messages 消息列表
   * @param model 可选：指定模型
   * @returns token数量
   */
  abstract countTokens(messages: AIMessage[], model?: string): number;

  /**
   * 验证API密钥是否有效
   * @returns 是否有效
   */
  async validateApiKey(): Promise<boolean> {
    try {
      // 发送一个简单的测试请求
      await this.chat([{ role: 'user', content: 'test' }], {
        maxTokens: 5,
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 标准化错误处理
   * @param error 原始错误
   * @returns 标准化的AIProviderError
   */
  protected handleError(error: unknown): AIProviderError {
    if (error instanceof AIProviderError) {
      return error;
    }

    if (error instanceof Error) {
      const providerError = error as Error & {
        status?: number;
        statusCode?: number;
        code?: string;
        type?: string;
        error?: {
          code?: string;
          type?: string;
          message?: string;
        };
      };

      const rawMessage = String(
        providerError.error?.message || providerError.message || ""
      );
      const message = rawMessage.toLowerCase();
      const rawCode = String(
        providerError.error?.code || providerError.code || ""
      ).toLowerCase();
      const statusCode =
        typeof providerError.status === "number"
          ? providerError.status
          : typeof providerError.statusCode === "number"
            ? providerError.statusCode
            : undefined;

      if (
        rawCode === "modelnotopen" ||
        message.includes("has not activated the model") ||
        message.includes("activate the model service")
      ) {
        return new AIProviderError(
          isChinaRegion()
            ? "当前账号尚未开通这个模型，请先到火山方舟控制台开通后再试，或切换到已开通的模型。"
            : "This model is not activated for your account. Please enable it in the provider console or switch to another model.",
          "model_not_activated",
          403,
          error
        );
      }

      if (message.includes("not available in your region")) {
        return new AIProviderError(
          isChinaRegion()
            ? "该模型在当前地区不可用，请切换其他模型。"
            : "This model is not available in your region. Please switch to another model.",
          "region_not_supported",
          403,
          error
        );
      }

      if (message.includes('api key') || message.includes('unauthorized')) {
        return new AIProviderError(
          'Invalid API key',
          'invalid_api_key',
          401,
          error
        );
      }

      if (message.includes('rate limit') || message.includes('too many')) {
        return new AIProviderError(
          'Rate limit exceeded',
          'rate_limit_exceeded',
          429,
          error
        );
      }

      if (message.includes('timeout') || message.includes('timed out')) {
        return new AIProviderError(
          'Request timeout',
          'timeout',
          408,
          error
        );
      }

      if (message.includes('quota') || message.includes('insufficient')) {
        return new AIProviderError(
          'Quota exceeded or insufficient credits',
          'quota_exceeded',
          429,
          error
        );
      }

      if (message.includes('context') || message.includes('too long')) {
        return new AIProviderError(
          'Message too long or context window exceeded',
          'context_length_exceeded',
          400,
          error
        );
      }

      if (message.includes('not found') || message.includes('404')) {
        return new AIProviderError(
          'Model not found or not supported. Please check the model name.',
          'model_not_found',
          statusCode || 404,
          error
        );
      }

      return new AIProviderError(
        rawMessage || error.message,
        'provider_error',
        statusCode || 500,
        error
      );
    }

    return new AIProviderError(
      'Unknown error occurred',
      'unknown_error',
      500,
      error
    );
  }

  /**
   * 验证消息格式
   * @param messages 消息列表
   * @throws AIProviderError 如果消息格式无效
   */
  protected validateMessages(messages: AIMessage[]): void {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new AIProviderError(
        'Messages must be a non-empty array',
        'invalid_messages',
        400
      );
    }

    for (const message of messages) {
      if (!message.role || !['system', 'user', 'assistant'].includes(message.role)) {
        throw new AIProviderError(
          `Invalid message role: ${message.role}`,
          'invalid_message_role',
          400
        );
      }

      if (typeof message.content !== 'string') {
        throw new AIProviderError(
          'Message content must be a string',
          'invalid_message_content',
          400
        );
      }
    }
  }

  /**
   * 验证并返回模型名称
   * @param model 可选的模型名称
   * @returns 有效的模型名称
   */
  protected getValidModel(model?: string): string {
    const targetModel = model || this.defaultModel;

    if (!this.models.includes(targetModel)) {
      throw new AIProviderError(
        `Model "${targetModel}" is not supported by ${this.name}`,
        'invalid_model',
        400
      );
    }

    return targetModel;
  }

  /**
   * 记录请求日志（可被子类覆盖）
   * @param model 模型名称
   * @param tokensUsed token使用量
   */
  protected logRequest(model: string, tokensUsed: number): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${this.name}] Model: ${model}, Tokens: ${tokensUsed}`);
    }
  }
}
