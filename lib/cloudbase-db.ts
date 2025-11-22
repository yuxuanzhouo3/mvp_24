/**
 * CloudBase 数据库操作工具
 * 用于国内版(CN)的数据库操作
 */

import cloudbase from "@cloudbase/node-sdk";

let cachedApp: any = null;

function getCloudBaseApp() {
  if (cachedApp) {
    return cachedApp;
  }

  cachedApp = cloudbase.init({
    env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
    secretId: process.env.CLOUDBASE_SECRET_ID,
    secretKey: process.env.CLOUDBASE_SECRET_KEY,
  });

  return cachedApp;
}

export async function getGptSessions(
  userId: string,
  limit: number = 50,
  offset: number = 0
) {
  try {
    const db = getCloudBaseApp().database();
    const collection = db.collection("ai_conversations");

    // CloudBase 查询语法
    const result = await collection
      .where({
        user_id: userId,
      })
      .skip(offset)
      .limit(limit)
      .orderBy("updated_at", "desc")
      .get();

    return {
      data: result.data,
      error: null,
      count: result.data.length,
    };
  } catch (error) {
    console.error("[CloudBase] Failed to fetch sessions:", error);
    return {
      data: null,
      error: error,
      count: 0,
    };
  }
}

export async function createGptSession(
  userId: string,
  title: string,
  model: string,
  multiAiConfig: any = null
) {
  try {
    const db = getCloudBaseApp().database();
    const collection = db.collection("ai_conversations");

    const now = new Date().toISOString();
    const sessionData: any = {
      user_id: userId,
      title: title.trim(),
      model,
      created_at: now,
      updated_at: now,
    };

    // ✅ 改进：总是添加multi_ai_config（即使是单AI会话）
    // 这样前端统一传递agentId时后端也能识别
    if (multiAiConfig) {
      sessionData.multi_ai_config = multiAiConfig;
    }

    const result = await collection.add(sessionData);

    // 返回创建的会话
    return {
      data: {
        _id: result.id,
        ...sessionData,
      },
      error: null,
    };
  } catch (error) {
    console.error("[CloudBase] Failed to create session:", error);
    return {
      data: null,
      error: error,
    };
  }
}

export async function deleteGptSession(sessionId: string, userId: string) {
  try {
    const db = getCloudBaseApp().database();
    const collection = db.collection("ai_conversations");

    // 确保只能删除自己的会话
    await collection
      .where({
        _id: sessionId,
        user_id: userId,
      })
      .remove();

    return { error: null };
  } catch (error) {
    console.error("[CloudBase] Failed to delete session:", error);
    return { error };
  }
}

export async function updateGptSession(
  sessionId: string,
  userId: string,
  updates: { title?: string; updated_at?: string }
) {
  try {
    const db = getCloudBaseApp().database();
    const collection = db.collection("ai_conversations");

    const updateData = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    // 确保只能更新自己的会话
    await collection
      .where({
        _id: sessionId,
        user_id: userId,
      })
      .update(updateData);

    return { error: null };
  } catch (error) {
    console.error("[CloudBase] Failed to update session:", error);
    return { error };
  }
}

/**
 * 获取会话消息 - 从 ai_conversations 中获取消息
 * @param sessionId - 会话ID
 * @param limit - 分页限制
 * @param offset - 分页偏移
 * @param agentId - 可选：用于多AI模式下过滤特定agent的消息
 */
