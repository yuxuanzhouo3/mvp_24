"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Bot,
  User,
  Loader2,
  AlertCircle,
  Zap,
  Users,
  ArrowRight,
  Clock,
  CheckCircle2,
  Brain,
  GitBranch,
  Lightbulb,
  Target,
  Paperclip,
  Volume2,
  Camera,
  MapPin,
  Mic,
  Video,
  ChevronDown,
  Layers,
  ListOrdered,
  Copy,
  Share2,
  Download,
  X,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import { getClientAuthToken } from "@/lib/client-auth";
import { useWorkspaceMessages } from "@/components/workspace-messages-context";
import { ChatToolbar } from "@/components/chat-toolbar";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { TASK_GRAPH_PRESETS } from "@/data/task-graph-presets";
import {
  clearPendingFavoriteScroll,
  peekPendingFavoriteScroll,
  useMessageFavorites,
} from "@/hooks/use-message-favorites";
import {
  topoLayers,
  type TaskGraphExecutionRun,
  type TaskGraphSpec,
} from "@/types/task-graph";

interface AIResponse {
  agentId: string;
  agentName: string;
  content: string;
  model?: string;
  tokens?: number;
  cost?: number;
  status: "pending" | "processing" | "completed" | "error";
  timestamp: Date;
  nodeId?: string;
  nodeTitle?: string;
  dependsOn?: string[];
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string | AIResponse[];
  isMultiAI?: boolean;
  taskGraph?: { spec: TaskGraphSpec; run?: TaskGraphExecutionRun };
  timestamp: Date;
}

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

interface GPTWorkspaceProps {
  selectedGPTs: AIAgent[];
  setSelectedGPTs: (gpts: AIAgent[]) => void;
  availableAIs: AIAgent[];
  collaborationMode: "parallel" | "sequential" | "deep" | "graph";
  setCollaborationMode: (mode: "parallel" | "sequential" | "deep" | "graph") => void;
}

