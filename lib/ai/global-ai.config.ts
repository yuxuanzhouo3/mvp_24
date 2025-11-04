import { AIAgent, AIProviderConfig, AIRegionConfig } from "./types";

export const GLOBAL_AI_AGENTS: AIAgent[] = [
  // Anthropic Models
  {
    id: "claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    model: "anthropic/claude-haiku-4.5",
    description: "200K context | $1.00/$5.00 per M tokens",
    capabilities: ["conversation", "translation", "coding"],
    maxTokens: 200000,
    temperature: 0.8,
    icon: "🔮",
  },
  {
    id: "claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    model: "anthropic/claude-sonnet-4.5",
    description: "200K context | $3.00/$15.00 per M tokens",
    capabilities: ["coding", "analysis", "creative", "research"],
    maxTokens: 200000,
    temperature: 0.7,
    icon: "🔮",
  },
  {
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    model: "anthropic/claude-sonnet-4",
    description: "200K context | $3.00/$15.00 per M tokens",
    capabilities: ["coding", "analysis", "creative", "research"],
    maxTokens: 200000,
    temperature: 0.7,
    icon: "🔮",
  },

  // OpenAI Models
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    provider: "openai",
    model: "openai/gpt-4.1-mini",
    description: "1M context | $0.40/$1.60 per M tokens",
    capabilities: ["coding", "creative", "translation"],
    maxTokens: 1000000,
    temperature: 0.8,
    icon: "🤖",
  },
  {
    id: "gpt-5-nano",
    name: "GPT-5 Nano",
    provider: "openai",
    model: "openai/gpt-5-nano",
    description: "400K context | $0.05/$0.40 per M tokens",
    capabilities: ["creative", "translation"],
    maxTokens: 400000,
    temperature: 0.8,
    icon: "🤖",
  },
  {
    id: "gpt-5",
    name: "GPT-5",
    provider: "openai",
    model: "openai/gpt-5",
    description: "400K context | $1.25/$10.00 per M tokens",
    capabilities: ["coding", "analysis", "creative", "research"],
    maxTokens: 400000,
    temperature: 0.7,
    icon: "🤖",
  },

  // Google Models
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    model: "google/gemini-2.5-flash",
    description: "1M context | $0.30/$2.50 per M tokens",
    capabilities: ["coding", "analysis", "creative"],
    maxTokens: 1000000,
    temperature: 0.7,
    icon: "💎",
  },

  // Anthropic Models
  {
    id: "claude-3-haiku",
    name: "Claude 3 Haiku",
    provider: "anthropic",
    model: "anthropic/claude-3-haiku",
    description: "200K context | $0.25/$1.25 per M tokens",
    capabilities: ["conversation", "translation"],
    maxTokens: 200000,
    temperature: 0.8,
    icon: "🔮",
  },

  // Google Models
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    model: "google/gemini-2.5-pro",
    description: "1M context | $1.25/$10.00 per M tokens",
    capabilities: ["coding", "analysis", "creative", "research"],
    maxTokens: 1000000,
    temperature: 0.7,
    icon: "💎",
  },

  // OpenAI Models
  {
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    provider: "openai",
    model: "openai/gpt-5-mini",
    description: "400K context | $0.25/$2.00 per M tokens",
    capabilities: ["coding", "creative"],
    maxTokens: 400000,
    temperature: 0.8,
    icon: "🤖",
  },

  // Google Models
  {
    id: "gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash Lite",
    provider: "google",
    model: "google/gemini-2.0-flash-lite",
    description: "1M context | $0.07/$0.30 per M tokens",
    capabilities: ["coding"],
    maxTokens: 1000000,
    temperature: 0.8,
    icon: "💎",
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    model: "google/gemini-2.0-flash",
    description: "1M context | $0.10/$0.40 per M tokens",
    capabilities: ["coding", "analysis", "creative"],
    maxTokens: 1000000,
    temperature: 0.7,
    icon: "💎",
  },

  // OpenAI Models
  {
    id: "gpt-oss-120b",
    name: "GPT-OSS 120B",
    provider: "openai",
    model: "openai/gpt-oss-120b",
    description: "131K context | $0.10/$0.50 per M tokens",
    capabilities: ["coding", "analysis"],
    maxTokens: 131000,
    temperature: 0.7,
    icon: "🤖",
  },
  {
    id: "gpt-5-codex",
    name: "GPT-5 Codex",
    provider: "openai",
    model: "openai/gpt-5-codex",
    description: "400K context | $1.25/$10.00 per M tokens",
    capabilities: ["coding"],
    maxTokens: 400000,
    temperature: 0.5,
    icon: "🤖",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    model: "openai/gpt-4o-mini",
    description: "128K context | $0.15/$0.60 per M tokens",
    capabilities: ["coding", "creative", "translation"],
    maxTokens: 128000,
    temperature: 0.8,
    icon: "🤖",
  },

  // Google Models
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    provider: "google",
    model: "google/gemini-2.5-flash-lite",
    description: "1M context | $0.10/$0.40 per M tokens",
    capabilities: ["coding"],
    maxTokens: 1000000,
    temperature: 0.8,
    icon: "💎",
  },

  // Anthropic Models
  {
    id: "claude-3.7-sonnet",
    name: "Claude 3.7 Sonnet",
    provider: "anthropic",
    model: "anthropic/claude-3.7-sonnet",
    description: "200K context | $3.00/$15.00 per M tokens",
    capabilities: ["coding", "analysis", "creative", "research"],
    maxTokens: 200000,
    temperature: 0.7,
    icon: "�",
  },

  // OpenAI Models
  {
    id: "text-embedding-3-small",
    name: "Text Embedding 3 Small",
    provider: "openai",
    model: "openai/text-embedding-3-small",
    description: "Embedding model | $0.02/M tokens",
    capabilities: ["research"],
    maxTokens: 8191,
    temperature: 0.0,
    icon: "🤖",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    model: "openai/gpt-4o",
    description: "128K context | $2.50/$10.00 per M tokens",
    capabilities: ["coding", "analysis", "creative", "research"],
    maxTokens: 128000,
    temperature: 0.7,
    icon: "🤖",
  },

  // DeepSeek Model
  {
    id: "deepseek-v3.2-exp",
    name: "DeepSeek V3.2 Exp",
    provider: "deepseek",
    model: "deepseek/deepseek-v3.2-exp",
    description: "164K context | $0.27/$0.41 per M tokens",
    capabilities: ["coding", "analysis", "research"],
    maxTokens: 164000,
    temperature: 0.7,
    icon: "🧠",
  },
];

export const GLOBAL_PROVIDERS: AIProviderConfig[] = [
  {
    provider: "openai",
    apiKey: process.env.AI_GATEWAY_API_KEY || "",
    baseURL: "https://ai-gateway.vercel.sh/v1",
    enabled: !!process.env.AI_GATEWAY_API_KEY,
  },
  {
    provider: "anthropic",
    apiKey: process.env.AI_GATEWAY_API_KEY || "",
    baseURL: "https://ai-gateway.vercel.sh/v1",
    enabled: !!process.env.AI_GATEWAY_API_KEY,
  },
  {
    provider: "google",
    apiKey: process.env.AI_GATEWAY_API_KEY || "",
    baseURL: "https://ai-gateway.vercel.sh/v1",
    enabled: !!process.env.AI_GATEWAY_API_KEY,
  },
  {
    provider: "deepseek",
    apiKey: process.env.AI_GATEWAY_API_KEY || "",
    baseURL: "https://ai-gateway.vercel.sh/v1",
    enabled: !!process.env.AI_GATEWAY_API_KEY,
  },
];

export const globalAIConfig: AIRegionConfig = {
  region: "global",
  agents: GLOBAL_AI_AGENTS,
  providers: GLOBAL_PROVIDERS,
};
