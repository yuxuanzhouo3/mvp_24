/**
 * 🇨🇳 中国区域 AI 配置
 * 包含：DeepSeek、通义千问、文心一言、智谱GLM、讯飞星火、腾讯混元
 */

import { AIAgent, AIProviderConfig, AIRegionConfig } from "./types";

// ==================== AI 智能体配置 ====================

export const CHINA_AI_AGENTS: AIAgent[] = [
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    provider: "deepseek",
    model: "deepseek-chat",
    description: "强大的中文理解能力，擅长代码生成和技术问答",
    capabilities: ["coding", "analysis", "creative", "research", "translation"],
    maxTokens: 4096,
    temperature: 0.7,
    icon: "🤖",
  },
  // 可以添加更多国内AI模型：
  // {
  //   id: 'qwen-turbo',
  //   name: '通义千问',
  //   provider: 'qwen',
  //   model: 'qwen-turbo',
  //   description: '阿里云通义千问，擅长中文对话',
  //   capabilities: ['conversation', 'creative', 'translation'],
  //   maxTokens: 2048,
  //   temperature: 0.8,
  //   icon: '☁️'
  // }
];

// ==================== API 密钥配置 ====================

export const CHINA_PROVIDERS: AIProviderConfig[] = [
  {
    provider: "deepseek",
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    enabled: !!process.env.DEEPSEEK_API_KEY,
  },
  // {
  //   provider: 'qwen',
  //   apiKey: process.env.QWEN_API_KEY || '',
  //   baseURL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/api/v1',
  //   enabled: !!process.env.QWEN_API_KEY
  // },
  // {
  //   provider: 'ernie',
  //   apiKey: process.env.ERNIE_API_KEY || '',
  //   baseURL: process.env.ERNIE_BASE_URL || 'https://aip.baidubce.com',
  //   enabled: !!process.env.ERNIE_API_KEY
  // }
];

// ==================== 完整配置导出 ====================

export const chinaAIConfig: AIRegionConfig = {
  region: "china",
  agents: CHINA_AI_AGENTS,
  providers: CHINA_PROVIDERS,
};
