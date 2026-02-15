"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { GPTWorkspace } from "@/components/gpt-workspace";
import { GPTLibrary } from "@/components/gpt-library";
import { ExportPanel } from "@/components/export-panel";
import { ChatHistory } from "@/components/chat-history";
import { ChatHistorySidebar } from "@/components/chat-history-sidebar";
import { Header } from "@/components/header";
import { AdDisplay } from "@/components/ad-display";
import { useApp } from "@/components/app-context";
import { useUser } from "@/components/user-context";
import {
  WorkspaceMessagesProvider,
  useWorkspaceMessages,
} from "@/components/workspace-messages-context";
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
  const [workspaceProcessing, setWorkspaceProcessing] = useState(false);
  const [collaborationMode, setCollaborationMode] = useState<
    "normal" | "parallel" | "sequential" | "deep" | "graph"
  >("parallel");

  const { activeView, setActiveView } = useApp();
  const { loading, refreshUser } = useUser();
  const {
    clearMessages,
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ isProcessing?: boolean }>;
      setWorkspaceProcessing(Boolean(custom.detail?.isProcessing));
    };
    window.addEventListener(
      "workspace-processing-state",
      handler as EventListener
    );
    return () => {
      window.removeEventListener(
        "workspace-processing-state",
        handler as EventListener
      );
    };
  }, []);

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
    if (workspaceProcessing) {
      toast.info("当前对话生成中，请先停止再切换会话");
      return;
    }
    setCurrentSessionId(null);
    setContextSessionId(undefined);
    clearMessages();
    setSelectedGPTs(availableAIs[0] ? [availableAIs[0]] : []);
  };

  // 选择历史对话
  const handleSessionSelect = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setContextSessionId(sessionId);
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
        isWorkspaceProcessing={workspaceProcessing}
      />

      {/* 悬浮广告 */}
      {activeView === "workspace" && (
        <>
          <AdDisplay position="top" />
          <AdDisplay position="bottom" />
          <AdDisplay position="left" />
          <AdDisplay position="right" />
        </>
      )}

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
                isWorkspaceProcessing={workspaceProcessing}
              />
            </div>

            {/* 中间对话区域 */}
            <div className="flex-1 flex flex-col bg-white relative h-full min-h-0 overflow-hidden">
              <div className="flex-1 flex flex-col min-h-0 relative">
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
                <div className="text-center py-1 px-1 text-[10px] text-gray-400 flex-shrink-0 bg-white">
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
