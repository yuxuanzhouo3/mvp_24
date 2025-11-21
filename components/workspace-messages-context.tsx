"use client";

import React, { createContext, useContext, useState } from "react";

interface AIResponse {
  agentId: string;
  agentName: string;
  content: string;
  tokens?: number;
  cost?: number;
  status: "pending" | "processing" | "completed" | "error";
  timestamp: Date;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string | AIResponse[];
  isMultiAI?: boolean;
  timestamp: Date;
}

interface WorkspaceMessagesContextType {
  messages: Message[];
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  currentSessionId: string | undefined;
  setCurrentSessionId: (id: string | undefined) => void;
  clearMessages: () => void;
}

const WorkspaceMessagesContext = createContext<
  WorkspaceMessagesContextType | undefined
>(undefined);

export function WorkspaceMessagesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<
    string | undefined
  >();

  const addMessage = (message: Message) => {
    setMessages((prev) => {
      // 防止重复添加相同ID的消息
      if (prev.some(m => m.id === message.id)) {
        console.warn("⚠️ 消息已存在，跳过添加:", message.id);
        return prev;
      }
      return [...prev, message];
    });
  };

  const clearMessages = () => {
    setMessages([]);
    setCurrentSessionId(undefined);
    console.log("🗑️ 已清空所有消息和会话数据");
  };

  return (
    <WorkspaceMessagesContext.Provider
      value={{
        messages,
        setMessages,
        addMessage,
        currentSessionId,
        setCurrentSessionId,
        clearMessages,
      }}
    >
      {children}
    </WorkspaceMessagesContext.Provider>
  );
}

export function useWorkspaceMessages() {
  const context = useContext(WorkspaceMessagesContext);
  if (!context) {
    throw new Error(
      "useWorkspaceMessages must be used within WorkspaceMessagesProvider"
    );
  }
  return context;
}