export async function getGptMessages(
  sessionId: string,
  limit: number = 100,
  offset: number = 0,
  agentId?: string,
  filterByAgent: boolean = false
) {
  try {
    const db = getCloudBaseApp().database();
    const collection = db.collection("ai_conversations");

    // 获取指定会话
    const result = await collection.doc(sessionId).get();

    if (!result.data || result.data.length === 0) {
      return {
        data: [],
        error: null,
        count: 0,
      };
    }

    const conversation = result.data[0];
    const messages = conversation.messages || [];
    const sessionModel = conversation.model || 'gpt-3.5-turbo';

    // ========================================
    // 核心过滤逻辑（与send/route.ts保持一致）
    // filterByAgent=true: 按agentId过滤（用于send API，实现上下文隔离）
    // filterByAgent=false: 返回完整消息（用于history API，显示所有响应）
    // ========================================
    const filteredMessages = messages
      .map((msg: any) => {
        // 如果是多AI消息，需要处理
        if (msg.isMultiAI && Array.isArray(msg.content)) {
          if (filterByAgent && agentId) {
            // 模式1：按agentId过滤（用于send/route.ts的上下文隔离）
            const relevantResponses = msg.content.filter(
              (resp: any) => resp.agentId === agentId
            );

            // 如果找到该agentId的历史回复，保留
            if (relevantResponses.length > 0) {
              return {
                role: msg.role,
                content: relevantResponses.map((r: any) => r.content).join('\n'),
                agentId: agentId,
              };
            } else {
              // 该agentId在此多AI消息中没有回复，跳过
              return null;
            }
          } else if (!filterByAgent) {
            // 模式2：返回完整的多AI消息（用于history API）
            return {
              role: msg.role,
              isMultiAI: true,
              content: msg.content,
              model: sessionModel,
            };
          } else {
            // filterByAgent=true 但没有agentId，跳过多AI消息（保持隔离）
            return null;
          }
        } else if (!msg.isMultiAI) {
          // 单AI消息或用户消息，保留
          return {
            ...msg,
            model: sessionModel
          };
        }

        return null;
      })
      .filter((msg: any) => msg !== null); // 移除null项

    // 应用分页
    const paginatedMessages = filteredMessages.slice(offset, offset + limit);

    return {
      data: paginatedMessages,
      error: null,
      count: filteredMessages.length,
    };
  } catch (error) {
    console.error("[CloudBase] Failed to fetch messages:", error);
    return {
      data: null,
      error: error,
      count: 0,
    };
  }
}

/**
 * 保存消息 - 将消息添加到 ai_conversations 的 messages 数组
 */
export async function saveGptMessage(messageData: {
  session_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  tokens_used?: number;
}) {
  try {
    const db = getCloudBaseApp().database();
    const collection = db.collection("ai_conversations");

    const message = {
      role: messageData.role,
      content: messageData.content,
      timestamp: new Date().toISOString(),
      tokens_used: messageData.tokens_used || 0,
    };

    // 将消息追加到 messages 数组
    await collection.doc(messageData.session_id).update({
      messages: db.command.push(message),
      updated_at: new Date().toISOString(),
    });

    return {
      data: {
        _id: messageData.session_id,
        ...message,
      },
      error: null,
    };
  } catch (error) {
    console.error("[CloudBase] Failed to save message:", error);
    return {
      data: null,
      error: error,
    };
  }
}

/**
 * 保存多AI协作消息 - 将多个AI的响应作为一条消息保存
 */
export async function saveMultiAIMessage(messageData: {
  session_id: string;
  user_id: string;
  user_message: string;
  ai_responses: Array<{
    agentId: string;
    agentName: string;
    content: string;
    model: string;
    status: string;
    timestamp: Date;
  }>;
}) {
  try {
    const db = getCloudBaseApp().database();
    const collection = db.collection("ai_conversations");

    const messages = [
      {
        role: "user",
        content: messageData.user_message,
        timestamp: new Date().toISOString(),
        tokens_used: 0,
      },
      {
        role: "assistant",
        content: messageData.ai_responses,
        isMultiAI: true,
        timestamp: new Date().toISOString(),
      }
    ];

    // 将用户消息和多AI响应作为两条消息追加到 messages 数组
    await collection.doc(messageData.session_id).update({
      messages: db.command.push(...messages),
      updated_at: new Date().toISOString(),
    });

    return {
      data: {
        session_id: messageData.session_id,
        messages,
      },
      error: null,
    };
  } catch (error) {
    console.error("[CloudBase] Failed to save multi-AI message:", error);
    return {
      data: null,
      error: error,
    };
  }
}

/**
 * 删除会话的所有消息 - 清空 ai_conversations 的 messages 数组
 */
export async function deleteGptMessages(sessionId: string) {
  try {
    const db = getCloudBaseApp().database();
    const collection = db.collection("ai_conversations");

    await collection.doc(sessionId).update({
      messages: [],
      updated_at: new Date().toISOString(),
    });

    return { error: null };
  } catch (error) {
    console.error("[CloudBase] Failed to delete messages:", error);
    return { error };
  }
}
