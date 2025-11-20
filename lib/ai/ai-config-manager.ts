/**
 * AI 配置版本管理器
 * 用于国内版 CloudBase 实现消息分组和上下文管理
 *
 * 功能：
 * 1. 检测 AI 配置变化（用户选择不同的 AI 组合）
 * 2. 自动增加版本号和记录配置历史
 * 3. 提取指定版本的上下文消息
 * 4. 防止新 AI 被旧 AI 的响应污染
 */

import { AIConversation, ConversationMessage, AIConfigHistory } from "@/lib/database/cloudbase-schema";

/**
 * 初始化 CloudBase 连接
 */
function initCloudBase() {
  const cloudbase = require("@cloudbase/node-sdk").init({
    env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
    secretId: process.env.CLOUDBASE_SECRET_ID,
    secretKey: process.env.CLOUDBASE_SECRET_KEY,
  });
  return cloudbase.database();
}

/**
 * 比较两个 Agent ID 数组是否相同
 * 需要忽略顺序，只比较内容
 */
function areAgentIdsSame(ids1: string[], ids2: string[]): boolean {
  if (ids1.length !== ids2.length) {
    return false;
  }
  const sorted1 = [...ids1].sort();
  const sorted2 = [...ids2].sort();
  return sorted1.every((id, i) => id === sorted2[i]);
}

/**
 * 检测并更新 AI 配置版本
 *
 * 当用户切换 AI 模型时调用此函数：
 * 1. 比较新旧 AI 配置是否不同
 * 2. 如果不同，增加版本号
 * 3. 添加新的配置历史记录
 *
 * @param sessionId - 会话 ID
 * @param userId - 用户 ID
 * @param newAgentIds - 新选择的 AI 列表
 * @param mode - 协作模式 ('parallel', 'sequential', 'debate', 'synthesis')
 * @returns 返回新的版本号（如果配置变化）或当前版本号
 */
export async function detectAndUpdateAIConfig(
  sessionId: string,
  userId: string,
  newAgentIds: string[],
  mode: string
): Promise<number> {
  try {
    const db = initCloudBase();

    // 获取当前会话
    const result = await db
      .collection("ai_conversations")
      .doc(sessionId)
      .get();

    if (!result.data || result.data.length === 0) {
      console.warn(`[AI Config] Session ${sessionId} not found`);
      return 1; // 返回版本 1（新会话）
    }

    const conversation = result.data[0] as AIConversation;

    // 验证会话所有权
    if (conversation.user_id !== userId) {
      throw new Error("Access denied: session does not belong to user");
    }

    // 获取配置历史
    const aiConfigHistory = conversation.aiConfigHistory || [];

    // 如果没有历史记录，初始化为版本 1
    if (aiConfigHistory.length === 0) {
      const initialConfig: AIConfigHistory = {
        version: 1,
        agentIds: conversation.model ? [conversation.model] : [],
        mode: "single",
        changedAt: conversation.created_at,
        changedByUser: false,
      };
      aiConfigHistory.push(initialConfig);
    }

    const lastConfig = aiConfigHistory[aiConfigHistory.length - 1];

    // 比较 AI 配置是否发生变化
    const agentIdsChanged = !areAgentIdsSame(newAgentIds, lastConfig.agentIds);
    const modeChanged = mode !== lastConfig.mode;

    if (!agentIdsChanged && !modeChanged) {
      // 配置没有变化，返回当前版本
      console.log(
        `[AI Config] Session ${sessionId} - Config unchanged, version: ${lastConfig.version}`
      );
      return lastConfig.version;
    }

    // 配置发生了变化，增加版本号
    const newVersion = lastConfig.version + 1;

    const newConfig: AIConfigHistory = {
      version: newVersion,
      agentIds: newAgentIds,
      mode: mode,
      changedAt: new Date().toISOString(),
      changedByUser: true,
    };

    // 添加到历史记录
    aiConfigHistory.push(newConfig);

    // 更新会话
    await db.collection("ai_conversations").doc(sessionId).update({
      aiConfigHistory,
      currentAIConfigVersion: newVersion,
      updated_at: new Date().toISOString(),
    });

    console.log(
      `[AI Config] Session ${sessionId} updated to version ${newVersion}`,
      {
        agentIds: newAgentIds,
        mode,
        previousVersion: lastConfig.version,
      }
    );

    return newVersion;
  } catch (error) {
    console.error("[AI Config] Error detecting AI config change:", error);
    throw error;
  }
}

