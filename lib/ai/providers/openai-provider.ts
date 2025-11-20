/**
 * OpenAI Provider
 * OpenAI GPT模型的实现
 */

import OpenAI from "openai";
// import { encoding_for_model, type TiktokenModel } from 'tiktoken';
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
 * OpenAI Provider实现
 */
export class OpenAIProvider extends BaseAIProvider {
  readonly name = "openai";
  readonly models = [
    "gpt-4-turbo",
    "gpt-4-turbo-preview",
    "gpt-4",
    "gpt-4-32k",
    "gpt-3.5-turbo",
    "gpt-3.5-turbo-16k",
  ];
  readonly defaultModel = "gpt-3.5-turbo";

  private client: OpenAI;
  private modelInfoCache: Map<string, ModelInfo> = new Map();

  constructor() {
    super();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AIProviderError(
        "OPENAI_API_KEY environment variable is required",
        "missing_api_key",
        500
      );
    }

    // 使用 Vercel AI Gateway
    const baseURL =
      process.env.OPENAI_BASE_URL ||
      "https://gateway.ai.cloudflare.com/v1/openai";

    this.client = new OpenAI({
      apiKey,
      baseURL,
      organization: process.env.OPENAI_ORG_ID,
    });

    console.log("[OpenAI] Using base URL:", baseURL);

    // 初始化模型信息缓存
    this.initializeModelInfo();
  }

  /**
   * 初始化模型信息
   */
  private initializeModelInfo(): void {
    this.modelInfoCache.set("gpt-4-turbo", {
      id: "gpt-4-turbo",
      name: "GPT-4 Turbo",
      provider: "openai",
      contextWindow: 128000,
      pricing: {
        prompt: 0.01,
        completion: 0.03,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: true,
      },
    });

    this.modelInfoCache.set("gpt-4", {
      id: "gpt-4",
      name: "GPT-4",
      provider: "openai",
      contextWindow: 8192,
      pricing: {
        prompt: 0.03,
        completion: 0.06,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: false,
      },
    });

    this.modelInfoCache.set("gpt-3.5-turbo", {
      id: "gpt-3.5-turbo",
      name: "GPT-3.5 Turbo",
      provider: "openai",
      contextWindow: 16385,
      pricing: {
        prompt: 0.0005,
        completion: 0.0015,
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

      const completion = await this.client.chat.completions.create({
        model,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        frequency_penalty: options?.frequencyPenalty,
        presence_penalty: options?.presencePenalty,
        stop: options?.stop,
        user: options?.user,
      });

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

      const stream = await this.client.chat.completions.create({
        model,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        frequency_penalty: options?.frequencyPenalty,
        presence_penalty: options?.presencePenalty,
        stop: options?.stop,
        user: options?.user,
        stream: true,
      });

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
    // 这个估算比tiktoken简单但准确度稍低
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
      totalChars += 10; // 估算每条消息的格式开销
    }

    // 估算中文字符（假设30%的内容是中文）
    const chineseChars = Math.floor(totalChars * 0.3);
    const englishChars = totalChars - chineseChars;

    // 中文：1 token ≈ 1.5字符，英文：1 token ≈ 4字符
    const chineseTokens = Math.ceil(chineseChars / 1.5);
    const englishTokens = Math.ceil(englishChars / 4);

    return chineseTokens + englishTokens + 2; // +2 是对话级别的固定开销
  }

  /**
   * 验证API密钥（覆盖基类方法以提高效率）
   */
  async validateApiKey(): Promise<boolean> {
    try {
      // 使用最便宜的模型和最小的token数进行测试
      await this.client.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}