export function GPTWorkspace({
  selectedGPTs,
  setSelectedGPTs,
  availableAIs,
  collaborationMode,
  setCollaborationMode,
}: GPTWorkspaceProps) {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiResponses, setAIResponses] = useState<AIResponse[]>([]);
  const [activeTaskGraphSpec, setActiveTaskGraphSpec] = useState<TaskGraphSpec | null>(null);
  const [taskGraphPresetId, setTaskGraphPresetId] = useState<string>(TASK_GRAPH_PRESETS[0]?.id || "general");
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [sessionConfig, setSessionConfig] = useState<any>(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [taskGraphNavOpen, setTaskGraphNavOpen] = useState(true);
  const [taskGraphNavDismissed, setTaskGraphNavDismissed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { language } = useLanguage();
  const t = useTranslations(language);

  const favorites = useMessageFavorites();

  const getMessageAnchorId = (messageId: string) => `chat-message-${messageId}`;

  const buildFavoriteId = (sessionId: string | undefined, anchorId: string) =>
    `${sessionId || "no-session"}:${anchorId}`;

  const getTaskGraphNodeAnchorId = (messageId: string, nodeId: string) =>
    `task-graph-${messageId}-node-${nodeId}`;

  const effectiveCollaborationMode: "parallel" | "sequential" | "deep" | "graph" =
    sessionConfig?.collaborationMode === "sequential"
      ? "sequential"
      : sessionConfig?.collaborationMode === "parallel"
        ? "parallel"
        : sessionConfig?.collaborationMode === "deep"
          ? "deep"
          : sessionConfig?.collaborationMode === "graph"
            ? "graph"
            : collaborationMode;

  // 使用全局 Context 管理消息和会话 ID
  const {
    messages,
    setMessages,
    addMessage,
    currentSessionId,
    setCurrentSessionId,
    clearMessages,
  } = useWorkspaceMessages();

  // 检测用户是否手动向上滚动
  const handleChatScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
    setShouldAutoScroll(isNearBottom);
  };

  // 在消息或 AI 回复更新时滚动到底部（如果用户未手动向上滚动）
  useEffect(() => {
    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, aiResponses, shouldAutoScroll]);

  // 从“收藏对话”点击进入会话后，自动滚动到收藏的那条消息
  useEffect(() => {
    if (!currentSessionId) return;
    const pending = peekPendingFavoriteScroll();
    if (!pending) return;
    if (pending.sessionId !== currentSessionId) return;

    // Prevent auto-scroll-to-bottom from fighting the jump.
    setShouldAutoScroll(false);

    const tryScroll = () => {
      const el = document.getElementById(pending.anchorId);
      if (!el) return false;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      clearPendingFavoriteScroll();
      return true;
    };

    // Try immediately; if messages haven't rendered yet, retry for a short window.
    if (tryScroll()) return;

    let attempts = 0;
    const maxAttempts = 25; // ~5s at 200ms
    const intervalMs = 200;
    const intervalId = window.setInterval(() => {
      attempts += 1;
      if (tryScroll()) {
        window.clearInterval(intervalId);
        return;
      }
      if (attempts >= maxAttempts) {
        window.clearInterval(intervalId);
      }
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [currentSessionId, messages]);

  // 当会话ID改变时，从数据库加载历史消息
  useEffect(() => {
    const loadMessagesFromDatabase = async () => {
      if (!currentSessionId) return;

      try {
        const { token } = await getClientAuthToken();
        if (!token) return;

        const response = await fetch(
          `/api/chat/sessions/${currentSessionId}/messages`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          console.error("Failed to load messages:", response.status);
          return;
        }

        const data = await response.json();
        const loadedMessages = data.messages || [];
        const loadedSessionConfig = data.sessionConfig || null;

        // 转换数据库消息格式为前端格式
        const formattedMessages = loadedMessages.map((msg: any) => ({
          id: msg.id || `msg-${Date.now()}-${Math.random()}`,
          role: msg.role,
          content: msg.isMultiAI && Array.isArray(msg.content)
            ? msg.content.map((r: any) => ({
                agentId: r.agentId,
                agentName: r.agentName,
                content: r.content || "",
                model: r.model,
                tokens: r.tokens || 0,
                cost: r.cost || 0,
                status: "completed" as const,
                timestamp: new Date(r.timestamp),
                nodeId: r.nodeId,
                nodeTitle: r.nodeTitle,
                dependsOn: r.dependsOn,
              }))
            : msg.content,
          isMultiAI: msg.isMultiAI || false,
          taskGraph: msg.taskGraph,
          timestamp: new Date(msg.timestamp),
        }));

        // 如果数据库消息为空且当前正在处理，说明是新会话刚开始
        // 不要用空数组覆盖本地的消息，防止"AI已就绪"界面闪现
        if (formattedMessages.length === 0 && isProcessing) {
          console.log("[GPTWorkspace] Skipping empty message load during active processing");
          // 只加载会话配置，不更新消息列表
          if (loadedSessionConfig) {
            setSessionConfig(loadedSessionConfig);
          }
          return;
        }

        // 直接设置数据库消息（切换会话时替换本地消息）
        setMessages(formattedMessages);

        // 加载会话配置（用于显示AI锁定状态）
        if (loadedSessionConfig) {
          setSessionConfig(loadedSessionConfig);
          console.log("[GPTWorkspace] Loaded session config:", loadedSessionConfig);

          // 如果是多AI会话，恢复之前选择的AI
          if (loadedSessionConfig.isMultiAI && loadedSessionConfig.selectedAgentIds) {
            const restoredAIs = loadedSessionConfig.selectedAgentIds
              .map((agentId: string) =>
                availableAIs.find((ai) => ai.id === agentId)
              )
              .filter((ai: any) => ai !== undefined);

            if (restoredAIs.length > 0) {
              setSelectedGPTs(restoredAIs);
              console.log("[GPTWorkspace] Restored selected AIs:", restoredAIs);
            }
          }
        } else {
          setSessionConfig(null);
        }

        console.log(
          "[GPTWorkspace] Loaded",
          formattedMessages.length,
          "messages from database"
        );
      } catch (error) {
        console.error("[GPTWorkspace] Failed to load messages from database:", error);
      }
    };

    loadMessagesFromDatabase();
  }, [currentSessionId, availableAIs]);

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    if (selectedGPTs.length === 0) {
      toast.error(t.workspace.selectAI);
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    addMessage(userMessage);
    setInput("");
    setIsProcessing(true);
    setError(null);

    try {
      // 获取认证 Token（支持 CloudBase 和 Supabase）
      const { token: authToken, error: authError } = await getClientAuthToken();

      if (authError || !authToken) {
        toast.error("请先登录", {
          description: "您需要登录后才能使用 AI 对话功能",
        });
        setIsProcessing(false);
        return;
      }

      // 检查额度
      try {
        const usageRes = await fetch("/api/user/usage", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (usageRes.ok) {
          const usageData = await usageRes.json();
          if (usageData.plan === "free" && usageData.used >= usageData.limit) {
            // 触发订阅弹窗
            window.dispatchEvent(new CustomEvent("show-subscription-modal"));
            setIsProcessing(false);
            return;
          }
        }
      } catch (e) {
        console.error("Failed to check usage before sending:", e);
      }

      // 如果没有sessionId，先创建会话
      let sessId = currentSessionId;
      let isNewSession = false;
      if (!sessId) {
        isNewSession = true;
        sessId = await createSession(authToken, userMessage.content as string);
        setCurrentSessionId(sessId);
      }

      // ✅ 改进：使用 sessionConfig 中锁定的 AI，而不是当前的 selectedGPTs
      // 这样确保一旦创建会话，就不能再改 AI
      // 对于新建会话，必须使用 selectedGPTs（sessionConfig还没有更新）
      const lockedAgentIds = !isNewSession && sessionConfig?.selectedAgentIds
                             ? sessionConfig.selectedAgentIds
                             : selectedGPTs.map((gpt: AIAgent) => gpt.id);

      const lockedAIs = lockedAgentIds
        .map((agentId: string) => availableAIs.find((ai: AIAgent) => ai.id === agentId))
        .filter((ai: AIAgent | undefined): ai is AIAgent => ai !== undefined);

      if (lockedAIs.length === 0) {
        toast.error("No AI selected", {
          description: "Please select at least one AI",
        });
        setIsProcessing(false);
        return;
      }

      if (effectiveCollaborationMode === "graph") {
        const preset =
          TASK_GRAPH_PRESETS.find((p) => p.id === taskGraphPresetId) ??
          TASK_GRAPH_PRESETS[0];

        const { spec, run, nodeResponses } = await handleTaskGraphMode(
          sessId,
          authToken,
          userMessage.content as string,
          lockedAIs,
          preset?.templateHint
        );

        const finalMessage: Message = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: nodeResponses,
          isMultiAI: true,
          taskGraph: { spec, run },
          timestamp: new Date(),
        };

        setIsProcessing(false);
        setAIResponses([]);
        setActiveTaskGraphSpec(null);
        addMessage(finalMessage);

        if (sessId) {
          try {
            const saveResponse = await fetch("/api/chat/save-multi-ai", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authToken}`,
              },
              body: JSON.stringify({
                sessionId: sessId,
                userMessage: userMessage.content,
                aiResponses: nodeResponses.map((r) => ({
                  agentId: r.agentId,
                  agentName: r.agentName,
                  content: r.content,
                  model: r.model || availableAIs.find((ai) => ai.id === r.agentId)?.model || "",
                  status: r.status,
                  timestamp: r.timestamp,
                  nodeId: r.nodeId,
                  nodeTitle: r.nodeTitle,
                  dependsOn: r.dependsOn,
                })),
                taskGraph: { spec, run },
              }),
            });

            if (!saveResponse.ok) {
              console.error("[GPTWorkspace] Failed to save task-graph message");
            }
          } catch (error) {
            console.error("[GPTWorkspace] Error saving task-graph message:", error);
          }
        }
      } else {
        setActiveTaskGraphSpec(null);

        // 初始化AI响应状态（使用锁定的AI）
        const initialResponses: AIResponse[] = lockedAIs.map((gpt: AIAgent) => ({
          agentId: gpt.id,
          agentName: gpt.name,
          content: "",
          status: "pending",
          timestamp: new Date(),
        }));
        setAIResponses(initialResponses);

        if (effectiveCollaborationMode === "parallel") {
        // 并行模式：多个AI同时处理（使用锁定的AI）
        const finalResponses = await handleParallelMode(
          sessId,
          authToken,
          userMessage.content as string,
          initialResponses
        );

        // 保存多AI响应为一条消息
        const finalMessage: Message = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: finalResponses,
          isMultiAI: true,
          timestamp: new Date(),
        };
        console.log("[GPTWorkspace] Adding final message:", finalMessage);
        console.log("[GPTWorkspace] Final responses:", finalResponses);

        // 先清除协作状态，避免闪烁
        setIsProcessing(false);
        setAIResponses([]);

        // 然后添加最终消息
        addMessage(finalMessage);

        // 保存消息到数据库（统一使用多AI保存API）
        if (sessId) {
          try {
            const saveResponse = await fetch("/api/chat/save-multi-ai", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authToken}`,
              },
              body: JSON.stringify({
                sessionId: sessId,
                userMessage: userMessage.content,
                aiResponses: finalResponses.map((r) => ({
                  agentId: r.agentId,
                  agentName: r.agentName,
                  content: r.content,
                  model:
                    r.model ||
                    availableAIs.find((ai) => ai.id === r.agentId)?.model ||
                    "",
                  status: r.status,
                  timestamp: r.timestamp,
                })),
              }),
            });

            if (!saveResponse.ok) {
              console.error("[GPTWorkspace] Failed to save multi-AI message");
            }
          } catch (error) {
            console.error("[GPTWorkspace] Error saving multi-AI message:", error);
          }
        }
        } else if (effectiveCollaborationMode === "deep") {
        // 深度思考模式：在提示词中加入深度思考指令
        const deepThinkingPrompt = `请进行深度思考并给出详尽的回答。在回答之前，请先在脑海中进行多维度的分析和推理。\n\n用户问题：${userMessage.content}`;
        
        const finalResponses = await handleParallelMode(
          sessId,
          authToken,
          deepThinkingPrompt,
          initialResponses
        );

        // 保存多AI响应为一条消息
        const finalMessage: Message = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: finalResponses,
          isMultiAI: true,
          timestamp: new Date(),
        };

        setIsProcessing(false);
        setAIResponses([]);
        addMessage(finalMessage);

        if (sessId) {
          try {
            await fetch("/api/chat/save-multi-ai", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authToken}`,
              },
              body: JSON.stringify({
                sessionId: sessId,
                userMessage: userMessage.content,
                aiResponses: finalResponses.map((r) => ({
                  agentId: r.agentId,
                  agentName: r.agentName,
                  content: r.content,
                  model:
                    r.model ||
                    availableAIs.find((ai) => ai.id === r.agentId)?.model ||
                    "",
                  status: r.status,
                  timestamp: r.timestamp,
                })),
              }),
            });
          } catch (error) {
            console.error("[GPTWorkspace] Error saving deep thinking message:", error);
          }
        }
        } else {
        // 顺序模式：逐个AI处理（失败跳过），仅展示最终结果，但运行中显示每步进度
        const result = await handleSequentialMode(
          sessId,
          authToken,
          userMessage.content as string,
          initialResponses
        );

        if (!result.finalAnswer) {
          throw new Error("所有模型调用失败，请重试或更换模型");
        }

        // 先清除协作状态，避免闪烁
        setIsProcessing(false);
        setAIResponses([]);

        // 仅添加最终结果到对话
        addMessage({
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: result.finalAnswer,
          timestamp: new Date(),
        });

        // 仅保存“用户问题 + 最终结果”到数据库
        if (sessId) {
          try {
            const saveResponse = await fetch("/api/chat/save-final", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authToken}`,
              },
              body: JSON.stringify({
                sessionId: sessId,
                userMessage: userMessage.content,
                finalAnswer: result.finalAnswer,
                finalAgentId: result.finalAgentId,
                finalAgentName: result.finalAgentName,
                finalModel: result.finalModel,
              }),
            });

            if (!saveResponse.ok) {
              console.error("[GPTWorkspace] Failed to save final message");
            }
          } catch (error) {
            console.error("[GPTWorkspace] Error saving final message:", error);
          }
        }
        }
      }
    } catch (error) {
      console.error("Multi-AI collaboration error:", error);
      setError(error instanceof Error ? error.message : t.workspace.error);
      toast.error(error instanceof Error ? error.message : t.workspace.error);
    } finally {
      // 确保状态一定会被清除
      setIsProcessing(false);
      setAIResponses([]);
      // 触发额度刷新事件
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("message-sent"));
      }
    }
  };

  const buildSequentialPrompt = (
    goal: string,
    prevAgentName: string,
    prevOut: string,
    currentAgentName: string,
    stepIndex: number,
    totalSteps: number
  ) => {
    // 避免参考内容过长导致模型“看不懂/看不到重点”或触发上下文截断
    const maxRefChars = 6000;
    const safePrevOut =
      prevOut.length > maxRefChars
        ? prevOut.slice(0, maxRefChars) + "\n\n(参考内容已截断)"
        : prevOut;

    return [
      `你正在与其他模型协作按顺序解决同一个问题（第 ${stepIndex}/${totalSteps} 步）。`,
      "请严格按以下格式理解与作答：",
      "",
      `【最终目标】\n${goal}`,
      "",
      `【参考信息（上一位模型：${prevAgentName}，可能有错）】\n${safePrevOut}`,
      "",
      "【你的任务】",
      `- 你是：${currentAgentName}。在参考信息的基础上，补充/纠错/改写为更好的最终答案。`,
      "- 直接给出最终结果，不要解释你在参考谁，也不要输出‘第几步’。",
      "- 如果参考内容与目标矛盾，以最终目标为准，并明确给出更正后的结论。",
    ].join("\n");
  };

  const handleSequentialMode = async (
    sessionId: string,
    token: string,
    goal: string,
    responses: AIResponse[]
  ): Promise<{
    finalAnswer: string | null;
    finalAgentId?: string;
    finalAgentName?: string;
    finalModel?: string;
  }> => {
    const lockedAgentIds = responses.map((r) => r.agentId);
    const aisByAgentId = new Map(availableAIs.map((ai) => [ai.id, ai]));

    let lastSuccessOut: string | null = null;
    let lastSuccessAgentName: string | null = null;
    let finalAgentId: string | undefined;
    let finalAgentName: string | undefined;
    let finalModel: string | undefined;

    for (let idx = 0; idx < lockedAgentIds.length; idx++) {
      const agentId = lockedAgentIds[idx];
      const gpt = aisByAgentId.get(agentId);
      if (!gpt) {
        setAIResponses((prev) =>
          prev.map((r) =>
            r.agentId === agentId
              ? { ...r, status: "error" as const, content: "Error: AI not found" }
              : r
          )
        );
        continue;
      }

      try {
        setAIResponses((prev) =>
          prev.map((r) =>
            r.agentId === gpt.id ? { ...r, status: "processing" as const } : r
          )
        );

        const currentMessage =
          lastSuccessOut && lastSuccessAgentName
            ? buildSequentialPrompt(
                goal,
                lastSuccessAgentName,
                lastSuccessOut,
                gpt.name,
                idx + 1,
                lockedAgentIds.length
              )
            : goal;

        if (process.env.NEXT_PUBLIC_DEBUG_SEQUENTIAL === "1") {
          console.log(
            `[Sequential] Step ${idx + 1}/${lockedAgentIds.length} -> ${gpt.name} (${gpt.model}) message:`,
            currentMessage
          );
        }

        const response = await fetch("/api/chat/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionId,
            message: currentMessage,
            model: gpt.model,
            temperature: gpt.temperature || 0.7,
            maxTokens: gpt.maxTokens || 2048,
            agentName: gpt.name,
            agentId: gpt.id,
            skipSave: true,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API Error: ${response.status} ${response.statusText} ${errorText}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = "";
        let totalTokens = 0;
        let cost = 0;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === "content") {
                    accumulatedContent += data.content;
                    setAIResponses((prev) =>
                      prev.map((r) =>
                        r.agentId === gpt.id
                          ? {
                              ...r,
                              content: accumulatedContent,
                              status: "processing" as const,
                            }
                          : r
                      )
                    );
                  } else if (data.type === "done") {
                    totalTokens = data.tokens?.total || data.tokens || 0;
                    cost = data.cost || 0;
                  } else if (data.type === "error") {
                    throw new Error(data.error);
                  }
                } catch {
                  // ignore parse errors
                }
              }
            }
          }
        }

        if (!totalTokens && accumulatedContent) {
          totalTokens = Math.floor(accumulatedContent.length / 4);
        }

        setAIResponses((prev) =>
          prev.map((r) =>
            r.agentId === gpt.id
              ? {
                  ...r,
                  content: accumulatedContent,
                  tokens: totalTokens,
                  cost,
                  status: "completed" as const,
                }
              : r
          )
        );

        // success => update last-success pointer
        lastSuccessOut = accumulatedContent;
        lastSuccessAgentName = gpt.name;
        finalAgentId = gpt.id;
        finalAgentName = gpt.name;
        finalModel = gpt.model;
      } catch (error) {
        console.error(`AI ${gpt.name} error (sequential):`, error);
        setAIResponses((prev) =>
          prev.map((r) =>
            r.agentId === gpt.id
              ? {
                  ...r,
                  status: "error" as const,
                  content: `Error: ${error instanceof Error ? error.message : String(error)}`,
                }
              : r
          )
        );
        // 失败 => 跳过，继续下一个模型（不更新lastSuccessOut）
        continue;
      }
    }

    return {
      finalAnswer: lastSuccessOut,
      finalAgentId,
      finalAgentName,
      finalModel,
    };
  };

  // 并行模式处理（真实 API 调用）
  const handleParallelMode = async (
    sessionId: string,
    token: string,
    userMessage: string,
    responses: AIResponse[]
  ): Promise<AIResponse[]> => {
    // ✅ 改进：从 responses 中提取 agentId，确保使用锁定的 AI
    // 而不是依赖外部的 selectedGPTs（可能被用户改变）
    const lockedAgentIds = responses.map(r => r.agentId);
    const aisByAgentId = new Map(availableAIs.map(ai => [ai.id, ai]));

    const promises = lockedAgentIds.map(async (agentId) => {
      const gpt = aisByAgentId.get(agentId);
      if (!gpt) {
        return {
          agentId,
          agentName: agentId,
          content: "Error: AI not found",
          status: "error" as const,
          timestamp: new Date(),
        } as AIResponse;
      }
      try {
        // 更新状态为处理中
        setAIResponses((prev) =>
          prev.map((r) =>
            r.agentId === gpt.id ? { ...r, status: "processing" as const } : r
          )
        );

        // 调用真实 API
        console.log(`[Frontend] Sending request for model: ${gpt.model}`);
        const response = await fetch("/api/chat/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionId,
            message: userMessage,
            model: gpt.model || "deepseek-chat",
            temperature: gpt.temperature || 0.7,
            maxTokens: gpt.maxTokens || 2048,
            agentName: gpt.name,
            agentId: gpt.id,
            skipSave: true, // 统一由前端save-multi-ai保存
          }),
        });

        console.log(
          `[Frontend] Response status: ${response.status} ${response.statusText}`
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Frontend] Error response:`, errorText);
          throw new Error(`API Error: ${response.statusText}`);
        }

        // 处理 SSE 流式响应
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = "";
        let totalTokens = 0;
        let cost = 0;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));

                  if (data.type === "content") {
                    accumulatedContent += data.content;

                    // 实时更新界面显示
                    setAIResponses((prev) =>
                      prev.map((r) =>
                        r.agentId === gpt.id
                          ? {
                              ...r,
                              content: accumulatedContent,
                              status: "processing" as const,
                            }
                          : r
                      )
                    );
                  } else if (data.type === "done") {
                    totalTokens = data.tokens?.total || 0;
                    cost = data.cost || 0;
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            }
          }
        }

        // 如果没有收到 tokens 信息，使用估算值
        if (!totalTokens && accumulatedContent) {
          totalTokens = Math.floor(accumulatedContent.length / 4);
        }

        // 标记为完成
        setAIResponses((prev) =>
          prev.map((r) =>
            r.agentId === gpt.id
              ? {
                  ...r,
                  content: accumulatedContent,
                  tokens: totalTokens,
                  cost: cost,
                  status: "completed" as const,
                }
              : r
          )
        );

        // 返回完成的响应
        return {
          agentId: gpt.id,
          agentName: gpt.name,
          content: accumulatedContent,
          tokens: totalTokens,
          cost: cost,
          status: "completed" as const,
          timestamp: new Date(),
        } as AIResponse;
      } catch (error) {
        console.error(`AI ${gpt.name} error:`, error);
        setAIResponses((prev) =>
          prev.map((r) =>
            r.agentId === gpt.id
              ? { ...r, status: "error" as const, content: `Error: ${error}` }
              : r
          )
        );
        return {
          agentId: gpt.id,
          agentName: gpt.name,
          content: `Error: ${error}`,
          status: "error" as const,
          timestamp: new Date(),
        } as AIResponse;
      }
    });

    const results = await Promise.all(promises);

    // 返回最终的响应状态
    console.log("[handleParallelMode] Returning results:", results);
    return results;
  };

  const truncateForContext = (text: string, maxChars: number) => {
    if (!text) return "";
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + "\n\n(内容已截断)";
  };

  const buildGraphNodePrompt = (
    goal: string,
    node: { id: string; title: string; description: string; dependsOn?: string[] },
    depOutputs: Array<{ nodeId: string; title: string; output: string }>
  ) => {
    const inputs = depOutputs
      .map(
        (d) =>
          `【来自上游节点：${d.title} (${d.nodeId})】\n${truncateForContext(d.output, 2000)}`
      )
      .join("\n\n");

    return [
      "你正在作为多专家任务图中的一个节点执行子任务。",
      "请只产出该子任务的结果（可用 Markdown），避免输出无关解释。",
      "",
      `【总目标】\n${goal}`,
      "",
      `【当前子任务】\n${node.title}`,
      `【子任务说明】\n${node.description}`,
      "",
      depOutputs.length > 0 ? `【输入（上游输出，可能有错）】\n${inputs}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  };

  const runGraphNode = async (
    sessionId: string,
    token: string,
    nodeResp: AIResponse,
    prompt: string
  ) => {
    const nodeId = nodeResp.nodeId || "";
    const gpt = availableAIs.find((ai) => ai.id === nodeResp.agentId);
    if (!gpt) {
      throw new Error("AI not found");
    }

    setAIResponses((prev) =>
      prev.map((r) =>
        r.nodeId === nodeId
          ? { ...r, status: "processing" as const, content: "" }
          : r
      )
    );

    const response = await fetch("/api/chat/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        sessionId,
        message: prompt,
        model: gpt.model || "deepseek-chat",
        temperature: gpt.temperature || 0.7,
        maxTokens: gpt.maxTokens || 2048,
        agentName: gpt.name,
        agentId: gpt.id,
        skipSave: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} ${response.statusText} ${errorText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let accumulatedContent = "";
    let totalTokens = 0;
    let cost = 0;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "content") {
              accumulatedContent += data.content;
              setAIResponses((prev) =>
                prev.map((r) =>
                  r.nodeId === nodeId
                    ? {
                        ...r,
                        content: accumulatedContent,
                        status: "processing" as const,
                      }
                    : r
                )
              );
            } else if (data.type === "done") {
              totalTokens = data.tokens?.total || 0;
              cost = data.cost || 0;
            }
          } catch {
            // ignore
          }
        }
      }
    }

    if (!totalTokens && accumulatedContent) {
      totalTokens = Math.floor(accumulatedContent.length / 4);
    }

    setAIResponses((prev) =>
      prev.map((r) =>
        r.nodeId === nodeId
          ? {
              ...r,
              content: accumulatedContent,
              tokens: totalTokens,
              cost,
              status: "completed" as const,
            }
          : r
      )
    );

    return {
      content: accumulatedContent,
      tokens: totalTokens,
      cost,
      model: gpt.model,
      agentName: gpt.name,
    };
  };

  const handleTaskGraphMode = async (
    sessionId: string,
    token: string,
    goal: string,
    lockedAIs: AIAgent[],
    templateHint?: string
  ): Promise<{
    spec: TaskGraphSpec;
    run: TaskGraphExecutionRun;
    nodeResponses: AIResponse[];
  }> => {
    const planResponse = await fetch("/api/chat/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        sessionId,
        goal,
        templateHint,
        maxNodes: 10,
      }),
    });

    if (!planResponse.ok) {
      const txt = await planResponse.text();
      throw new Error(`Plan failed: ${planResponse.status} ${txt}`);
    }

    const planData = await planResponse.json();
    const spec = planData.spec as TaskGraphSpec;
    setActiveTaskGraphSpec(spec);

    const lockedIds = lockedAIs.map((a) => a.id);
    const nodesById = new Map(spec.nodes.map((n) => [n.id, n] as const));

    const initialNodeResponses: AIResponse[] = spec.nodes.map((node, idx) => {
      const assignedAgentId =
        node.agentId && lockedIds.includes(node.agentId)
          ? node.agentId
          : lockedAIs[idx % Math.max(1, lockedAIs.length)]?.id;

      const agent = lockedAIs.find((a) => a.id === assignedAgentId) ?? lockedAIs[0];
      return {
        agentId: agent?.id || assignedAgentId || "",
        agentName: agent?.name || "AI",
        model: agent?.model,
        content: "",
        status: "pending",
        timestamp: new Date(),
        nodeId: node.id,
        nodeTitle: node.title,
        dependsOn: node.dependsOn ?? [],
      };
    });

    setAIResponses(initialNodeResponses);

    const runId = `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const runCreatedAt = new Date().toISOString();
    const outputs = new Map<string, string>();

    const layers = topoLayers(spec);
    const maxConcurrency = 3;

    for (const layer of layers) {
      for (let i = 0; i < layer.length; i += maxConcurrency) {
        const batch = layer.slice(i, i + maxConcurrency);

        await Promise.all(
          batch.map(async (nodeId) => {
            const node = nodesById.get(nodeId);
            if (!node) return;

            const current = initialNodeResponses.find((r) => r.nodeId === nodeId);
            if (!current) return;

            const deps = (node.dependsOn ?? []).map((depId) => {
              const dep = nodesById.get(depId);
              return {
                nodeId: depId,
                title: dep?.title || depId,
                output: outputs.get(depId) || "",
              };
            });

            const prompt = buildGraphNodePrompt(goal, node, deps);

            try {
              const result = await runGraphNode(sessionId, token, current, prompt);
              outputs.set(nodeId, result.content);
              // Keep local copy in sync (used later to build final nodeResponses)
              current.content = result.content;
              current.tokens = result.tokens;
              current.cost = result.cost;
              current.model = result.model;
              current.agentName = result.agentName;
              current.status = "completed";
              current.timestamp = new Date();
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              setAIResponses((prev) =>
                prev.map((r) =>
                  r.nodeId === nodeId
                    ? { ...r, status: "error" as const, content: `Error: ${msg}` }
                    : r
                )
              );
              current.status = "error";
              current.content = `Error: ${msg}`;
              current.timestamp = new Date();
            }
          })
        );
      }
    }

    const finishedAt = new Date().toISOString();
    const nodeResponses = initialNodeResponses.map((r) => ({ ...r }));

    const run: TaskGraphExecutionRun = {
      runId,
      createdAt: runCreatedAt,
      finishedAt,
      nodes: nodeResponses.map((r) => ({
        nodeId: r.nodeId || "",
        status: r.status === "processing" ? "running" : r.status,
        agentId: r.agentId,
        agentName: r.agentName,
        model: r.model || "",
        startedAt: undefined,
        finishedAt: r.timestamp?.toISOString?.() ?? new Date().toISOString(),
        output: r.status === "completed" ? r.content : undefined,
        error: r.status === "error" ? r.content : undefined,
      })),
    };

    return { spec, run, nodeResponses };
  };


  const createSession = async (token: string, firstMessage: string): Promise<string> => {
    try {
      // 使用用户第一条消息作为标题,最多10个字符
      const title = firstMessage.length > 10
        ? firstMessage.substring(0, 10) + "..."
        : firstMessage;

      // 判断是否为多AI模式
      const isMultiAI = selectedGPTs.length > 1;

      const sessionData: any = {
        title: title,
        model: selectedGPTs[0]?.model || "gpt-3.5-turbo",
      };

      // ✅ 改进：无论单AI还是多AI，都传递配置参数
      // 这样后端能统一处理agentId验证
      sessionData.isMultiAI = isMultiAI;
      sessionData.selectedAgentIds = selectedGPTs.map(gpt => gpt.id);
      sessionData.collaborationMode = isMultiAI ? collaborationMode : "single";

      console.log(
        `[GPTWorkspace] Creating ${isMultiAI ? "multi-AI" : "single-AI"} session with agents:`,
        sessionData.selectedAgentIds
      );

      const response = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(sessionData),
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.status}`);
      }

      const data = await response.json();
      console.log(`Session created:`, data.session);
      setSessionConfig(data.session.multi_ai_config || null);
      return data.session.id;
    } catch (error) {
      console.error("Failed to create session:", error);
      toast.error("创建会话失败", {
        description: "请稍后重试",
      });
      throw error;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "processing":
        return "bg-blue-500";
      case "completed":
        return "bg-green-500";
      case "error":
        return "bg-red-500";
      default:
        return "bg-gray-300";
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setCurrentSessionId(undefined);
    setSessionConfig(null);
    setAIResponses([]);
    setIsProcessing(false);
    setError(null);
    setInput("");
    setSelectedGPTs([]);
    console.log("🗑️ 已清空对话");
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "processing":
        return <Loader2 className="w-3 h-3 text-white animate-spin" />;
      case "completed":
        return <CheckCircle2 className="w-3 h-3 text-white" />;
      case "error":
        return <AlertCircle className="w-3 h-3 text-white" />;
      default:
        return <Clock className="w-3 h-3 text-white" />;
    }
  };

  const latestTaskGraphMessage = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role !== "assistant") continue;
      if (!(m as any).taskGraph?.spec) continue;
      if (!m.isMultiAI || !Array.isArray(m.content)) continue;
      return m;
    }
    return null;
  })();

  const latestTaskGraphSpec = (latestTaskGraphMessage as any)?.taskGraph
    ?.spec as TaskGraphSpec | undefined;

  const latestTaskGraphOrderedNodeIds = latestTaskGraphSpec
    ? topoLayers(latestTaskGraphSpec).flat()
    : [];

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
      {/* Task Graph step navigator (floating) */}
      {!taskGraphNavDismissed && latestTaskGraphMessage && latestTaskGraphSpec && (
        <div className="fixed right-3 sm:right-4 bottom-24 sm:bottom-6 z-50 w-[260px] sm:w-[320px]">
          <Card className="border-gray-200 bg-white shadow-lg">
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100">
              <button
                type="button"
                className="flex items-center gap-2 min-w-0"
                onClick={() => setTaskGraphNavOpen((v) => !v)}
                aria-label="切换任务图步骤导航展开/收起"
              >
                <GitBranch className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <div className="text-sm font-semibold text-gray-900 truncate">
                  步骤导航（{latestTaskGraphOrderedNodeIds.length}）
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-gray-500 transition-transform ${
                    taskGraphNavOpen ? "-rotate-180" : ""
                  }`}
                />
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-gray-400 hover:text-gray-700"
                onClick={() => setTaskGraphNavDismissed(true)}
                title={language === "zh" ? "关闭" : "Close"}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {taskGraphNavOpen && (
              <div className="max-h-[280px] overflow-auto p-2">
                <div className="space-y-1">
                  {latestTaskGraphOrderedNodeIds.map((nodeId, idx) => {
                    const node = latestTaskGraphSpec.nodes.find((n) => n.id === nodeId);
                    const resp = (latestTaskGraphMessage.content as AIResponse[]).find(
                      (r) => r.nodeId === nodeId
                    );
                    const title = node?.title || resp?.nodeTitle || nodeId;
                    const status = resp?.status;
                    const anchorId = getTaskGraphNodeAnchorId(latestTaskGraphMessage.id, nodeId);

                    return (
                      <button
                        key={nodeId}
                        type="button"
                        className="w-full text-left px-2 py-1.5 rounded-md hover:bg-blue-50 flex items-start gap-2"
                        onClick={() => {
                          const el = document.getElementById(anchorId);
                          if (el) {
                            el.scrollIntoView({ behavior: "smooth", block: "start" });
                          }
                        }}
                      >
                        <div
                          className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${getStatusColor(
                            status || "pending"
                          )}`}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-gray-900 truncate">
                            {idx + 1}. {title}
                          </div>
                          <div className="text-[11px] text-gray-500 truncate">
                            {resp?.agentName || node?.agentId || "AI"}
                            {resp?.model ? ` · ${resp.model}` : ""}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 聊天区域 */}
      <div
        ref={chatContainerRef}
        onScroll={handleChatScroll}
        className="flex-1 overflow-y-auto p-2 sm:p-4 lg:p-6 space-y-4 min-h-0">
        {messages.length === 0 && selectedGPTs.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-blue-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {t.workspace.welcome}
            </h3>
            <p className="text-sm text-gray-500 mb-6">{t.workspace.selectAI}</p>
          </div>
        )}

        {messages.length === 0 && selectedGPTs.length > 0 && !isProcessing && (
          <div className="text-center py-12">
            <Bot className="w-16 h-16 text-blue-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {selectedGPTs.length} AI {t.workspace.aiReady}
            </h3>
            <p className="text-sm text-gray-500 mb-2">
              {t.workspace.parallel}
            </p>
            <p className="text-sm text-gray-500 mb-6">{t.workspace.example}</p>

            {/* 显示已选AI */}
            <div className="flex flex-wrap justify-center gap-3 max-w-2xl mx-auto">
              {selectedGPTs.map((gpt) => (
                <div 
                  key={gpt.id} 
                  className="flex items-center gap-2 px-4 py-1.5 bg-white text-gray-700 border border-gray-200 rounded-full text-sm font-medium shadow-sm transition-all hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 group"
                >
                  {gpt.icon ? (
                    <span className="text-base group-hover:scale-110 transition-transform">{gpt.icon}</span>
                  ) : (
                    <Bot className="w-4 h-4 text-blue-500" />
                  )}
                  <span>{gpt.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} id={getMessageAnchorId(message.id)}>
            {message.role === "user" ? (
              // 用户消息
              <div className="flex items-start gap-2 sm:gap-3 justify-end">
                <div className="inline-block max-w-xs sm:max-w-2xl lg:max-w-3xl group">
                  <Card className="inline-block p-3 sm:p-4 bg-blue-500 text-white">
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {typeof message.content === "string" ? message.content : ""}
                    </p>
                  </Card>

                  <div className="flex justify-end mt-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 text-white/80 hover:text-white hover:bg-white/10 transition-opacity ${
                        favorites.isFavorite(
                          buildFavoriteId(currentSessionId, getMessageAnchorId(message.id))
                        )
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100"
                      }`}
                      onClick={() => {
                        const anchorId = getMessageAnchorId(message.id);
                        favorites.toggle({
                          id: buildFavoriteId(currentSessionId, anchorId),
                          sessionId: currentSessionId || "",
                          anchorId,
                          role: "user",
                          preview:
                            typeof message.content === "string" ? message.content : "",
                        });
                      }}
                      title={language === "zh" ? "收藏这条对话" : "Favorite message"}
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          favorites.isFavorite(
                            buildFavoriteId(currentSessionId, getMessageAnchorId(message.id))
                          )
                            ? "text-white"
                            : "text-white/80"
                        }`}
                      />
                    </Button>
                  </div>
                </div>
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-white" />
                </div>
              </div>
            ) : message.isMultiAI && Array.isArray(message.content) ? (
              // 多AI响应
              <div className="space-y-3">
                {(message.content as AIResponse[]).length > 1 && (
                  <div className="flex items-center space-x-2 mb-2">
                    <Users className="w-5 h-5 text-blue-600" />
                    <h4 className="font-semibold text-blue-900">
                      {t.workspace.collaboration} (
                      {(message.content as AIResponse[]).length} AI)
                    </h4>
                  </div>
                )}

                {(message.content as AIResponse[]).map((aiResp, idx) => {
                  const anchorId = aiResp.nodeId
                    ? getTaskGraphNodeAnchorId(message.id, aiResp.nodeId)
                    : `chat-message-${message.id}-ai-${aiResp.agentId}-${idx}`;
                  const favoriteId = buildFavoriteId(currentSessionId, anchorId);
                  const isFav = favorites.isFavorite(favoriteId);

                  return (
                  <div
                    key={aiResp.nodeId || `${aiResp.agentId}-${idx}`}
                    className="flex items-start space-x-3 group"
                    id={anchorId}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${getStatusColor(
                        aiResp.status
                      )}`}
                    >
                      {getStatusIcon(aiResp.status)}
                    </div>

                    <div className="flex-1 max-w-xs sm:max-w-2xl lg:max-w-3xl">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="font-medium text-sm">
                          {aiResp.nodeTitle ? `${aiResp.nodeTitle} · ${aiResp.agentName}` : aiResp.agentName}
                        </span>
                        {aiResp.model && (
                          <Badge variant="outline" className="text-xs">
                            {aiResp.model}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {aiResp.status === "completed"
                            ? t.workspace.completed
                            : aiResp.status === "processing"
                            ? t.workspace.processing_status
                            : aiResp.status === "error"
                            ? t.workspace.error
                            : t.workspace.pending}
                        </Badge>
                      </div>

                      <Card className="p-3 sm:p-4 bg-white border-gray-200 max-w-full">
                        {aiResp.content ? (
                          <MarkdownRenderer content={aiResp.content} />
                        ) : (
                          <p className="text-sm text-gray-500">{t.workspace.pending}</p>
                        )}
                      </Card>

                      {/* 消息操作按钮 */}
                      {aiResp.status === "completed" && aiResp.content && (
                        <div className="flex items-center gap-0.5 mt-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50 ${
                              isFav ? "text-blue-600" : ""
                            }`}
                            onClick={() => {
                              favorites.toggle({
                                id: favoriteId,
                                sessionId: currentSessionId || "",
                                anchorId,
                                role: "assistant",
                                preview: aiResp.content,
                              });
                            }}
                            title={language === "zh" ? "收藏这条对话" : "Favorite message"}
                          >
                            <Star className="w-3.5 h-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                            onClick={() => {
                              navigator.clipboard.writeText(aiResp.content);
                              toast.success(language === 'zh' ? "已复制" : "Copied");
                            }}
                            title={language === 'zh' ? "复制" : "Copy"}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                            onClick={async () => {
                              if (navigator.share) {
                                try {
                                  await navigator.share({ text: aiResp.content });
                                } catch (err) { console.error(err); }
                              } else {
                                navigator.clipboard.writeText(aiResp.content);
                                toast.info(language === 'zh' ? "已复制内容" : "Content copied");
                              }
                            }}
                            title={language === 'zh' ? "分享" : "Share"}
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                            onClick={() => {
                              const blob = new Blob([aiResp.content], { type: "text/markdown" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `ai-response-${Date.now()}.md`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            title={language === 'zh' ? "下载" : "Download"}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>

                  </div>
                );
                })}

                {/* Task Graph circuit view (if present) - moved to bottom */}
                {(message as any).taskGraph?.spec && (
                  <Card className="p-3 sm:p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                    <div className="flex items-center gap-2 mb-3">
                      <GitBranch className="w-4 h-4 text-blue-600" />
                      <div className="text-sm font-semibold text-blue-900">任务图模式（2.0）</div>
                      <Badge variant="outline" className="text-xs">
                        {((message as any).taskGraph?.spec?.nodes?.length as number) || 0} 节点
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      {topoLayers((message as any).taskGraph.spec as TaskGraphSpec).map(
                        (layer, idx, arr) => (
                          <div key={`layer-${idx}`} className="flex items-center flex-wrap gap-2">
                            {layer.map((nodeId) => {
                              const specNode = ((message as any).taskGraph.spec as TaskGraphSpec).nodes.find(
                                (n) => n.id === nodeId
                              );
                              const resp = (message.content as AIResponse[]).find(
                                (r) => r.nodeId === nodeId
                              );
                              return (
                                <div key={nodeId} className="flex items-center gap-2">
                                  <Card className="px-3 py-2 bg-white border-gray-200 min-w-[180px]">
                                    <div className="text-xs font-semibold text-gray-800 line-clamp-1">
                                      {specNode?.title || nodeId}
                                    </div>
                                    <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                                      {(resp?.agentName || specNode?.agentId || "AI") +
                                        (resp?.model ? ` · ${resp.model}` : "")}
                                    </div>
                                  </Card>
                                  {idx < arr.length - 1 && (
                                    <div className="h-px w-6 bg-blue-200" />
                                  )}
                                </div>
                              );
                            })}
                            {idx < arr.length - 1 && (
                              <ArrowRight className="w-4 h-4 text-blue-300" />
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </Card>
                )}
              </div>
            ) : message.role === "assistant" ? (
              // 单个AI响应（历史消息）
              <div className="flex items-start space-x-3 group" id={getMessageAnchorId(message.id)}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-green-500">
                  {getStatusIcon("completed")}
                </div>

                <div className="inline-block max-w-xs sm:max-w-2xl lg:max-w-3xl">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="font-medium text-sm">
                      {(message as any).agentName ||
                       availableAIs.find(ai => ai.model === (message as any).model)?.name ||
                       (message as any).model ||
                       "AI Assistant"}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {t.workspace.completed}
                    </Badge>
                  </div>

                  <Card className="p-3 sm:p-4 bg-white border-gray-200 max-w-full">
                    {typeof message.content === "string" && message.content ? (
                      <MarkdownRenderer content={message.content} />
                    ) : (
                      <p className="text-sm text-gray-500">No content</p>
                    )}
                  </Card>

                  {/* 消息操作按钮 */}
                  {typeof message.content === "string" && message.content && (
                    <div className="flex items-center gap-0.5 mt-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50 ${
                          favorites.isFavorite(
                            buildFavoriteId(currentSessionId, getMessageAnchorId(message.id))
                          )
                            ? "text-blue-600"
                            : ""
                        }`}
                        onClick={() => {
                          const anchorId = getMessageAnchorId(message.id);
                          favorites.toggle({
                            id: buildFavoriteId(currentSessionId, anchorId),
                            sessionId: currentSessionId || "",
                            anchorId,
                            role: "assistant",
                            preview: message.content as string,
                          });
                        }}
                        title={language === "zh" ? "收藏这条对话" : "Favorite message"}
                      >
                        <Star className="w-3.5 h-3.5" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                        onClick={() => {
                          navigator.clipboard.writeText(message.content as string);
                          toast.success(language === 'zh' ? "已复制" : "Copied");
                        }}
                        title={language === 'zh' ? "复制" : "Copy"}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                        onClick={async () => {
                          if (navigator.share) {
                            try {
                              await navigator.share({ text: message.content as string });
                            } catch (err) { console.error(err); }
                          } else {
                            navigator.clipboard.writeText(message.content as string);
                            toast.info(language === 'zh' ? "已复制内容" : "Content copied");
                          }
                        }}
                        title={language === 'zh' ? "分享" : "Share"}
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                        onClick={() => {
                          const blob = new Blob([message.content as string], { type: "text/markdown" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `ai-response-${Date.now()}.md`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        title={language === 'zh' ? "下载" : "Download"}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ))}

        {/* 实时协作状态显示 */}
        {isProcessing && aiResponses.length > 0 && (
          <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-blue-900">
                  {t.workspace.collaboration}
                </h3>
              </div>
              <Badge
                variant="secondary"
                className="bg-blue-100 text-blue-800 animate-pulse"
              >
                {t.workspace.processing}
              </Badge>
            </div>

            {activeTaskGraphSpec && (
              <Card className="p-3 bg-white/60 border-blue-100 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <GitBranch className="w-4 h-4 text-blue-600" />
                  <div className="text-sm font-semibold text-blue-900">任务图模式执行中</div>
                  <Badge variant="outline" className="text-xs">
                    {activeTaskGraphSpec.nodes.length} 节点
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {TASK_GRAPH_PRESETS.find((p) => p.id === taskGraphPresetId)?.name || "模板"}
                  </Badge>
                </div>

                <div className="space-y-3">
                  {topoLayers(activeTaskGraphSpec).map((layer, idx, arr) => (
                    <div key={`live-layer-${idx}`} className="flex items-center flex-wrap gap-2">
                      {layer.map((nodeId) => {
                        const node = activeTaskGraphSpec.nodes.find((n) => n.id === nodeId);
                        const r = aiResponses.find((x) => x.nodeId === nodeId);
                        return (
                          <div key={nodeId} className="flex items-center gap-2">
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 min-w-[200px]">
                              <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(r?.status || "pending")}`} />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-gray-800 truncate">
                                  {node?.title || nodeId}
                                </div>
                                <div className="text-[11px] text-gray-500 truncate">
                                  {(r?.agentName || node?.agentId || "AI") + (r?.model ? ` · ${r.model}` : "")}
                                </div>
                              </div>
                            </div>
                            {idx < arr.length - 1 && <div className="h-px w-6 bg-blue-200" />}
                          </div>
                        );
                      })}
                      {idx < arr.length - 1 && (
                        <ArrowRight className="w-4 h-4 text-blue-300" />
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <div className="space-y-3">
              {aiResponses.map((aiResp, idx) => (
                <div
                  key={aiResp.nodeId || `${aiResp.agentId}-${idx}`}
                  className="flex items-start space-x-3 group"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${getStatusColor(
                      aiResp.status
                    )}`}
                  >
                    {getStatusIcon(aiResp.status)}
                  </div>

                  <div className="flex-1 max-w-xs sm:max-w-2xl lg:max-w-3xl">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="font-medium text-sm">
                        {aiResp.nodeTitle ? `${aiResp.nodeTitle} · ${aiResp.agentName}` : aiResp.agentName}
                      </span>
                      {aiResp.model && (
                        <Badge variant="outline" className="text-xs">
                          {aiResp.model}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {aiResp.status === "completed"
                          ? t.workspace.completed
                          : aiResp.status === "processing"
                          ? t.workspace.processing_status
                          : t.workspace.pending}
                      </Badge>
                    </div>

                    {/* 显示实时生成的内容 */}
                    {aiResp.content && (
                      <>
                        <Card className="p-3 bg-white border-gray-200 max-w-full">
                          <div>
                            <MarkdownRenderer content={aiResp.content} />
                            {aiResp.status === "processing" && (
                              <span className="inline-block w-2 h-4 ml-1 bg-blue-500 animate-pulse" />
                            )}
                          </div>
                        </Card>

                        {/* 消息操作按钮 */}
                        {aiResp.status === "completed" && (
                          <div className="flex items-center gap-0.5 mt-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                              onClick={() => {
                                navigator.clipboard.writeText(aiResp.content);
                                toast.success(language === 'zh' ? "已复制" : "Copied");
                              }}
                              title={language === 'zh' ? "复制" : "Copy"}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                              onClick={async () => {
                                if (navigator.share) {
                                  try {
                                    await navigator.share({ text: aiResp.content });
                                  } catch (err) { console.error(err); }
                                } else {
                                  navigator.clipboard.writeText(aiResp.content);
                                  toast.info(language === 'zh' ? "已复制内容" : "Content copied");
                                }
                              }}
                              title={language === 'zh' ? "分享" : "Share"}
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                              onClick={() => {
                                const blob = new Blob([aiResp.content], { type: "text/markdown" });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = `ai-response-${Date.now()}.md`;
                                a.click();
                                URL.revokeObjectURL(url);
                              }}
                              title={language === 'zh' ? "下载" : "Download"}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 错误提示 */}
        {error && (
          <Card className="p-4 bg-red-50 border-red-200">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-800">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setError(null)}
                  className="mt-2"
                >
                  {t.workspace.retry}
                </Button>
              </div>
            </div>
          </Card>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 统一输入区域 */}
      <div className="p-2 sm:p-3 bg-white">
        <div className="max-w-4xl mx-auto border border-gray-200 rounded-xl sm:rounded-2xl shadow-sm bg-white flex flex-col relative">
          {/* 输入框 */}
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="开始对话..."
            className="flex-1 min-h-[44px] sm:min-h-[80px] border-0 focus:ring-0 focus-visible:ring-0 shadow-none resize-none text-sm sm:text-base p-2 sm:p-3 bg-transparent outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isProcessing || selectedGPTs.length === 0}
          />

          {/* 底部工具栏 */}
          <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-t border-gray-100 bg-gray-50/30 rounded-b-xl sm:rounded-b-2xl">
            <div className="flex items-center justify-between gap-1 sm:gap-2">
              {/* 左侧：模式选择按钮 */}
              <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0 relative">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 sm:h-8 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1.5 flex-shrink-0"
                  onClick={() => setModeMenuOpen(!modeMenuOpen)}
                  title="选择协作模式"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>
                    {effectiveCollaborationMode === "sequential"
                      ? "顺序模式"
                      : effectiveCollaborationMode === "deep"
                        ? "深度模式"
                        : effectiveCollaborationMode === "graph"
                          ? "任务图模式"
                          : "并行模式"}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${modeMenuOpen ? "-rotate-180" : ""}`} />
                </Button>

                {modeMenuOpen && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 w-max flex flex-col gap-1">
                    <Button
                      variant={effectiveCollaborationMode === "parallel" ? "default" : "outline"}
                      size="sm"
                      className="h-7 px-2 text-xs flex items-center gap-2 justify-start min-w-max"
                      onClick={() => {
                        setCollaborationMode("parallel");
                        setModeMenuOpen(false);
                      }}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>并行模式</span>
                    </Button>

                    <Button
                      variant={effectiveCollaborationMode === "sequential" ? "default" : "outline"}
                      size="sm"
                      className="h-7 px-2 text-xs flex items-center gap-2 justify-start min-w-max"
                      onClick={() => {
                        setCollaborationMode("sequential");
                        setModeMenuOpen(false);
                      }}
                    >
                      <ListOrdered className="w-3.5 h-3.5" />
                      <span>顺序模式</span>
                    </Button>

                    <Button
                      variant={effectiveCollaborationMode === "deep" ? "default" : "outline"}
                      size="sm"
                      className="h-7 px-2 text-xs flex items-center gap-2 justify-start min-w-max"
                      onClick={() => {
                        setCollaborationMode("deep");
                        setModeMenuOpen(false);
                      }}
                    >
                      <Brain className="w-3.5 h-3.5" />
                      <span>深度模式</span>
                    </Button>

                    <Button
                      variant={effectiveCollaborationMode === "graph" ? "default" : "outline"}
                      size="sm"
                      className="h-7 px-2 text-xs flex items-center gap-2 justify-start min-w-max"
                      onClick={() => {
                        setCollaborationMode("graph");
                        setModeMenuOpen(false);
                      }}
                    >
                      <GitBranch className="w-3.5 h-3.5" />
                      <span>任务图模式</span>
                    </Button>

                    {effectiveCollaborationMode === "graph" && (
                      <div className="border-t border-gray-200 pt-1 mt-1">
                        <select
                          className="h-7 px-2 rounded-lg border border-gray-200 bg-white text-[10px] sm:text-xs text-gray-700 w-full"
                          value={taskGraphPresetId}
                          onChange={(e) => setTaskGraphPresetId(e.target.value)}
                          aria-label="任务图模板"
                        >
                          {TASK_GRAPH_PRESETS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 右侧：功能图标 + 模型选择 + 发送 */}
              <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                {/* 功能图标 - 移动端隐藏部分 */}
                <div className="hidden sm:flex items-center gap-0.5 text-gray-400">
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full">
                    <Paperclip className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full">
                    <Volume2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full">
                    <Mic className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* 模型选择器 */}
                <ChatToolbar
                  selectedAIs={selectedGPTs}
                  onAIsChange={setSelectedGPTs}
                  availableAIs={availableAIs}
                  sessionId={currentSessionId}
                  sessionConfig={sessionConfig}
                  collaborationMode={effectiveCollaborationMode}
                  onCollaborationModeChange={setCollaborationMode}
                  variant="integrated"
                />

                {/* 发送按钮 */}
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || isProcessing || selectedGPTs.length === 0}
                  className="h-8 w-8 sm:h-9 sm:w-9 rounded-full p-0 bg-blue-500 hover:bg-blue-600 flex-shrink-0 shadow-sm"
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
