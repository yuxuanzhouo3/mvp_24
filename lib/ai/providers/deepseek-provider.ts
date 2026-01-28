/**
 * DeepSeek AI Provider
 * 深度求索AI提供商实现
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

export class DeepSeekProvider extends BaseAIProvider {
  readonly name = "deepseek";
  readonly models = ["deepseek-chat", "deepseek-coder"];
  readonly defaultModel = "deepseek-chat";

  private apiKey: string;
  private baseUrl = "https://api.deepseek.com/v1";

  constructor(apiKey?: string) {
    super();
    this.apiKey = apiKey || process.env.DEEPSEEK_API_KEY || "";
    if (!this.apiKey) {
      throw new AIProviderError(
        "DeepSeek API key is required",
        "missing_api_key",
        400
      );
    }
  }

  getModelInfo(model: string): ModelInfo | null {
    const modelInfos: Record<string, ModelInfo> = {
      "deepseek-chat": {
        id: "deepseek-chat",
        name: "DeepSeek Chat",
        provider: "deepseek",
        contextWindow: 32768,
        pricing: {
          prompt: 0.000001, // $0.001 per 1K tokens
          completion: 0.000002,
        },
        capabilities: {
          streaming: true,
          functionCalling: false,
          vision: false,
        },
      },
      "deepseek-coder": {
        id: "deepseek-coder",
        name: "DeepSeek Coder",
        provider: "deepseek",
        contextWindow: 32768,
        pricing: {
          prompt: 0.000001,
          completion: 0.000002,
        },
        capabilities: {
          streaming: true,
          functionCalling: false,
          vision: false,
        },
      },
    };

    return modelInfos[model] || null;
  }

  async chat(
    messages: AIMessage[],
    options: ChatOptions = {}
  ): Promise<AIResponse> {
    this.validateMessages(messages);

    const model = this.getValidModel(options.model);
    const url = `${this.baseUrl}/chat/completions`;

    const requestBody = {
      model,
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      top_p: options.topP ?? 1,
      stream: false,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new AIProviderError(
          errorData.error?.message || `HTTP ${response.status}`,
          "api_error",
          response.status
        );
      }

      const data = await response.json();
      const choice = data.choices[0];

      if (!choice) {
        throw new AIProviderError(
          "No response from DeepSeek",
          "no_response",
          500
        );
      }

      const tokensUsed = data.usage?.total_tokens || 0;
      this.logRequest(model, tokensUsed);

      return {
        content: choice.message.content,
        tokens: {
          prompt: data.usage?.prompt_tokens || 0,
          completion: data.usage?.completion_tokens || 0,
          total: tokensUsed,
        },
        model,
        finish_reason: choice.finish_reason,
        usage: {
          cost_usd: this.calculateCost(
            data.usage?.prompt_tokens || 0,
            data.usage?.completion_tokens || 0,
            model
          ),
        },
      };
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }
      throw this.handleError(error);
    }
  }

  async *chatStream(
    messages: AIMessage[],
    options: ChatOptions = {}
  ): AsyncIterableIterator<StreamChunk> {
    this.validateMessages(messages);

    const model = this.getValidModel(options.model);
    const url = `${this.baseUrl}/chat/completions`;

    const requestBody = {
      model,
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      top_p: options.topP ?? 1,
      stream: true,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new AIProviderError(
          errorData.error?.message || `HTTP ${response.status}`,
          "api_error",
          response.status
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new AIProviderError(
          "Failed to get response reader",
          "stream_error",
          500
        );
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let totalTokens = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                // 发送完成标志
                yield {
                  content: "",
                  done: true,
                  tokens: totalTokens,
                  finish_reason: "stop",
                };
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const choice = parsed.choices?.[0];
                if (choice?.delta?.content) {
                  yield {
                    content: choice.delta.content,
                    done: false,
                    finish_reason: choice.finish_reason,
                  };
                }
                // 累计 token 使用量（如果有）
                if (parsed.usage?.total_tokens) {
                  totalTokens = parsed.usage.total_tokens;
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }

        // 流结束但没收到 [DONE]，手动发送完成标志
        yield {
          content: "",
          done: true,
          tokens: totalTokens,
          finish_reason: "stop",
        };
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }
      throw this.handleError(error);
    }
  }

  countTokens(messages: AIMessage[], model?: string): number {
    // 简化的token计数，实际应该使用tiktoken或其他库
    const totalChars = messages.reduce(
      (sum, msg) => sum + msg.content.length,
      0
    );
    // 粗略估算：1个中文字符≈1.5个token，英文≈0.3个token
    // 这里使用平均值估算
    return Math.ceil(totalChars * 0.6);
  }

  /**
   * 计算API调用的预估成本
   */
  private calculateCost(
    promptTokens: number,
    completionTokens: number,
    model: string
  ): number {
    const modelInfo = this.getModelInfo(model);
    if (!modelInfo) return 0;

    const promptCost = (promptTokens / 1000) * modelInfo.pricing.prompt;
    const completionCost =
      (completionTokens / 1000) * modelInfo.pricing.completion;

    return promptCost + completionCost;
  }
}
