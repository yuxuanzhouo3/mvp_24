/**
 * AI Agents Configuration Compatibility Layer
 */

import { chinaAIConfig } from "./china-ai.config";
import { globalAIConfig } from "./global-ai.config";
import { isChinaRegion } from "@/lib/config/region";
import type { AIAgent } from "./types";

export interface AIAgentConfig {
  id: string;
  name: string;
  provider: string;
  model: string;
  role?: string;
  color?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  capabilities?: {
    coding?: boolean;
    analysis?: boolean;
    creative?: boolean;
    research?: boolean;
    translation?: boolean;
    [key: string]: boolean | undefined;
  };
  tags?: string[];
  description: string;
  enabled: boolean;
  isPremium?: boolean;
  order?: number;
  region?: "china" | "global";
}

function convertToLegacyFormat(agent: AIAgent): AIAgentConfig {
  const colors: Record<string, string> = {
    openai: "bg-green-500",
    anthropic: "bg-orange-500",
    deepseek: "bg-gray-600",
    qwen: "bg-blue-500",
    mistral: "bg-purple-500",
  };

  return {
    id: agent.id,
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    description: agent.description,
    role: agent.name,
    color: colors[agent.provider] || "bg-gray-500",
    systemPrompt: `You are ${agent.name}.`,
    temperature: agent.temperature || 0.7,
    maxTokens: agent.maxTokens || 4096,
    capabilities: {
      coding: agent.capabilities?.includes("coding"),
      analysis: agent.capabilities?.includes("analysis"),
      creative: agent.capabilities?.includes("creative"),
      research: agent.capabilities?.includes("research"),
      translation: agent.capabilities?.includes("translation"),
    },
    tags: agent.capabilities || [],
    enabled: true,
    isPremium: false,
    order: 1,
  };
}

function inferProvider(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes("claude") || lower.startsWith("anthropic/")) return "anthropic";
  if (lower.includes("gpt") || lower.startsWith("openai/")) return "openai";
  if (lower.includes("gemini") || lower.startsWith("google/")) return "google";
  if (lower.includes("mistral") || lower.includes("codestral") || lower.includes("devstral")) {
    return "openrouter";
  }
  if (lower.includes("deepseek")) return "deepseek";
  if (lower.includes("qwen") || lower.includes("qwq") || lower.includes("kimi")) return "qwen";
  return model.includes("/") ? model.split("/")[0] || "openrouter" : "openrouter";
}

function buildDynamicFallbackAgent(id: string): AIAgentConfig | undefined {
  const model = String(id || "").trim();
  if (!model) return undefined;
  const provider = inferProvider(model);
  return {
    id: model,
    name: model,
    provider,
    model,
    description: "Imported model",
    role: model,
    color: "bg-gray-500",
    systemPrompt: `You are ${model}.`,
    temperature: 0.7,
    maxTokens: 4096,
    capabilities: {
      analysis: true,
    },
    tags: ["analysis"],
    enabled: true,
    isPremium: false,
    order: 999,
  };
}

const CHINA_AI_AGENTS_LIBRARY: AIAgentConfig[] = chinaAIConfig.agents.map(convertToLegacyFormat);
const GLOBAL_AI_AGENTS_LIBRARY: AIAgentConfig[] = globalAIConfig.agents.map(convertToLegacyFormat);

export const AI_AGENTS_LIBRARY: AIAgentConfig[] = [
  ...CHINA_AI_AGENTS_LIBRARY,
  ...GLOBAL_AI_AGENTS_LIBRARY,
];

function getRegionAgentLibrary(): AIAgentConfig[] {
  return isChinaRegion() ? CHINA_AI_AGENTS_LIBRARY : GLOBAL_AI_AGENTS_LIBRARY;
}

export function getEnabledAgents(): AIAgentConfig[] {
  return getRegionAgentLibrary().filter((a) => a.enabled);
}

export function getAgentById(id: string): AIAgentConfig | undefined {
  const regionMatched = getRegionAgentLibrary().find((a) => a.id === id);
  if (regionMatched) return regionMatched;
  const globalMatched = AI_AGENTS_LIBRARY.find((a) => a.id === id);
  if (globalMatched) return globalMatched;
  return buildDynamicFallbackAgent(id);
}

export function validateAgents(agentIds: string[], userPlan: string) {
  const result = {
    valid: [] as string[],
    invalid: [] as string[],
    needsUpgrade: [] as string[],
  };

  for (const id of agentIds) {
    const agent = getAgentById(id);
    if (!agent || !agent.enabled) {
      result.invalid.push(id);
    } else if (agent.isPremium && userPlan === "free") {
      result.needsUpgrade.push(id);
    } else {
      result.valid.push(id);
    }
  }

  return result;
}

export const COLLABORATION_MODES = {
  sequential: { id: "sequential", name: "顺序协作" },
  parallel: { id: "parallel", name: "并行协作" },
  debate: { id: "debate", name: "辩论模式" },
  synthesis: { id: "synthesis", name: "综合模式" },
} as const;
