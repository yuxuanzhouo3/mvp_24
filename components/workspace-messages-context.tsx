"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

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
  const [isHydrated, setIsHydrated] = useState(false);

  // 在客户端水合时加载 localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const savedMessages = localStorage.getItem("workspace-messages");
      const savedSessionId = localStorage.getItem("workspace-session-id");

      console.log("🔄 [WorkspaceMessagesProvider] 从 localStorage 加载数据...");

      if (savedMessages) {
        try {
          const parsedMessages = JSON.parse(savedMessages);
          const restoredMessages = parsedMessages.map((msg: any) => {
            // 确保 content 字段被正确处理
            let restoredContent: string | AIResponse[];
            if (msg.isMultiAI && Array.isArray(msg.content)) {
              // 多AI响应：恢复为 AIResponse 数组
              restoredContent = msg.content.map((aiResp: any) => ({
                ...aiResp,
                timestamp: new Date(aiResp.timestamp),
              }));
            } else {
              // 普通文本内容
              restoredContent = msg.content;
            }

            return {
              ...msg,
              timestamp: new Date(msg.timestamp),
              content: restoredContent,
            };
          });
          setMessages(restoredMessages);
          console.log("✅ 成功加载", restoredMessages.length, "条消息");
        } catch (error) {
          console.error("❌ 解析消息失败:", error);
          localStorage.removeItem("workspace-messages");
        }
      }

      if (savedSessionId) {
        setCurrentSessionId(savedSessionId);
        console.log("✅ 成功加载会话 ID:", savedSessionId);
      }
    } catch (error) {
      console.error("❌ 加载 localStorage 数据失败:", error);
    }

    setIsHydrated(true);
  }, []);

  // 当消息改变时保存到 localStorage
  useEffect(() => {
    if (!isHydrated) return;

    try {
      if (messages.length > 0) {
        localStorage.setItem("workspace-messages", JSON.stringify(messages));
        console.log("💾 已保存", messages.length, "条消息到 localStorage");
      }
    } catch (error) {
      console.error("❌ 保存消息到 localStorage 失败:", error);
    }
  }, [messages, isHydrated]);

  // 当会话 ID 改变时保存到 localStorage
  useEffect(() => {
    if (!isHydrated) return;

    try {
      if (currentSessionId) {
        localStorage.setItem("workspace-session-id", currentSessionId);
        console.log("💾 已保存会话 ID 到 localStorage:", currentSessionId);
      }
    } catch (error) {
      console.error("❌ 保存会话 ID 失败:", error);
    }
  }, [currentSessionId, isHydrated]);

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
    localStorage.removeItem("workspace-messages");
    localStorage.removeItem("workspace-session-id");
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