/**
 * 提取指定版本的上下文消息
 *
 * 智能过滤消息，只返回与当前 AI 配置相关的消息：
 * 1. 从最近的消息开始向后查找
 * 2. 停止于不同版本的消息边界
 * 3. 最多返回 maxMessages 条消息
 *
 * 这样可以确保新 AI 只看到相同配置版本的消息，
 * 不会被之前不同 AI 组合的响应污染。
 *
 * @param allMessages - 所有消息
 * @param currentAgentIds - 当前选择的 AI ID 列表
 * @param maxMessages - 最多返回多少条消息
 * @returns 返回转换为 AI 消息格式的相关消息数组
 */
export function extractContextMessages(
  allMessages: ConversationMessage[],
  currentAgentIds: string[],
  maxMessages: number = 20
): { role: "system" | "user" | "assistant"; content: string }[] {
  if (!allMessages || allMessages.length === 0) {
    return [];
  }

  // 先取最近 40 条消息作为候选
  const recentMessages = allMessages.slice(-40);

  let relevantMessages: ConversationMessage[] = [];
  let foundConfigBoundary = false;

  // 从后往前遍历，找到第一个配置变化点
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];

    // 检查这条消息的版本信息
    if (msg.aiConfigVersion) {
      const configAgents = msg.aiConfigVersion.agentIds;

      // 检查配置是否与当前 AI 列表匹配
      const isSameConfig = areAgentIdsSame(configAgents, currentAgentIds);

      if (!isSameConfig) {
        // 找到了配置变化点
        if (relevantMessages.length > 0) {
          // 已经收集了一些当前版本的消息，停止
          foundConfigBoundary = true;
          break;
        }
        // 如果还没有收集当前版本的消息，继续往前找
        // （可能是较早的消息使用了相同配置）
      }
    }

    // 添加到相关消息
    relevantMessages.unshift(msg);

    // 为了防止无限往前查找，设置一个硬性限制
    if (relevantMessages.length >= maxMessages * 2) {
      break;
    }
  }

  // 如果超过最大消息数，只保留最近的 maxMessages 条
  if (relevantMessages.length > maxMessages) {
    relevantMessages = relevantMessages.slice(-maxMessages);
  }

  // 转换为 AI 消息格式
  return relevantMessages.map((msg) => {
    let contentStr = "";

    if (msg.isMultiAI && msg.agentResponses && Array.isArray(msg.agentResponses)) {
      // 多 AI 响应：合并所有响应
      contentStr = msg.agentResponses
        .map((resp) => {
          if (resp.status === "error") {
            return `${resp.agentName} [ERROR]: ${resp.content}`;
          }
          return `${resp.agentName}: ${resp.content}`;
        })
        .join("\n\n");
    } else {
      // 单条消息
      contentStr = msg.content || "";
    }

    return {
      role: msg.role as "system" | "user" | "assistant",
      content: contentStr,
    };
  });
}

/**
 * 获取当前会话的配置历史
 * 用于前端显示 AI 切换时间线
 *
 * @param sessionId - 会话 ID
 * @returns 返回配置历史数组
 */
export async function getAIConfigHistory(
  sessionId: string
): Promise<AIConfigHistory[]> {
  try {
    const db = initCloudBase();

    const result = await db
      .collection("ai_conversations")
      .doc(sessionId)
      .get();

    if (!result.data || result.data.length === 0) {
      return [];
    }

    const conversation = result.data[0] as AIConversation;
    return conversation.aiConfigHistory || [];
  } catch (error) {
    console.error("[AI Config] Error getting config history:", error);
    return [];
  }
}

/**
 * 获取指定版本的所有消息
 * 用于调试和消息历史查看
 *
 * @param sessionId - 会话 ID
 * @param version - 指定的版本号
 * @returns 返回该版本的所有消息
 */
export async function getMessagesByConfigVersion(
  sessionId: string,
  version: number
): Promise<ConversationMessage[]> {
  try {
    const db = initCloudBase();

    const result = await db
      .collection("ai_conversations")
      .doc(sessionId)
      .get();

    if (!result.data || result.data.length === 0) {
      return [];
    }

    const conversation = result.data[0] as AIConversation;
    const messages = conversation.messages || [];

    // 过滤出指定版本的消息
    return messages.filter(
      (msg) => msg.aiConfigVersion?.version === version
    );
  } catch (error) {
    console.error(
      `[AI Config] Error getting messages for version ${version}:`,
      error
    );
    return [];
  }
}
