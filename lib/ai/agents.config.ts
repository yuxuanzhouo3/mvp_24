/**
 * AI Agents Configuration
 * 统一配置所有AI智能体
 * 支持动态添加新的AI，无需修改代码
 */

export interface AIAgentConfig {
  id: string; // 唯一标识符
  name: string; // 显示名称
  nameEn?: string; // 英文名称
  provider: string; // Provider名称: openai, anthropic, deepseek等
  model: string; // 模型ID
  role: string; // 角色描述
  roleEn?: string; // 英文角色描述
  avatar?: string; // 头像URL
  color: string; // 主题颜色 (Tailwind class)
  systemPrompt: string; // 系统提示词
  temperature?: number; // 温度 (0-2)
  maxTokens?: number; // 最大token数
  capabilities: {
    // 能力标签
    coding?: boolean;
    analysis?: boolean;
    creative?: boolean;
    research?: boolean;
    translation?: boolean;
    [key: string]: boolean | undefined;
  };
  tags: string[]; // 标签（用于分类和搜索）
  description: string; // 详细描述
  descriptionEn?: string; // 英文描述
  enabled: boolean; // 是否启用
  isPremium?: boolean; // 是否需要付费订阅
  pricing?: {
    // 可选：自定义定价
    prompt: number;
    completion: number;
  };
}

/**
 * 预配置的AI智能体库
 * 可以通过环境变量或数据库动态加载
 */
export const AI_AGENTS: AIAgentConfig[] = [
  // ==================== DeepSeek 系列（国内专用）====================
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    provider: "deepseek",
    model: "deepseek-chat",
    role: "通用助手",
    roleEn: "General Assistant",
    color: "bg-gray-600",
    systemPrompt: "你是DeepSeek AI助手，擅长中文对话和技术问答。",
    temperature: 0.7,
    maxTokens: 4096,
    capabilities: {
      coding: true,
      analysis: true,
      creative: true,
      research: true,
    },
    tags: ["国内", "通用", "中文"],
    description: "国内可用的高质量AI模型，中文支持优秀",
    descriptionEn:
      "High-quality AI model available in China with excellent Chinese support",
    enabled: true,
    isPremium: false,
  },
];

/**
 * 获取所有启用的AI智能体
 */
export function getEnabledAgents(): AIAgentConfig[] {
  return AI_AGENTS.filter((agent) => agent.enabled);
}

/**
 * 根据ID获取AI智能体
 */
export function getAgentById(id: string): AIAgentConfig | undefined {
  return AI_AGENTS.find((agent) => agent.id === id);
}

/**
 * 根据Provider获取AI智能体
 */
export function getAgentsByProvider(provider: string): AIAgentConfig[] {
  return AI_AGENTS.filter(
    (agent) => agent.provider === provider && agent.enabled
  );
}

/**
 * 根据标签搜索AI智能体
 */
export function searchAgentsByTags(tags: string[]): AIAgentConfig[] {
  return AI_AGENTS.filter(
    (agent) => agent.enabled && tags.some((tag) => agent.tags.includes(tag))
  );
}

/**
 * 根据能力筛选AI智能体
 */
export function getAgentsByCapability(
  capability: keyof AIAgentConfig["capabilities"]
): AIAgentConfig[] {
  return AI_AGENTS.filter(
    (agent) => agent.enabled && agent.capabilities[capability]
  );
}

/**
 * 获取免费AI智能体
 */
export function getFreeAgents(): AIAgentConfig[] {
  return AI_AGENTS.filter((agent) => agent.enabled && !agent.isPremium);
}

/**
 * 获取高级AI智能体
 */
export function getPremiumAgents(): AIAgentConfig[] {
  return AI_AGENTS.filter((agent) => agent.enabled && agent.isPremium);
}

/**
 * 协作模式配置
 */
export const COLLABORATION_MODES = {
  sequential: {
    id: "sequential",
    name: "顺序协作",
    nameEn: "Sequential",
    description: "AI按顺序处理，后一个AI可以看到前一个的结果",
    descriptionEn: "AIs process sequentially, each seeing previous results",
    icon: "ArrowRight",
  },
  parallel: {
    id: "parallel",
    name: "并行协作",
    nameEn: "Parallel",
    description: "AI同时独立处理，提供多角度分析",
    descriptionEn:
      "AIs process independently in parallel for multi-perspective analysis",
    icon: "Grid",
  },
  debate: {
    id: "debate",
    name: "辩论模式",
    nameEn: "Debate",
    description: "AI互相质疑和反驳，深入探讨问题",
    descriptionEn: "AIs challenge and debate each other for deeper insights",
    icon: "MessageSquare",
  },
  synthesis: {
    id: "synthesis",
    name: "综合模式",
    nameEn: "Synthesis",
    description: "先并行分析，再由主AI综合所有观点",
    descriptionEn: "Parallel analysis followed by synthesis from a lead AI",
    icon: "Merge",
  },
} as const;

export type CollaborationMode = keyof typeof COLLABORATION_MODES;
