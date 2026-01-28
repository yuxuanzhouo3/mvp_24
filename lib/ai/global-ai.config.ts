import { AIAgent, AIProviderConfig, AIRegionConfig } from "./types";

export const GLOBAL_AI_AGENTS: AIAgent[] = [
  // Mistral Text Models - Using exact model names from verified API endpoints
  {
    id: "mistral-tiny",
    name: "Mistral Tiny",
    provider: "mistral",
    model: "mistral-tiny",
    description: "Fast & lightweight | Recommended for quick responses",
    capabilities: ["conversation", "analysis"] as const,
    maxTokens: 8000,
    temperature: 0.7,
    icon: "⚡",
  },
  {
    id: "codestral-latest",
    name: "Codestral Latest",
    provider: "mistral",
    model: "codestral-latest",
    description: "Fast code generation | Recommended",
    capabilities: ["coding", "analysis"] as const,
    maxTokens: 16000,
    temperature: 0.7,
    icon: "💻",
  },
  {
    id: "codestral-2412",
    name: "Codestral 2412",
    provider: "mistral",
    model: "codestral-2412",
    description: "Fastest code model",
    capabilities: ["coding"] as const,
    maxTokens: 16000,
    temperature: 0.7,
    icon: "⚡💻",
  },
  {
    id: "devstral-small-latest",
    name: "Devstral Small Latest",
    provider: "mistral",
    model: "devstral-small-latest",
    description: "Small development model | Recommended",
    capabilities: ["coding", "analysis"] as const,
    maxTokens: 12000,
    temperature: 0.7,
    icon: "🛠️",
  },
  {
    id: "devstral-medium-latest",
    name: "Devstral Medium Latest",
    provider: "mistral",
    model: "devstral-medium-latest",
    description: "Medium development model | Recommended",
    capabilities: ["coding", "analysis", "creative"] as const,
    maxTokens: 20000,
    temperature: 0.7,
    icon: "🛠️",
  },
];

export const GLOBAL_PROVIDERS: AIProviderConfig[] = [
  {
    provider: "mistral",
    apiKey: process.env.MISTRAL_API_KEY || "",
    baseURL: "https://api.mistral.ai/v1",
    enabled: !!process.env.MISTRAL_API_KEY,
  },
];

export const globalAIConfig: AIRegionConfig = {
  region: "global",
  agents: GLOBAL_AI_AGENTS,
  providers: GLOBAL_PROVIDERS,
};
