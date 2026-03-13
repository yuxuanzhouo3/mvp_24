import { AIAgent, AIProviderConfig, AIRegionConfig } from "./types";

export const GLOBAL_AI_AGENTS: AIAgent[] = [];

export const GLOBAL_PROVIDERS: AIProviderConfig[] = [
  {
    provider: "openai",
    apiKey: process.env.OPENROUTER_API || "",
    baseURL: "https://openrouter.ai/api/v1",
    enabled: !!process.env.OPENROUTER_API,
  },
];

export const globalAIConfig: AIRegionConfig = {
  region: "global",
  agents: GLOBAL_AI_AGENTS,
  providers: GLOBAL_PROVIDERS,
};
