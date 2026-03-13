/**
 * AI 服务适配器
 * - CN（中国）：使用 DeepSeek API
 * - INTL（国际）：使用 OpenRouter API
 */

import { isChinaRegion, RegionConfig } from "@/lib/config/region";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIStreamResponse {
  stream: ReadableStream;
  model: string;
}

export interface AIAdapter {
  chat(messages: AIMessage[], model?: string): Promise<AIResponse>;
  chatStream(messages: AIMessage[], model?: string): Promise<AIStreamResponse>;
  getAvailableModels(): string[];
  getDefaultModel(): string;
}

class OpenRouterAdapter implements AIAdapter {
  private apiKey: string;
  private baseUrl = "https://openrouter.ai/api/v1";

  constructor() {
    this.apiKey = process.env.OPENROUTER_API || "";
  }

  private buildHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000",
      "X-Title": process.env.APP_NAME || "MultiGPT",
    };
  }

  async chat(messages: AIMessage[], model = "openai/gpt-4o-mini"): Promise<AIResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({ model, messages, stream: false }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error: ${response.status}`);
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || "",
      model: data.model || model,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  }

  async chatStream(messages: AIMessage[], model = "openai/gpt-4o-mini"): Promise<AIStreamResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("响应体为空");
    }

    return { stream: response.body, model };
  }

  getAvailableModels(): string[] {
    return RegionConfig.ai.availableModels;
  }

  getDefaultModel(): string {
    return "openai/gpt-4o-mini";
  }
}

class DeepSeekAdapter implements AIAdapter {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || "";
    this.baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  }

  async chat(messages: AIMessage[], model = "deepseek-chat"): Promise<AIResponse> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: false }),
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

  async chatStream(messages: AIMessage[], model = "deepseek-chat"): Promise<AIStreamResponse> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("响应体为空");
    }

    return { stream: response.body, model };
  }

  getAvailableModels(): string[] {
    return ["deepseek-chat", "deepseek-coder"];
  }

  getDefaultModel(): string {
    return "deepseek-chat";
  }
}

export function createAIAdapter(): AIAdapter {
  if (isChinaRegion()) {
    console.log("🤖 使用 DeepSeek AI（中国版）");
    return new DeepSeekAdapter();
  }
  console.log("🤖 使用 OpenRouter（国际版）");
  return new OpenRouterAdapter();
}

let aiInstance: AIAdapter | null = null;

export function getAI(): AIAdapter {
  if (!aiInstance) {
    aiInstance = createAIAdapter();
  }
  return aiInstance;
}

export function getAvailableModels(): string[] {
  return RegionConfig.ai.availableModels;
}

export function getDefaultAIModel(): string {
  return isChinaRegion() ? "deepseek-chat" : "openai/gpt-4o-mini";
}

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
