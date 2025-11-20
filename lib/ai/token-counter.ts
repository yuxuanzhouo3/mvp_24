/**
 * Token Counter & Billing
 * Token计数和费用计算模块
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import { TokenUsage } from "./types";

/**
 * 模型定价配置（每1000 tokens的价格，单位：美元）
 */
export const MODEL_PRICING = {
  // OpenAI GPT-4 系列
  "gpt-4-turbo": { prompt: 0.01, completion: 0.03 },
  "gpt-4-turbo-preview": { prompt: 0.01, completion: 0.03 },
  "gpt-4": { prompt: 0.03, completion: 0.06 },
  "gpt-4-32k": { prompt: 0.06, completion: 0.12 },

  // OpenAI GPT-3.5 系列
  "gpt-3.5-turbo": { prompt: 0.0005, completion: 0.0015 },
  "gpt-3.5-turbo-16k": { prompt: 0.001, completion: 0.002 },

  // Anthropic Claude 系列
  "claude-3-5-sonnet-20241022": { prompt: 0.003, completion: 0.015 },
  "claude-3-opus-20240229": { prompt: 0.015, completion: 0.075 },
  "claude-3-sonnet-20240229": { prompt: 0.003, completion: 0.015 },
  "claude-3-haiku-20240307": { prompt: 0.00025, completion: 0.00125 },

  // DeepSeek 系列（可选）
  "deepseek-chat": { prompt: 0.00014, completion: 0.00028 },
  "deepseek-coder": { prompt: 0.00014, completion: 0.00028 },
} as const;

/**
 * 计算Token使用的费用
 * @param model 模型名称
 * @param promptTokens 输入token数
 * @param completionTokens 输出token数
 * @returns 费用（美元）
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = MODEL_PRICING[model as keyof typeof MODEL_PRICING];

  if (!pricing) {
    console.warn(
      `Unknown model pricing: ${model}, using default GPT-3.5-turbo pricing`
    );
    const defaultPricing = MODEL_PRICING["gpt-3.5-turbo"];
    const promptCost = (promptTokens / 1000) * defaultPricing.prompt;
    const completionCost =
      (completionTokens / 1000) * defaultPricing.completion;
    return promptCost + completionCost;
  }

  const promptCost = (promptTokens / 1000) * pricing.prompt;
  const completionCost = (completionTokens / 1000) * pricing.completion;

  return promptCost + completionCost;
}

/**
 * 计算总费用
 * @param model 模型名称
 * @param totalTokens 总token数（假设50%输入50%输出）
 * @returns 费用（美元）
 */
export function calculateTotalCost(model: string, totalTokens: number): number {
  // 简化计算：假设50%输入，50%输出
  const promptTokens = Math.floor(totalTokens * 0.5);
  const completionTokens = totalTokens - promptTokens;
  return calculateCost(model, promptTokens, completionTokens);
}

/**
 * 获取模型定价信息
 * @param model 模型名称
 * @returns 定价信息或null
 */
export function getModelPricing(model: string) {
  return MODEL_PRICING[model as keyof typeof MODEL_PRICING] || null;
}

/**
 * 记录Token使用到数据库
 * @param usage Token使用记录
 * @returns 是否成功
 */
export async function recordUsage(usage: TokenUsage): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin.from("token_usage").insert({
      user_id: usage.userId,
      session_id: usage.sessionId,
      model: usage.model,
      prompt_tokens: usage.promptTokens,
      completion_tokens: usage.completionTokens,
      total_tokens: usage.totalTokens,
      cost_usd: usage.costUsd,
      created_at: usage.createdAt?.toISOString() || new Date().toISOString(),
    });

    if (error) {
      console.error("Failed to record token usage:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error recording token usage:", error);
    return false;
  }
}

/**
 * 获取用户的Token使用统计
 * @param userId 用户ID
 * @param startDate 开始日期（可选）
 * @param endDate 结束日期（可选）
 * @returns 使用统计
 */
export async function getUserUsageStats(
  userId: string,
  startDate?: Date,
  endDate?: Date
) {
  try {
    let query = supabaseAdmin
      .from("token_usage")
      .select("*")
      .eq("user_id", userId);

    if (startDate) {
      query = query.gte("created_at", startDate.toISOString());
    }

    if (endDate) {
      query = query.lte("created_at", endDate.toISOString());
    }

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      console.error("Failed to get usage stats:", error);
      return null;
    }

    // 计算总计
    const stats = {
      totalTokens: 0,
      totalCost: 0,
      totalRequests: data?.length || 0,
      byModel: {} as Record<
        string,
        { tokens: number; cost: number; requests: number }
      >,
    };

    if (data) {
      for (const record of data) {
        stats.totalTokens += record.total_tokens;
        stats.totalCost += parseFloat(record.cost_usd);

        if (!stats.byModel[record.model]) {
          stats.byModel[record.model] = { tokens: 0, cost: 0, requests: 0 };
        }

        stats.byModel[record.model].tokens += record.total_tokens;
        stats.byModel[record.model].cost += parseFloat(record.cost_usd);
        stats.byModel[record.model].requests += 1;
      }
    }

    return stats;
  } catch (error) {
    console.error("Error getting usage stats:", error);
    return null;
  }
}

/**
 * 获取用户本月的Token使用量
 * @param userId 用户ID
 * @returns 本月使用的token数
 */
export async function getUserMonthlyUsage(userId: string): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59
  );

  const stats = await getUserUsageStats(userId, startOfMonth, endOfMonth);
  return stats?.totalTokens || 0;
}

/**
 * 获取会话的Token使用详情
 * @param sessionId 会话ID
 * @returns 使用详情列表
 */
export async function getSessionUsage(sessionId: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from("token_usage")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to get session usage:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error getting session usage:", error);
    return null;
  }
}

/**
 * 检查用户是否超过免费额度
 * @param userId 用户ID
 * @param freeLimit 免费额度（默认100次请求）
 * @returns 是否超过额度
 */
export async function hasExceededFreeLimit(
  userId: string,
  freeLimit: number = 100
): Promise<boolean> {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonthIso = startOfMonth.toISOString();

    // 获取本月所有会话的消息并计算 assistant 消息数量
    const { data: sessions, error: sessionsError } = await supabaseAdmin
      .from("gpt_sessions")
      .select("messages")
      .eq("user_id", userId)
      .gte("created_at", startOfMonthIso);

    if (sessionsError) {
      console.error("Failed to check free limit:", sessionsError);
      return false;
    }

    let assistantMessageCount = 0;
    if (sessions) {
      sessions.forEach((session: any) => {
        if (session.messages && Array.isArray(session.messages)) {
          const count = session.messages.filter((msg: any) => msg.role === "assistant").length;
          assistantMessageCount += count;
        }
      });
    }

    return assistantMessageCount >= freeLimit;
  } catch (error) {
    console.error("Error checking free limit:", error);
    return false;
  }
}

/**
 * 格式化费用显示
 * @param costUsd 费用（美元）
 * @returns 格式化的字符串
 */
export function formatCost(costUsd: number): string {
  if (costUsd < 0.01) {
    return `$${(costUsd * 1000).toFixed(3)}k`; // 显示为千分之一美元
  }
  return `$${costUsd.toFixed(4)}`;
}

/**
 * 格式化Token数量
 * @param tokens Token数量
 * @returns 格式化的字符串
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) {
    return `${tokens}`;
  }
  if (tokens < 1000000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return `${(tokens / 1000000).toFixed(2)}M`;
}
