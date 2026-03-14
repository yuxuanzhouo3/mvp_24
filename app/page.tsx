"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-context";
import { useUser } from "@/components/user-context";
import {
  WorkspaceMessagesProvider,
  useWorkspaceMessages,
} from "@/components/workspace-messages-context";
import { fetchClientAIConfig, type ClientAIAgent } from "@/lib/ai/client-config";
import { isChinaRegion } from "@/lib/config/region";
import { toast } from "sonner";
import { saveAuthState } from "@/lib/auth-state-manager";
import { SMART_AGENT_ID, SMART_MODEL_ID } from "@/lib/ai/smart-model-router";
import { localizeSmartAgent } from "@/lib/ai/smart-model-localization";
import { useLanguage } from "@/components/language-provider";

type AIAgent = ClientAIAgent;

const WECHAT_PRIVACY_SESSION_KEY = "wechat_privacy_consent";

function PageLoadingFallback({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center bg-white dark:bg-[#11131a]">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}

const GPTWorkspace = dynamic(
  () => import("@/components/gpt-workspace").then((mod) => mod.GPTWorkspace),
  {
    loading: () => <PageLoadingFallback label="正在加载对话工作区..." />,
  }
);

const GPTLibrary = dynamic(
  () => import("@/components/gpt-library").then((mod) => mod.GPTLibrary),
  {
    loading: () => <PageLoadingFallback label="正在加载模型库..." />,
  }
);

const ExportPanel = dynamic(
  () => import("@/components/export-panel").then((mod) => mod.ExportPanel),
  {
    loading: () => <PageLoadingFallback label="正在加载导出面板..." />,
  }
);

const ChatHistory = dynamic(
  () => import("@/components/chat-history").then((mod) => mod.ChatHistory),
  {
    loading: () => <PageLoadingFallback label="正在加载历史记录..." />,
  }
);

const ChatHistorySidebar = dynamic(
  () =>
    import("@/components/chat-history-sidebar").then(
      (mod) => mod.ChatHistorySidebar
    ),
  {
    loading: () => (
      <div className="hidden h-full sm:block sm:w-[320px] sm:min-w-[320px] sm:border-r sm:border-gray-200 sm:bg-white dark:sm:border-gray-800 dark:sm:bg-[#0f1117]" />
    ),
  }
);

const Header = dynamic(
  () => import("@/components/header").then((mod) => mod.Header),
  {
    loading: () => (
      <div className="h-16 border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-[#0b0d12]" />
    ),
  }
);

const AdDisplay = dynamic(
  () => import("@/components/ad-display").then((mod) => mod.AdDisplay),
  {
    loading: () => null,
  }
);

function PlatformContent() {
  const [selectedGPTs, setSelectedGPTs] = useState<AIAgent[]>([]);
  const [availableAIs, setAvailableAIs] = useState<AIAgent[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [workspaceProcessing, setWorkspaceProcessing] = useState(false);
  const [collaborationMode, setCollaborationMode] = useState<
    "normal" | "parallel" | "sequential" | "deep" | "graph"
  >("normal");

  const { activeView, setActiveView } = useApp();
  const { loading, refreshUser } = useUser();
  const { language } = useLanguage();
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
        const agreeToPrivacy =
          window.sessionStorage.getItem(WECHAT_PRIVACY_SESSION_KEY) === "1";
        if (isChinaRegion() && !agreeToPrivacy) {
          toast.error("请先在登录页勾选隐私协议后再使用微信登录");
          return;
        }
        console.log("🚀 [Home] 正在使用小程序 code 登录:", code);
        const response = await fetch("/api/wxlogin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            nickName: profile?.nickName,
            avatarUrl: profile?.avatarUrl,
            agreeToPrivacy,
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

  const resolveDefaultAgent = useCallback(
    (agents: AIAgent[]) => {
      if (!Array.isArray(agents) || agents.length === 0) return null;
      const smartAgent =
        agents.find(
          (agent) => agent.id === SMART_AGENT_ID || agent.model === SMART_MODEL_ID
        ) || null;
      if (smartAgent) {
        return smartAgent;
      }
      if (!isChinaRegion()) {
        return (
          agents.find(
            (agent) =>
              agent.model === "x-ai/grok-4.1-fast" || agent.id === "x-ai/grok-4.1-fast"
          ) || agents[0]
        );
      }
      return agents[0];
    },
    []
  );

  const loadAvailableAIs = useCallback(async () => {
    try {
      const data = await fetchClientAIConfig();
      const agents = Array.isArray(data.agents)
        ? data.agents.map((agent) => localizeSmartAgent(agent, language))
        : [];
      setAvailableAIs(agents);

      const defaultAgent = resolveDefaultAgent(agents);
      if (defaultAgent) {
        setSelectedGPTs([defaultAgent]);
      }
    } catch (error) {
      console.error("加载AI配置失败:", error);
      toast.error("加载AI配置失败");
    }
  }, [language, resolveDefaultAgent]);

  // 从API加载可用的AI模型
  useEffect(() => {
    void loadAvailableAIs();
  }, [loadAvailableAIs]);

  useEffect(() => {
    setAvailableAIs((prev) => prev.map((agent) => localizeSmartAgent(agent, language)));
    setSelectedGPTs((prev) => prev.map((agent) => localizeSmartAgent(agent, language)));
  }, [language]);

  // 同步 Context 的 sessionId 到本地 state
  useEffect(() => {
    if (contextSessionId && contextSessionId !== currentSessionId) {
      setCurrentSessionId(contextSessionId);
    }
  }, [contextSessionId, currentSessionId]);

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

  // 新建对话
  const handleNewChat = () => {
    if (workspaceProcessing) {
      toast.info("当前对话生成中，请先停止再切换会话");
      return;
    }
    setCurrentSessionId(null);
    setContextSessionId(undefined);
    clearMessages();
    setCollaborationMode("normal");
    const defaultAgent = resolveDefaultAgent(availableAIs);
    setSelectedGPTs(defaultAgent ? [defaultAgent] : []);
  };

  // 选择历史对话
  const handleSessionSelect = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setContextSessionId(sessionId);
  };
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-[#0a0c12] dark:to-[#141924]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-100 dark:bg-[#0b0d12] flex flex-col overflow-hidden">
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
            <div className="flex-1 flex flex-col bg-white dark:bg-[#11131a] relative h-full min-h-0 overflow-hidden">
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
                <div className="text-center py-1 px-1 text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 bg-white dark:bg-[#11131a]">
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-[#0a0c12] dark:to-[#141924]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">加载中...</p>
        </div>
      </div>
    }>
      <WorkspaceMessagesProvider>
        <PlatformContent />
      </WorkspaceMessagesProvider>
    </Suspense>
  );
}
