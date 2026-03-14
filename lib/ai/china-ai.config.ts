/**
 * 🇨🇳 中国区域 AI 配置
 * 包含：DeepSeek、通义千问、文心一言、智谱GLM、讯飞星火、腾讯混元
 */

import { AIAgent, AIProviderConfig, AIRegionConfig } from "./types";

// ==================== AI 智能体配置 ====================

export const CHINA_AI_AGENTS: AIAgent[] = [
  {
    id: "smart-model",
    name: "智能模型",
    provider: "qwen",
    model: "smart-auto",
    description: "自动选择最优模型",
    capabilities: [
      "analysis",
      "conversation",
      "coding",
      "creative",
      "research",
      "translation",
      "multimodal",
      "image_input",
      "audio_input",
      "audio_output",
    ],
    maxTokens: 6144,
    temperature: 0.7,
    icon: "⭐",
  },

  // ==================== 智能模型协作成员 ====================
  {
    id: "qwen3-max-2026-01-23",
    name: "Qwen3-Max-2026-01-23",
    provider: "qwen",
    model: "qwen3-max-2026-01-23",
    description: "极强思考能力，支持 Responses API（智能模型协作成员）",
    capabilities: ["analysis", "research", "coding", "conversation"],
    maxTokens: 6144,
    temperature: 0.6,
    icon: "⭐",
  },
  {
    id: "qwen-plus-2025-12-01",
    name: "Qwen-Plus-2025-12-01",
    provider: "qwen",
    model: "qwen-plus-2025-12-01",
    description: "擅长智能体和多轮工具调用（智能模型协作成员）",
    capabilities: ["analysis", "conversation", "coding", "creative", "research"],
    maxTokens: 6144,
    temperature: 0.7,
    icon: "⭐",
  },
  {
    id: "deepseek-v3.2",
    name: "DeepSeek-V3.2",
    provider: "qwen",
    model: "deepseek-v3.2",
    description: "全新混合推理架构模型（智能模型协作成员）",
    capabilities: ["analysis", "coding", "research", "conversation"],
    maxTokens: 6144,
    temperature: 0.6,
    icon: "⭐",
  },

  // ==================== 旗舰模型 ====================
  {
    id: "deepseek-v3.1",
    name: "DeepSeek V3.1",
    provider: "qwen",
    model: "deepseek-v3.1",
    description: "64K上下文 | ¥0.001/千tokens | 代码生成专家",
    capabilities: ["coding", "analysis"],
    maxTokens: 6144,
    temperature: 0.7,
    icon: "🤖",
  },
  {
    id: "qwen-max",
    name: "通义千问 Max",
    provider: "qwen",
    model: "qwen-max",
    description: "32K上下文 | ¥0.04/千tokens | 上一代旗舰模型",
    capabilities: ["coding", "analysis", "creative", "research"],
    maxTokens: 6144,
    temperature: 0.7,
    icon: "☁️",
  },
  {
    id: "kimi-k2-thinking",
    name: "Kimi K2 Thinking",
    provider: "qwen",
    model: "kimi-k2-thinking",
    description: "128K上下文 | ¥0.01/千tokens | 深度思考链模型",
    capabilities: ["analysis", "research", "coding"],
    maxTokens: 6144,
    temperature: 0.7,
    icon: "🧠",
  },

  // ==================== 平衡模型 ====================
  {
    id: "qwen-plus",
    name: "通义千问 Plus",
    provider: "qwen",
    model: "qwen-plus",
    description: "32K上下文 | ¥0.008/千tokens | 性价比首选",
    capabilities: ["coding", "analysis", "creative", "translation"],
    maxTokens: 6144,
    temperature: 0.7,
    icon: "☁️",
  },
  {

    id: "qwen2-72b-instruct",
    name: "通义千问 2-72B",
    provider: "qwen",
    model: "qwen2-72b-instruct",
    description: "32K上下文 | ¥0.008/千tokens | 72B大参数模型",
    capabilities: ["coding", "analysis", "research"],
    maxTokens: 6144,
    temperature: 0.7,
    icon: "☁️",
  },
  {
    id: "qwen1.5-110b-chat",
    name: "通义千问 1.5-110B",
    provider: "qwen",
    model: "qwen1.5-110b-chat",
    description: "32K上下文 | ¥0.008/千tokens | 110B超大模型",
    capabilities: ["conversation", "analysis", "creative"],
    maxTokens: 6144,
    temperature: 0.8,
    icon: "☁️",
  },

  // ==================== 快速模型 ====================
  {
    id: "qwen-flash",
    name: "通义千问 Flash",
    provider: "qwen",
    model: "qwen-flash",
    description: "8K上下文 | ¥0.001/千tokens | 超快响应速度",
    capabilities: ["conversation", "translation", "creative"],
    maxTokens: 4096,
    temperature: 0.8,
    icon: "⚡",
  },
  {
    id: "qwen-turbo",
    name: "通义千问 Turbo",
    provider: "qwen",
    model: "qwen-turbo",
    description: "8K上下文 | ¥0.002/千tokens | 快速响应模型",
    capabilities: ["conversation", "translation", "creative"],
    maxTokens: 4096,
    temperature: 0.8,
    icon: "⚡",
  },
  {
    id: "qwen3-omni-flash",
    name: "通义千问 Omni Flash",
    provider: "qwen",
    model: "qwen3-omni-flash",
    description: "全模态模型 | 适合图片/音频/视频与文本联合理解",
    capabilities: [
      "conversation",
      "analysis",
      "multimodal",
      "image_input",
      "audio_input",
      "audio_output",
    ],
    maxTokens: 6144,
    temperature: 0.6,
    icon: "🧩",
  },

  // ==================== 特殊场景模型 ====================
  {
    id: "qwen2.5-7b-instruct-1m",
    name: "通义千问 2.5-7B-1M",
    provider: "qwen",
    model: "qwen2.5-7b-instruct-1m",
    description: "1M上下文 | ¥0.001/千tokens | 百万上下文窗口",
    capabilities: ["research", "analysis"],
    maxTokens: 6144,
    temperature: 0.7,
    icon: "📚",
  },
  {
    id: "qwq-32b-preview",
    name: "QwQ-32B Preview",
    provider: "qwen",
    model: "qwq-32b-preview",
    description: "32K上下文 | ¥0.005/千tokens | 实验性功能预览",
    capabilities: ["research", "analysis"],
    maxTokens: 6144,
    temperature: 0.7,
    icon: "🔬",
  },
];

// ==================== API 密钥配置 ====================

export const CHINA_PROVIDERS: AIProviderConfig[] = [
  {
    provider: "qwen",
    apiKey: process.env.DASHSCOPE_API_KEY || "",
    baseURL:
      process.env.DASHSCOPE_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    enabled: !!process.env.DASHSCOPE_API_KEY,
  },
];

// ==================== 完整配置导出 ====================

export const chinaAIConfig: AIRegionConfig = {
  region: "china",
  agents: CHINA_AI_AGENTS,
  providers: CHINA_PROVIDERS,
};
