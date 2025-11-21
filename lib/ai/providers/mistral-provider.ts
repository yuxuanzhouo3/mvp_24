/**
 * Mistral AI Provider
 * Mistral 文本AI模型的实现
 * 兼容OpenAI SDK
 */

import OpenAI from "openai";
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
 * Mistral Provider实现
 */
export class MistralProvider extends BaseAIProvider {
  readonly name = "mistral";
  readonly models = [
    "mistral-tiny",
    "codestral-latest",
    "codestral-2412",
    "devstral-small-latest",
    "devstral-medium-latest",
  ];
  readonly defaultModel = "mistral-tiny";

  private client: OpenAI;
  private modelInfoCache: Map<string, ModelInfo> = new Map();

  constructor() {
    super();

    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new AIProviderError(
        "MISTRAL_API_KEY environment variable is required",
        "missing_api_key",
        500
      );
    }

    // Mistral API 完全兼容OpenAI SDK
    const baseURL =
      process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1";

    this.client = new OpenAI({
      apiKey,
      baseURL,
    });

    console.log("[Mistral] Using base URL:", baseURL);

    // 初始化模型信息缓存
    this.initializeModelInfo();
  }

  /**
   * 初始化模型信息
   */
  private initializeModelInfo(): void {
    this.modelInfoCache.set("mistral-tiny", {
      id: "mistral-tiny",
      name: "Mistral Tiny",
      provider: "mistral",
      contextWindow: 8000,
      pricing: {
        prompt: 0.00001, // $0.01 per 1M tokens
        completion: 0.00003, // $0.03 per 1M tokens
      },
      capabilities: {
        streaming: true,
        functionCalling: false,
        vision: false,
      },
    });

    this.modelInfoCache.set("codestral-latest", {
      id: "codestral-latest",
      name: "Codestral Latest",
      provider: "mistral",
      contextWindow: 16000,
      pricing: {
        prompt: 0.0001, // $0.10 per 1M tokens
        completion: 0.0003, // $0.30 per 1M tokens
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: false,
      },
    });

    this.modelInfoCache.set("codestral-2412", {
      id: "codestral-2412",
      name: "Codestral 2412",
      provider: "mistral",
      contextWindow: 16000,
      pricing: {
        prompt: 0.0001, // $0.10 per 1M tokens
        completion: 0.0003, // $0.30 per 1M tokens
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: false,
      },
    });

    this.modelInfoCache.set("devstral-small-latest", {
      id: "devstral-small-latest",
      name: "Devstral Small Latest",
      provider: "mistral",
      contextWindow: 12000,
      pricing: {
        prompt: 0.00005, // $0.05 per 1M tokens
        completion: 0.00015, // $0.15 per 1M tokens
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: false,
      },
    });

    this.modelInfoCache.set("devstral-medium-latest", {
      id: "devstral-medium-latest",
      name: "Devstral Medium Latest",
      provider: "mistral",
      contextWindow: 20000,
      pricing: {
        prompt: 0.0001, // $0.10 per 1M tokens
        completion: 0.0003, // $0.30 per 1M tokens
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
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
   * 非流式聊天
   */
  async chat(
    messages: AIMessage[],
    options?: ChatOptions
  ): Promise<AIResponse> {
    try {
      this.validateMessages(messages);

      const model = this.getValidModel(options?.model);

      // Mistral API 只支持这些参数，严格按照测试代码的方式构建请求
      const requestParams: any = {
        model,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      };

      // 只添加 Mistral 支持的参数
      // max_tokens - 必须是正整数
      if (options?.maxTokens !== undefined && options?.maxTokens !== null) {
        const tokens = Math.floor(Number(options.maxTokens));
        if (!isNaN(tokens) && tokens > 0) {
          requestParams.max_tokens = tokens;
        }
      }

      // temperature - 可选，0-2 范围
      if (options?.temperature !== undefined && options?.temperature !== null) {
        const temp = Number(options.temperature);
        if (!isNaN(temp) && temp >= 0 && temp <= 2) {
          requestParams.temperature = temp;
        }
      }

      // top_p - 可选，0-1 范围
      if (options?.topP !== undefined && options?.topP !== null) {
        const topP = Number(options.topP);
        if (!isNaN(topP) && topP >= 0 && topP <= 1) {
          requestParams.top_p = topP;
        }
      }

      console.log("[Mistral] Chat request:", {
        model,
        hasMessages: Array.isArray(requestParams.messages),
        messageCount: requestParams.messages?.length,
        maxTokens: requestParams.max_tokens,
        temperature: requestParams.temperature,
      });

      const completion = await this.client.chat.completions.create(requestParams);

      const choice = completion.choices[0];
      if (!choice?.message?.content) {
        throw new AIProviderError(
          "No content in response",
          "empty_response",
          500
        );
      }

      const response: AIResponse = {
        content: choice.message.content,
        tokens: {
          prompt: completion.usage?.prompt_tokens || 0,
          completion: completion.usage?.completion_tokens || 0,
          total: completion.usage?.total_tokens || 0,
        },
        model: completion.model,
        finish_reason: choice.finish_reason,
      };

      // 记录日志
      this.logRequest(model, response.tokens.total);

      return response;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * 流式聊天
   */
  async *chatStream(
    messages: AIMessage[],
    options?: ChatOptions
  ): AsyncIterableIterator<StreamChunk> {
    try {
      this.validateMessages(messages);

      const model = this.getValidModel(options?.model);

      // Mistral API 只支持这些参数，严格按照测试代码的方式构建请求
      const requestParams: any = {
        model,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
        stream: true,
      };

      // 只添加 Mistral 支持的参数
      // max_tokens - 必须是正整数
      if (options?.maxTokens !== undefined && options?.maxTokens !== null) {
        const tokens = Math.floor(Number(options.maxTokens));
        if (!isNaN(tokens) && tokens > 0) {
          requestParams.max_tokens = tokens;
        }
      }

      // temperature - 可选，0-2 范围
      if (options?.temperature !== undefined && options?.temperature !== null) {
        const temp = Number(options.temperature);
        if (!isNaN(temp) && temp >= 0 && temp <= 2) {
          requestParams.temperature = temp;
        }
      }

      // top_p - 可选，0-1 范围
      if (options?.topP !== undefined && options?.topP !== null) {
        const topP = Number(options.topP);
        if (!isNaN(topP) && topP >= 0 && topP <= 1) {
          requestParams.top_p = topP;
        }
      }

      console.log("[Mistral] Stream request:", {
        model,
        hasMessages: Array.isArray(requestParams.messages),
        messageCount: requestParams.messages?.length,
        maxTokens: requestParams.max_tokens,
        temperature: requestParams.temperature,
      });

      // @ts-ignore - OpenAI SDK stream type handling
      const stream = (await this.client.chat.completions.create(
        requestParams
      )) as any;

      let totalContent = "";

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        const content = delta?.content || "";
        const finishReason = chunk.choices[0]?.finish_reason;

        totalContent += content;

        yield {
          content,
          done: finishReason !== null,
          finish_reason: finishReason,
        };

        // 如果流结束，计算并返回token数
        if (finishReason) {
          const tokens = this.countTokens([
            ...messages,
            { role: "assistant", content: totalContent },
          ]);

          yield {
            content: "",
            done: true,
            tokens,
            finish_reason: finishReason,
          };

          this.logRequest(model, tokens);
        }
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * 计算Token数量
   */
  countTokens(messages: AIMessage[], model?: string): number {
    // 使用简单估算：1 token ≈ 4字符（英文），中文1 token ≈ 1.5字符
    let totalChars = 0;

    for (const message of messages) {
      // 加上role和content的长度
      totalChars +=
        (message.role || "").length + (message.content || "").length;

      // 如果有name，加上name长度
      if (message.name) {
        totalChars += message.name.length;
      }

      // 每条消息的固定开销（估算）
      totalChars += 10;
    }

    // 估算中文字符（假设30%的内容是中文）
    const chineseChars = Math.floor(totalChars * 0.3);
    const englishChars = totalChars - chineseChars;

    // 中文：1 token ≈ 1.5字符，英文：1 token ≈ 4字符
    const chineseTokens = Math.ceil(chineseChars / 1.5);
    const englishTokens = Math.ceil(englishChars / 4);

    return chineseTokens + englishTokens + 2;
  }

  /**
   * 验证API密钥
   */
  async validateApiKey(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: "mistral-tiny",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}
