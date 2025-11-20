"use client";

import { useState, useEffect } from "react";
import { GPTWorkspace } from "@/components/gpt-workspace";
import { GPTLibrary } from "@/components/gpt-library";
import { ExportPanel } from "@/components/export-panel";
import { ChatHistory } from "@/components/chat-history";
import { ChatHistorySidebar } from "@/components/chat-history-sidebar";
import { Header } from "@/components/header";
import { useApp } from "@/components/app-context";
import { useUser } from "@/components/user-context";
import {
  WorkspaceMessagesProvider,
  useWorkspaceMessages,
} from "@/components/workspace-messages-context";
import { getClientAuthToken } from "@/lib/client-auth";
import { isChinaRegion } from "@/lib/config/region";
import { toast } from "sonner";

interface AIAgent {
  id: string;
  name: string;
  provider: string;
  model: string;
  description: string;
  capabilities: string[];
  maxTokens?: number;
  temperature?: number;
  icon?: string;
}

function PlatformContent() {
  const [selectedGPTs, setSelectedGPTs] = useState<AIAgent[]>([]);
  const [availableAIs, setAvailableAIs] = useState<AIAgent[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const { activeView, setActiveView } = useApp();
  const { loading } = useUser();
  const {
    clearMessages,
    setMessages,
    currentSessionId: contextSessionId,
    setCurrentSessionId: setContextSessionId,
  } = useWorkspaceMessages();

  // 从API加载可用的AI模型
  useEffect(() => {
    loadAvailableAIs();
  }, []);

  // 同步 Context 的 sessionId 到本地 state
  useEffect(() => {
    if (contextSessionId && contextSessionId !== currentSessionId) {
      setCurrentSessionId(contextSessionId);
    }
  }, [contextSessionId]);

  const loadAvailableAIs = async () => {
    try {
      const res = await fetch("/api/config/ai");
      if (!res.ok) {
        throw new Error("Failed to load AI config");
      }
      const data = await res.json();
      setAvailableAIs(data.agents || []);

      // 默认选择第一个AI
      if (data.agents && data.agents.length > 0) {
        setSelectedGPTs([data.agents[0]]);
      }
    } catch (error) {
      console.error("加载AI配置失败:", error);
      toast.error("加载AI配置失败");
    }
  };

  // 新建对话
  const handleNewChat = () => {
    setCurrentSessionId(null);
    setContextSessionId(undefined);
    clearMessages();
  };

  // 选择历史对话 - 加载对话消息
  const handleSessionSelect = async (sessionId: string) => {
    try {
      setCurrentSessionId(sessionId);
      setContextSessionId(sessionId);

      // 获取认证 token
      const { token, error: authError } = await getClientAuthToken();
      if (authError || !token) {
        console.error("未登录:", authError);
        toast.error("请先登录");
        return;
      }

      // 加载该会话的消息
      const response = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const messages = (data.messages || []).map((msg: any) => {
        // 检查是否是多AI消息
        if (msg.isMultiAI && Array.isArray(msg.content)) {
          // 多AI消息：content 是 AIResponse[] 数组
          return {
            id: msg.id || `msg-${Date.now()}-${Math.random()}`,
            role: msg.role,
            content: msg.content.map((aiResponse: any) => ({
              agentId: aiResponse.agentId,
              agentName: aiResponse.agentName,
              content: aiResponse.content,
              status: aiResponse.status || "completed",
              timestamp: new Date(aiResponse.timestamp || Date.now()),
            })),
            isMultiAI: true,
            timestamp: new Date(msg.timestamp || msg.created_at || Date.now()),
          };
        }

        // 单AI消息：保持原有逻辑
        const aiAgent = availableAIs.find((ai) => ai.model === msg.model);

        return {
          id: msg.id || `msg-${Date.now()}-${Math.random()}`,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.created_at || Date.now()),
          model: msg.model,
          agentName: aiAgent?.name || msg.model,
          tokens: msg.tokens_used,
          cost: msg.cost_usd,
        };
      });

      setMessages(messages);
    } catch (error) {
      console.error("加载历史对话失败:", error);
      toast.error("加载历史对话失败");
    }
  };
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <Header
        activeView={activeView}
        setActiveView={setActiveView}
        currentSessionId={currentSessionId}
        onSessionSelect={handleSessionSelect}
        onNewChat={handleNewChat}
      />

      {/* 主体布局 - 根据 activeView 显示不同视图 */}
      {activeView === "workspace" && (
        <div className="flex h-[calc(100vh-64px)]">
          {/* 左侧历史对话 - 移动端隐藏 */}
          <div className="hidden sm:block">
            <ChatHistorySidebar
              currentSessionId={currentSessionId}
              onSessionSelect={handleSessionSelect}
              onNewChat={handleNewChat}
            />
          </div>

          {/* 中间对话区域 */}
          <div className="flex-1 flex flex-col bg-white relative h-full">
            <div className="flex-1 overflow-hidden">
              <GPTWorkspace
                selectedGPTs={selectedGPTs}
                setSelectedGPTs={setSelectedGPTs}
                availableAIs={availableAIs}
              />
            </div>
            {/* 备案信息 - 聊天框下方 */}
            {isChinaRegion() && (
              <div className="text-center py-0.5 px-1 text-[10px] text-gray-400 flex-shrink-0">
                粤ICP备2024281756号-3
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === "library" && (
        <main className="h-[calc(100vh-64px)] overflow-auto">
          <GPTLibrary
            selectedGPTs={selectedGPTs}
            setSelectedGPTs={setSelectedGPTs}
            collaborationMode={
              selectedGPTs.length >= 2 ? "parallel" : "sequential"
            }
            setCollaborationMode={() => {}}
          />
        </main>
      )}

      {activeView === "export" && (
        <main className="h-[calc(100vh-64px)] overflow-auto">
          <ExportPanel selectedGPTs={selectedGPTs} />
        </main>
      )}

      {activeView === "history" && (
        <main className="h-[calc(100vh-64px)] overflow-auto">
          <ChatHistory />
        </main>
      )}
    </div>
  );
}

export default function MultiGPTPlatform() {
  return (
    <WorkspaceMessagesProvider>
      <PlatformContent />
    </WorkspaceMessagesProvider>
  );
}
