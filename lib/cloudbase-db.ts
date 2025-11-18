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
  model: string
) {
  try {
    const db = getCloudBaseApp().database();
    const collection = db.collection("ai_conversations");

    const now = new Date().toISOString();
    const sessionData = {
      user_id: userId,
      title: title.trim(),
      model,
      created_at: now,
      updated_at: now,
    };

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
 */
export async function getGptMessages(
  sessionId: string,
  limit: number = 100,
  offset: number = 0
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

    // 应用分页
    const paginatedMessages = messages.slice(offset, offset + limit);

    return {
      data: paginatedMessages,
      error: null,
      count: messages.length,
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
