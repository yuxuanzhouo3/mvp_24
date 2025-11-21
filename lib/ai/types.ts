/**
 * AI Provider Types
 * 统一的AI提供商接口定义
 */

/**
 * AI消息角色
 */
export type MessageRole = "system" | "user" | "assistant";

/**
 * AI消息接口
 */
export interface AIMessage {
  role: MessageRole;
  content: string;
  name?: string; // 可选：消息发送者名称
}

/**
 * AI响应接口
 */
export interface AIResponse {
  content: string; // AI生成的内容
  tokens: {
    prompt: number; // 输入token数
    completion: number; // 输出token数
    total: number; // 总token数
  };
  model: string; // 使用的模型名称
  finish_reason: string | null; // 完成原因：'stop', 'length', 'content_filter' 等
  usage?: {
    // 可选：详细使用信息
    cost_usd?: number; // 预估费用（美元）
  };
}

/**
 * 流式响应块接口
 */
export interface StreamChunk {
  content: string; // 当前块的内容
  done: boolean; // 是否完成
  tokens?: number; // 可选：总token数（仅在done=true时）
  finish_reason?: string | null; // 可选：完成原因
}

/**
 * 聊天选项接口
 */
export interface ChatOptions {
  model?: string; // 模型名称，如 'gpt-4-turbo', 'claude-3-5-sonnet'
  temperature?: number; // 温度参数 (0-2)，默认0.7
  maxTokens?: number; // 最大生成token数
  topP?: number; // Top-p采样参数 (0-1)
  frequencyPenalty?: number; // 频率惩罚 (0-2)
  presencePenalty?: number; // 存在惩罚 (0-2)
  stop?: string[]; // 停止序列
  user?: string; // 用户标识符
}

/**
 * Token使用记录接口
 */
export interface TokenUsage {
  userId: string;
  sessionId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  createdAt?: Date;
}

/**
 * AI Provider错误类型
 */
export class AIProviderError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

/**
 * 模型信息接口
 */
export interface ModelInfo {
  id: string; // 模型ID
  name: string; // 显示名称
  provider: string; // 提供商名称
  contextWindow: number; // 上下文窗口大小
  pricing: {
    prompt: number; // 输入token价格（每1K tokens）
    completion: number; // 输出token价格（每1K tokens）
  };
  capabilities: {
    streaming: boolean; // 是否支持流式输出
    functionCalling: boolean; // 是否支持函数调用
    vision: boolean; // 是否支持图像理解
  };
}

/**
 * 支持的AI提供商
 */
export enum AIProvider {
  OPENAI = "openai",
  ANTHROPIC = "anthropic",
  DEEPSEEK = "deepseek",
}

/**
 * 流式响应状态
 */
export enum StreamStatus {
  CONNECTING = "connecting",
  STREAMING = "streaming",
  COMPLETED = "completed",
  ERROR = "error",
}

/**
 * ========================================
 * AI 配置系统类型（区域配置）
 * ========================================
 */

/**
 * AI 提供商名称
 */
export type AIProviderName =
  | "openai"
  | "anthropic"
  | "qwen" // 阿里云通义千问 (DashScope)
  | "google"
  | "deepseek"
  | "ernie" // 百度文心一言
  | "glm" // 智谱清言
  | "spark" // 讯飞星火
  | "hunyuan" // 腾讯混元
  | "mistral"; // Mistral AI

/**
 * AI 能力标签
 */
export type AICapability =
  | "coding"
  | "analysis"
  | "creative"
  | "research"
  | "translation"
  | "conversation";

/**
 * AI 智能体配置
 */
export interface AIAgent {
  id: string;
  name: string;
  provider: AIProviderName;
  model: string;
  description: string;
  capabilities: AICapability[];
  maxTokens?: number;
  temperature?: number;
  icon?: string;
}

/**
 * AI Provider 配置（包含 API 密钥）
 */
export interface AIProviderConfig {
  provider: AIProviderName;
  apiKey: string;
  baseURL?: string;
  enabled: boolean;
}

/**
 * 区域 AI 配置
 */
export interface AIRegionConfig {
  region: "china" | "global";
  agents: AIAgent[];
  providers: AIProviderConfig[];
}
