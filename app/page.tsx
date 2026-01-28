"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
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
import { saveAuthState } from "@/lib/auth-state-manager";

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
  const [collaborationMode, setCollaborationMode] = useState<
    "parallel" | "sequential" | "deep" | "graph"
  >("parallel");

  const { activeView, setActiveView } = useApp();
  const { loading, refreshUser } = useUser();
  const {
    clearMessages,
    setMessages,
    currentSessionId: contextSessionId,
    setCurrentSessionId: setContextSessionId,
  } = useWorkspaceMessages();
  const searchParams = useSearchParams();

  // 小程序登录处理函数
  const handleMiniProgramLogin = useCallback(
    async (code: string, profile?: { nickName?: string; avatarUrl?: string }) => {
      try {
        console.log("🚀 [Home] 正在使用小程序 code 登录:", code);
        const response = await fetch("/api/wxlogin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            nickName: profile?.nickName,
            avatarUrl: profile?.avatarUrl,
          }),
        });
        const data = await response.json();

        if (data.ok && data.token) {
          const { token, refreshToken, userInfo } = data;
          saveAuthState(
            token,
            refreshToken || "",
            {
              id: userInfo?.id || "",
              email: userInfo?.email || `miniprogram_${userInfo?.openid}@local.wechat`,
              name: profile?.nickName || userInfo?.nickname || "微信用户",
              avatar: profile?.avatarUrl || userInfo?.avatar || "",
            },
            {
              accessTokenExpiresIn: 3600,
              refreshTokenExpiresIn: 7 * 24 * 3600,
            }
          );
          console.log("✅ [Home] 小程序登录成功");
          await refreshUser();
          toast.success("登录成功");
        } else {
          console.error("❌ [Home] 登录失败:", data.error);
          toast.error(data.error || "微信登录失败");
        }
      } catch (err) {
        console.error("❌ [Home] 小程序登录异常:", err);
        toast.error("微信登录异常，请稍后重试");
      }
    },
    [refreshUser]
  );

  // 检测小程序登录回调参数，直接在主页处理登录
  useEffect(() => {
    const mpCode = searchParams.get("mpCode");
    if (mpCode) {
      const mpNickName = searchParams.get("mpNickName");
      const mpAvatarUrl = searchParams.get("mpAvatarUrl");

      // 清除 URL 参数，避免重复触发
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete("mpCode");
      currentUrl.searchParams.delete("mpNickName");
      currentUrl.searchParams.delete("mpAvatarUrl");
      currentUrl.searchParams.delete("mpProfileTs");
      window.history.replaceState({}, "", currentUrl.toString());

      // 直接处理登录
      handleMiniProgramLogin(mpCode, {
        nickName: mpNickName || undefined,
        avatarUrl: mpAvatarUrl || undefined,
      });
    }
  }, [searchParams, handleMiniProgramLogin]);

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
    setSelectedGPTs([]);
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
              model: aiResponse.model,
              nodeId: aiResponse.nodeId,
              nodeTitle: aiResponse.nodeTitle,
              dependsOn: aiResponse.dependsOn,
              tokens: aiResponse.tokens,
              cost: aiResponse.cost,
              status: aiResponse.status || "completed",
              timestamp: new Date(aiResponse.timestamp || Date.now()),
            })),
            isMultiAI: true,
            taskGraph: msg.taskGraph,
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
    <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
      {/* Header */}
      <Header
        activeView={activeView}
        setActiveView={setActiveView}
        currentSessionId={currentSessionId}
        onSessionSelect={handleSessionSelect}
        onNewChat={handleNewChat}
      />

      {/* 主体布局 - 根据 activeView 显示不同视图 */}
      <main className="flex-1 min-h-0 relative">
        {activeView === "workspace" && (
          <div className="flex h-full overflow-hidden">
            {/* 左侧历史对话 - 移动端隐藏 */}
            <div className="hidden sm:block h-full">
              <ChatHistorySidebar
                currentSessionId={currentSessionId}
                onSessionSelect={handleSessionSelect}
                onNewChat={handleNewChat}
              />
            </div>

            {/* 中间对话区域 */}
            <div className="flex-1 flex flex-col bg-white relative h-full min-h-0 overflow-hidden">
              <div className="flex-1 flex flex-col min-h-0">
                <GPTWorkspace
                  selectedGPTs={selectedGPTs}
                  setSelectedGPTs={setSelectedGPTs}
                  availableAIs={availableAIs}
                  collaborationMode={collaborationMode}
                  setCollaborationMode={setCollaborationMode}
                />
              </div>
              {/* 备案信息 - 聊天框下方 */}
              {isChinaRegion() && (
                <div className="text-center py-1 px-1 text-[10px] text-gray-400 flex-shrink-0 bg-white border-t border-gray-50">
                  <div className="mb-0.5">本页面含AI生成的内容，请仔细辨别</div>
                  <div>粤ICP备2024281756号-3</div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === "library" && (
          <div className="h-full overflow-auto">
            <GPTLibrary
              selectedGPTs={selectedGPTs}
              setSelectedGPTs={setSelectedGPTs}
              collaborationMode={collaborationMode}
              setCollaborationMode={setCollaborationMode}
            />
          </div>
        )}

        {activeView === "export" && (
          <div className="h-full overflow-auto">
            <ExportPanel selectedGPTs={selectedGPTs} />
          </div>
        )}

        {activeView === "history" && (
          <div className="h-full overflow-auto">
            <ChatHistory />
          </div>
        )}
      </main>
    </div>
  );
}

export default function MultiGPTPlatform() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    }>
      <WorkspaceMessagesProvider>
        <PlatformContent />
      </WorkspaceMessagesProvider>
    </Suspense>
  );
}
