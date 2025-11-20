/**
 * 统计用户在指定时间范围内的助手消息数
 * 用于检查免费用户的月度配额（50次/月）
 */

export interface Message {
  role: string;
  content: string | any[];
  timestamp?: string;
  [key: string]: any;
}

export interface Session {
  messages: Message[] | string; // 可能是数组或JSON字符串
  [key: string]: any;
}

/**
 * 计算用户在指定时间范围内的助手消息总数
 * @param sessions 会话数组
 * @param startOfMonth 时间范围起点
 * @returns 助手消息数
 */
export function countAssistantMessagesInMonth(
  sessions: Session[],
  startOfMonth: Date
): number {
  let count = 0;

  if (!sessions || !Array.isArray(sessions)) {
    return 0;
  }

  sessions.forEach((session: Session) => {
    if (!session) return;

    let messages: Message[] = [];

    // 处理 messages 可能是字符串或数组的情况
    if (typeof session.messages === "string") {
      try {
        messages = JSON.parse(session.messages);
      } catch (e) {
        console.error("[Usage Counter] Failed to parse messages JSON:", e);
        return;
      }
    } else if (Array.isArray(session.messages)) {
      messages = session.messages;
    }

    // 遍历消息，统计助手消息
    if (Array.isArray(messages)) {
      messages.forEach((msg: Message) => {
        // 检查是否是助手消息且有时间戳
        if (msg.role === "assistant" && msg.timestamp) {
          try {
            const msgTime = new Date(msg.timestamp);
            // 检查消息时间是否在本月内
            if (msgTime >= startOfMonth) {
              count++;
            }
          } catch (e) {
            console.error("[Usage Counter] Failed to parse message timestamp:", e);
          }
        }
      });
    }
  });

  return count;
}

/**
 * 格式化计数结果为用户友好的信息
 * @param used 已使用次数
 * @param limit 月度限额
 * @returns 格式化的字符串
 */
export function formatQuotaMessage(used: number, limit: number): string {
  const remaining = Math.max(0, limit - used);
  return `You have used ${used}/${limit} messages this month. ${remaining} remaining.`;
}
