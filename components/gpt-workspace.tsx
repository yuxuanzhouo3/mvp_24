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
  Clock,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import { getClientAuthToken } from "@/lib/client-auth";
import { useWorkspaceMessages } from "@/components/workspace-messages-context";
import { ChatToolbar } from "@/components/chat-toolbar";
import { MarkdownRenderer } from "@/components/markdown-renderer";

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
}

export function GPTWorkspace({
  selectedGPTs,
  setSelectedGPTs,
  availableAIs,
}: GPTWorkspaceProps) {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiResponses, setAIResponses] = useState<AIResponse[]>([]);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [sessionConfig, setSessionConfig] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { language } = useLanguage();
  const t = useTranslations(language);

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
              }))
            : msg.content,
          isMultiAI: msg.isMultiAI || false,
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

    // 初始化AI响应状态
    const initialResponses: AIResponse[] = selectedGPTs.map((gpt) => ({
      agentId: gpt.id,
      agentName: gpt.name,
      content: "",
      status: "pending",
      timestamp: new Date(),
    }));
    setAIResponses(initialResponses);

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

      // 如果没有sessionId，先创建会话
      let sessId = currentSessionId;
      if (!sessId) {
        sessId = await createSession(authToken, userMessage.content as string);
        setCurrentSessionId(sessId);
      }

      // 并行模式：多个AI同时处理
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
              aiResponses: finalResponses.map(r => ({
                agentId: r.agentId,
                agentName: r.agentName,
                content: r.content,
                model: selectedGPTs.find(g => g.id === r.agentId)?.model || "",
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
    } catch (error) {
      console.error("Multi-AI collaboration error:", error);
      setError(error instanceof Error ? error.message : t.workspace.error);
      toast.error(error instanceof Error ? error.message : t.workspace.error);
    } finally {
      // 确保状态一定会被清除
      setIsProcessing(false);
      setAIResponses([]);
    }
  };

  // 并行模式处理（真实 API 调用）
  const handleParallelMode = async (
    sessionId: string,
    token: string,
    userMessage: string,
    responses: AIResponse[]
  ): Promise<AIResponse[]> => {
    const promises = selectedGPTs.map(async (gpt) => {
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

      // 如果是多AI模式，添加配置参数
      if (isMultiAI) {
        sessionData.isMultiAI = true;
        sessionData.selectedAgentIds = selectedGPTs.map(gpt => gpt.id);
        sessionData.collaborationMode = "parallel";
        console.log("[GPTWorkspace] Creating multi-AI session with agents:", sessionData.selectedAgentIds);
      }

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

  return (
    <div className="flex-1 flex flex-col h-full">
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
            <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
              {selectedGPTs.map((gpt) => (
                <Badge key={gpt.id} variant="secondary" className="px-3 py-1">
                  {gpt.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id}>
            {message.role === "user" ? (
              // 用户消息
              <div className="flex items-start gap-2 sm:gap-3 justify-end">
                <div className="inline-block max-w-xs sm:max-w-2xl lg:max-w-3xl">
                  <Card className="inline-block p-3 sm:p-4 bg-blue-500 text-white">
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {typeof message.content === "string" ? message.content : ""}
                    </p>
                  </Card>
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

                {(message.content as AIResponse[]).map((aiResp) => (
                  <div
                    key={aiResp.agentId}
                    className="flex items-start space-x-3"
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
                          {aiResp.agentName}
                        </span>
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
                    </div>

                  </div>
                ))}
              </div>
            ) : message.role === "assistant" ? (
              // 单个AI响应（历史消息）
              <div className="flex items-start space-x-3">
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
                </div>
              </div>
            ) : null}
          </div>
        ))}

        {/* 实时协作状态显示 */}
        {isProcessing && aiResponses.length > 0 && (
          <Card className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
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

            <div className="space-y-3">
              {aiResponses.map((aiResp) => (
                <div
                  key={aiResp.agentId}
                  className="flex items-start space-x-3"
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
                        {aiResp.agentName}
                      </span>
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
                      <Card className="p-3 bg-white border-gray-200 max-w-full">
                        <div>
                          <MarkdownRenderer content={aiResp.content} />
                          {aiResp.status === "processing" && (
                            <span className="inline-block w-2 h-4 ml-1 bg-blue-500 animate-pulse" />
                          )}
                        </div>
                      </Card>
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

      {/* 工具栏 */}
      <ChatToolbar
        selectedAIs={selectedGPTs}
        onAIsChange={setSelectedGPTs}
        availableAIs={availableAIs}
        sessionId={currentSessionId}
        sessionConfig={sessionConfig}
      />

      {/* 输入区域 */}
      <div className="p-2 sm:p-4 bg-white">
        <div className="flex gap-2 sm:gap-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.workspace.placeholder}
            className="flex-1 min-h-[80px] sm:min-h-[80px] max-h-[200px] resize-none text-sm sm:text-base"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isProcessing || selectedGPTs.length === 0}
          />
          <Button
            onClick={handleSend}
            disabled={
              !input.trim() || isProcessing || selectedGPTs.length === 0
            }
            className="px-4 sm:px-6 h-[80px] self-end"
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
  );
}
