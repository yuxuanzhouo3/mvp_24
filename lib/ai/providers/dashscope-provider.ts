/**
 * DashScope (阿里云通义千问) Provider
 * 使用 OpenAI SDK 兼容模式
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
 * DashScope Provider 实现
 * 支持阿里云通义千问系列模型
 */
export class DashScopeProvider extends BaseAIProvider {
  readonly name = "dashscope";
  readonly models = [
    "qwen3-max",
    "qwen3-30b-a3b-instruct-2507",
    "qwen-plus",
    "qwen-flash",
    "qwen-max",
    "deepseek-v3.1",
    "kimi-k2-thinking",
    "qwen2.5-7b-instruct-1m",
    "qwen-turbo",
    "qwq-32b-preview",
    "qwen2-72b-instruct",
    "qwen1.5-110b-chat",
  ];
  readonly defaultModel = "qwen-plus";

  private client: OpenAI;
  private modelInfoCache: Map<string, ModelInfo> = new Map();

  constructor() {
    super();

    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new AIProviderError(
        "DASHSCOPE_API_KEY environment variable is required",
        "missing_api_key",
        500
      );
    }

    // 使用阿里云 DashScope 兼容模式
    const baseURL =
      process.env.DASHSCOPE_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1";

    this.client = new OpenAI({
      apiKey,
      baseURL,
    });

    console.log("[DashScope] Using base URL:", baseURL);

    // 初始化模型信息缓存
    this.initializeModelInfo();
  }

  /**
   * 初始化模型信息
   */
  private initializeModelInfo(): void {
    // 旗舰模型
    this.modelInfoCache.set("qwen3-max", {
      id: "qwen3-max",
      name: "通义千问 3 Max",
      provider: "dashscope",
      contextWindow: 32768,
      pricing: {
        prompt: 0.00004, // ¥0.04/千tokens
        completion: 0.00004,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: false,
      },
    });

    this.modelInfoCache.set("qwen-max", {
      id: "qwen-max",
      name: "通义千问 Max",
      provider: "dashscope",
      contextWindow: 32768,
      pricing: {
        prompt: 0.00004,
        completion: 0.00012,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: false,
      },
    });

    // 平衡模型
    this.modelInfoCache.set("qwen-plus", {
      id: "qwen-plus",
      name: "通义千问 Plus",
      provider: "dashscope",
      contextWindow: 32768,
      pricing: {
        prompt: 0.000008, // ¥0.008/千tokens
        completion: 0.000008,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: false,
      },
    });

    this.modelInfoCache.set("qwen3-30b-a3b-instruct-2507", {
      id: "qwen3-30b-a3b-instruct-2507",
      name: "通义千问 3-30B",
      provider: "dashscope",
      contextWindow: 32768,
      pricing: {
        prompt: 0.00001,
        completion: 0.00001,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: false,
      },
    });

    this.modelInfoCache.set("qwen2-72b-instruct", {
      id: "qwen2-72b-instruct",
      name: "通义千问 2-72B",
      provider: "dashscope",
      contextWindow: 32768,
      pricing: {
        prompt: 0.000008,
        completion: 0.000008,
      },
      capabilities: {
        streaming: true,
        functionCalling: false,
        vision: false,
      },
    });

    // 快速模型
    this.modelInfoCache.set("qwen-flash", {
      id: "qwen-flash",
      name: "通义千问 Flash",
      provider: "dashscope",
      contextWindow: 8192,
      pricing: {
        prompt: 0.000001, // ¥0.001/千tokens
        completion: 0.000001,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: false,
      },
    });

    this.modelInfoCache.set("qwen-turbo", {
      id: "qwen-turbo",
      name: "通义千问 Turbo",
      provider: "dashscope",
      contextWindow: 8192,
      pricing: {
        prompt: 0.000002,
        completion: 0.000006,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: false,
      },
    });

    // 特殊模型
    this.modelInfoCache.set("qwen2.5-7b-instruct-1m", {
      id: "qwen2.5-7b-instruct-1m",
      name: "通义千问 2.5-7B-1M",
      provider: "dashscope",
      contextWindow: 1000000, // 百万上下文
      pricing: {
        prompt: 0.000001,
        completion: 0.000001,
      },
      capabilities: {
        streaming: true,
        functionCalling: false,
        vision: false,
      },
    });

    this.modelInfoCache.set("deepseek-v3.1", {
      id: "deepseek-v3.1",
      name: "DeepSeek V3.1",
      provider: "dashscope",
      contextWindow: 65536,
      pricing: {
        prompt: 0.000001,
        completion: 0.000002,
      },
      capabilities: {
        streaming: true,
        functionCalling: false,
        vision: false,
      },
    });

    this.modelInfoCache.set("kimi-k2-thinking", {
      id: "kimi-k2-thinking",
      name: "Kimi K2 Thinking",
      provider: "dashscope",
      contextWindow: 128000,
      pricing: {
        prompt: 0.00001,
        completion: 0.00001,
      },
      capabilities: {
        streaming: true,
        functionCalling: false,
        vision: false,
      },
    });

    this.modelInfoCache.set("qwq-32b-preview", {
      id: "qwq-32b-preview",
      name: "QwQ-32B Preview",
      provider: "dashscope",
      contextWindow: 32768,
      pricing: {
        prompt: 0.000005,
        completion: 0.000005,
      },
      capabilities: {
        streaming: true,
        functionCalling: false,
        vision: false,
      },
    });

    this.modelInfoCache.set("qwen1.5-110b-chat", {
      id: "qwen1.5-110b-chat",
      name: "通义千问 1.5-110B",
      provider: "dashscope",
      contextWindow: 32768,
      pricing: {
        prompt: 0.000008,
        completion: 0.000008,
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
   * 使用简单估算：中文 1 token ≈ 1.5字符，英文 1 token ≈ 4字符
   */
  countTokens(messages: AIMessage[], model?: string): number {
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

    // 估算中文字符（假设50%的内容是中文，通义千问主要用于中文）
    const chineseChars = Math.floor(totalChars * 0.5);
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
      // 使用最便宜最快的模型进行测试
      await this.client.chat.completions.create({
        model: "qwen-turbo",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}
