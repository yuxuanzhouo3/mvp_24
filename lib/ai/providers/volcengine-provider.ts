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

const VOLCENGINE_MODELS = [
  "doubao-seed-2-0-pro-260215",
  "doubao-seed-2-0-lite-260215",
  "doubao-seed-2-0-mini-260215",
  "doubao-seed-2-0-code-preview-260215",
] as const;

const VOLCENGINE_BASE_URL =
  process.env.VOLCENGINE_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";

type VolcengineModelKey = (typeof VOLCENGINE_MODELS)[number];

type VolcengineModelPricing = {
  prompt: number;
  completion: number;
  contextWindow: number;
  vision: boolean;
  functionCalling: boolean;
  displayName: string;
};

const MODEL_INFO: Record<VolcengineModelKey, VolcengineModelPricing> = {
  "doubao-seed-2-0-pro-260215": {
    displayName: "Doubao Seed 2.0 Pro",
    prompt: 0.0032,
    completion: 0.016,
    contextWindow: 128000,
    vision: false,
    functionCalling: true,
  },
  "doubao-seed-2-0-lite-260215": {
    displayName: "Doubao Seed 2.0 Lite",
    prompt: 0.0006,
    completion: 0.0036,
    contextWindow: 128000,
    vision: false,
    functionCalling: true,
  },
  "doubao-seed-2-0-mini-260215": {
    displayName: "Doubao Seed 2.0 Mini",
    prompt: 0.0002,
    completion: 0.002,
    contextWindow: 128000,
    vision: true,
    functionCalling: true,
  },
  "doubao-seed-2-0-code-preview-260215": {
    displayName: "Doubao Seed 2.0 Code",
    prompt: 0.0032,
    completion: 0.016,
    contextWindow: 128000,
    vision: false,
    functionCalling: true,
  },
};

export class VolcengineProvider extends BaseAIProvider {
  readonly name = "volcengine";
  readonly models = [...VOLCENGINE_MODELS];
  readonly defaultModel = "doubao-seed-2-0-lite-260215";

  private client: OpenAI;
  private modelInfoCache = new Map<string, ModelInfo>();

  constructor() {
    super();

    const apiKey = process.env.VOLCENGINE_API_KEY;
    if (!apiKey) {
      throw new AIProviderError(
        "VOLCENGINE_API_KEY environment variable is required",
        "missing_api_key",
        500
      );
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: VOLCENGINE_BASE_URL,
    });

    this.initializeModelInfo();
  }

  private initializeModelInfo() {
    for (const model of VOLCENGINE_MODELS) {
      const item = MODEL_INFO[model];
      this.modelInfoCache.set(model, {
        id: model,
        name: item.displayName,
        provider: this.name,
        contextWindow: item.contextWindow,
        pricing: {
          prompt: item.prompt,
          completion: item.completion,
        },
        capabilities: {
          streaming: true,
          functionCalling: item.functionCalling,
          vision: item.vision,
        },
      });
    }
  }

  getModelInfo(model: string): ModelInfo | null {
    return this.modelInfoCache.get(model) || null;
  }

  async chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse> {
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
        throw new AIProviderError("No content in response", "empty_response", 500);
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

      this.logRequest(model, response.tokens.total);
      return response;
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
        stream_options: { include_usage: true },
      });

      let totalContent = "";
      let promptTokens = 0;
      let completionTokens = 0;
      let usageTotalTokens = 0;
      let finishReason: string | null = null;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        const content = delta?.content || "";
        const chunkFinishReason = chunk.choices[0]?.finish_reason;
        const chunkPromptTokens = chunk.usage?.prompt_tokens;
        const chunkCompletionTokens = chunk.usage?.completion_tokens;
        const chunkUsageTotalTokens = chunk.usage?.total_tokens;

        if (chunkFinishReason !== null && chunkFinishReason !== undefined) {
          finishReason = chunkFinishReason;
        }
        if (typeof chunkPromptTokens === "number" && chunkPromptTokens >= 0) {
          promptTokens = chunkPromptTokens;
        }
        if (typeof chunkCompletionTokens === "number" && chunkCompletionTokens >= 0) {
          completionTokens = chunkCompletionTokens;
        }
        if (typeof chunkUsageTotalTokens === "number" && chunkUsageTotalTokens > 0) {
          usageTotalTokens = chunkUsageTotalTokens;
        }

        totalContent += content;

        if (content) {
          yield {
            content,
            done: false,
            finish_reason: finishReason ?? chunkFinishReason,
          };
        }
      }

      const estimatedTokens = this.countTokens([
        ...messages,
        { role: "assistant", content: totalContent },
      ]);
      const tokens = usageTotalTokens > 0 ? usageTotalTokens : estimatedTokens;

      yield {
        content: "",
        done: true,
        tokens,
        usage: {
          prompt: promptTokens || undefined,
          completion: completionTokens || undefined,
          total: tokens,
          source: usageTotalTokens > 0 ? "provider" : "estimated",
        },
        finish_reason: finishReason || "stop",
      };

      this.logRequest(model, tokens);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  countTokens(messages: AIMessage[]): number {
    let totalChars = 0;

    for (const message of messages) {
      totalChars += (message.role || "").length + (message.content || "").length;
      if (message.name) {
        totalChars += message.name.length;
      }
      totalChars += 10;
    }

    const chineseChars = Math.floor(totalChars * 0.5);
    const englishChars = totalChars - chineseChars;
    const chineseTokens = Math.ceil(chineseChars / 1.5);
    const englishTokens = Math.ceil(englishChars / 4);
    return chineseTokens + englishTokens + 2;
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      });
      return true;
    } catch {
      return false;
    }
  }
}
