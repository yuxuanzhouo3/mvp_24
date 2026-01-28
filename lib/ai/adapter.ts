/**
 * AI 服务适配器
 *
 * 根据 DEPLOY_REGION 环境变量选择使用哪个 AI 服务提供商：
 * - CN（中国）：使用 DeepSeek API
 * - INTL（国际）：使用 Vercel AI Gateway
 */

import { isChinaRegion, RegionConfig } from "@/lib/config/region";

/**
 * AI 消息接口
 */
export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * AI 响应接口
 */
export interface AIResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * AI 流式响应接口
 */
export interface AIStreamResponse {
  stream: ReadableStream;
  model: string;
}

/**
 * AI 适配器接口
 */
export interface AIAdapter {
  /**
   * 发送聊天消息（非流式）
   * @param messages 消息历史
   * @param model 模型名称
   * @returns AI 响应
   */
  chat(messages: AIMessage[], model?: string): Promise<AIResponse>;

  /**
   * 发送聊天消息（流式）
   * @param messages 消息历史
   * @param model 模型名称
   * @returns 流式响应
   */
  chatStream(messages: AIMessage[], model?: string): Promise<AIStreamResponse>;

  /**
   * 获取可用模型列表
   */
  getAvailableModels(): string[];

  /**
   * 获取默认模型
   */
  getDefaultModel(): string;
}

/**
 * Vercel AI Gateway 适配器（国际版）
 */
class VercelAIGatewayAdapter implements AIAdapter {
  private apiKey: string;
  private baseUrl: string = "https://gateway.ai.cloudflare.com/v1";

  constructor() {
    this.apiKey = process.env.AI_GATEWAY_API_KEY || "";
  }

  async chat(
    messages: AIMessage[],
    model: string = "openai/gpt-4o-mini"
  ): Promise<AIResponse> {
    const response = await fetch(
      "https://ai-gateway.vercel.sh/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          stream: false,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Vercel AI Gateway error: ${response.status}`);
    }

    const data = await response.json();

    return {
      content: data.choices[0]?.message?.content || "",
      model: data.model,
      usage: data.usage,
    };
  }

  async chatStream(
    messages: AIMessage[],
    model: string = "openai/gpt-4o-mini"
  ): Promise<AIStreamResponse> {
    const response = await fetch(
      "https://ai-gateway.vercel.sh/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Vercel AI Gateway error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("响应体为空");
    }

    return {
      stream: response.body,
      model,
    };
  }

  getAvailableModels(): string[] {
    return [
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "anthropic/claude-sonnet-4",
      "anthropic/claude-opus-4",
      "google/gemini-2.0-flash",
    ];
  }

  getDefaultModel(): string {
    return "openai/gpt-4o-mini";
  }
}

/**
 * DeepSeek 适配器（中国版）
 */
class DeepSeekAdapter implements AIAdapter {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || "";
    this.baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  }

  async chat(
    messages: AIMessage[],
    model: string = "deepseek-chat"
  ): Promise<AIResponse> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      content: data.choices[0]?.message?.content || "",
      model: data.model,
      usage: data.usage,
    };
  }

  async chatStream(
    messages: AIMessage[],
    model: string = "deepseek-chat"
  ): Promise<AIStreamResponse> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("响应体为空");
    }

    return {
      stream: response.body,
      model,
    };
  }

  getAvailableModels(): string[] {
    return ["deepseek-chat", "deepseek-coder"];
  }

  getDefaultModel(): string {
    return "deepseek-chat";
  }
}

/**
 * 创建 AI 适配器实例
 * 根据 DEPLOY_REGION 环境变量自动选择
 */
export function createAIAdapter(): AIAdapter {
  if (isChinaRegion()) {
    console.log("🤖 使用 DeepSeek AI（中国版）");
    return new DeepSeekAdapter();
  } else {
    console.log("🤖 使用 Vercel AI Gateway（国际版）");
    return new VercelAIGatewayAdapter();
  }
}

/**
 * 全局 AI 实例（单例模式）
 */
let aiInstance: AIAdapter | null = null;

/**
 * 获取 AI 实例
 */
export function getAI(): AIAdapter {
  if (!aiInstance) {
    aiInstance = createAIAdapter();
  }
  return aiInstance;
}

/**
 * 获取可用模型列表
 */
export function getAvailableModels(): string[] {
  return RegionConfig.ai.availableModels;
}

/**
 * 获取默认模型
 */
export function getDefaultAIModel(): string {
  if (isChinaRegion()) {
    return "deepseek-chat";
  } else {
    return "openai/gpt-4o-mini";
  }
}

/**
 * 格式化模型名称显示
 */
export function formatModelName(model: string): string {
  const modelMap: Record<string, string> = {
    "openai/gpt-4o": "GPT-4o",
    "openai/gpt-4o-mini": "GPT-4o Mini",
    "anthropic/claude-sonnet-4": "Claude Sonnet 4",
    "anthropic/claude-opus-4": "Claude Opus 4",
    "google/gemini-2.0-flash": "Gemini 2.0 Flash",
    "deepseek-chat": "DeepSeek Chat",
    "deepseek-coder": "DeepSeek Coder",
  };

  return modelMap[model] || model;
}
