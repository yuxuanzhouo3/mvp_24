/**
 * AI Agents Configuration Compatibility Layer
 */

import { chinaAIConfig } from "./china-ai.config";
import { globalAIConfig } from "./global-ai.config";
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

export const AI_AGENTS_LIBRARY: AIAgentConfig[] = [
  ...chinaAIConfig.agents.map(convertToLegacyFormat),
  ...globalAIConfig.agents.map(convertToLegacyFormat),
];

export function getEnabledAgents(): AIAgentConfig[] {
  return AI_AGENTS_LIBRARY.filter((a) => a.enabled);
}

export function getAgentById(id: string): AIAgentConfig | undefined {
  return AI_AGENTS_LIBRARY.find((a) => a.id === id);
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
