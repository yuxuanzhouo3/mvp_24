export interface AIResponse {
  agentId: string;
  agentName: string;
  content: string;
  tokens?: number;
  cost?: number;
  status: "pending" | "processing" | "completed" | "error";
  timestamp: Date;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string | AIResponse[];
  isMultiAI?: boolean;
  timestamp: Date;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  messageCount?: number; // 可选字段，用于从服务器加载时显示消息数量
  createdAt: Date;
  updatedAt: Date;
}
