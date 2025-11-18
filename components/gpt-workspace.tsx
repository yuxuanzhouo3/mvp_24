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
} from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import { getClientAuthToken } from "@/lib/client-auth";
import { useWorkspaceMessages } from "@/components/workspace-messages-context";

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

interface GPTWorkspaceProps {
  selectedGPTs: any[];
  collaborationMode: "parallel" | "sequential";
}

export function GPTWorkspace({
  selectedGPTs,
  collaborationMode,
}: GPTWorkspaceProps) {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiResponses, setAIResponses] = useState<AIResponse[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
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

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiResponses]);

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
        sessId = await createSession(authToken);
        setCurrentSessionId(sessId);
      }

      let finalResponses: AIResponse[] = [];

      if (collaborationMode === "parallel") {
        // 并行模式：多个AI同时处理
        finalResponses = await handleParallelMode(
          sessId,
          authToken,
          userMessage.content as string,
          initialResponses
        );
      } else {
        // 顺序模式：AI依次处理
        finalResponses = await handleSequentialMode(
          sessId,
          authToken,
          userMessage.content as string,
          initialResponses
        );
      }

      // 完成后保存多AI响应为一条消息
      const finalMessage: Message = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: finalResponses,
        isMultiAI: true,
        timestamp: new Date(),
      };
      addMessage(finalMessage);
      setAIResponses([]);
    } catch (error) {
      console.error("Multi-AI collaboration error:", error);
      setError(error instanceof Error ? error.message : t.workspace.error);
      toast.error(error instanceof Error ? error.message : t.workspace.error);
    } finally {
      setIsProcessing(false);
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
          }),
        });

        if (!response.ok) {
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
    return results;
  };

  // 顺序模式处理 - 使用真实 API
  const handleSequentialMode = async (
    sessionId: string,
    token: string,
    userMessage: string,
    responses: AIResponse[]
  ): Promise<AIResponse[]> => {
    let previousContent = userMessage;

    for (let i = 0; i < selectedGPTs.length; i++) {
      const gpt = selectedGPTs[i];

      try {
        // 更新状态为处理中
        setAIResponses((prev) =>
          prev.map((r) =>
            r.agentId === gpt.id ? { ...r, status: "processing" as const } : r
          )
        );

        // 在顺序模式中，每个AI都能看到前面AI的输出
        const currentMessage =
          i === 0
            ? previousContent
            : `${previousContent}\n\n请基于以上内容进行分析和补充。`;

        // 调用真实 API
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
            temperature: 0.7,
            maxTokens: 2000,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        // 处理 SSE 流式响应
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = "";
        let finalTokens = 0;
        let finalCost = 0;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));

                  if (data.type === "content") {
                    accumulatedContent += data.content;

                    // 实时更新该AI的响应
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
                    finalTokens = data.tokens || 0;
                    finalCost = data.cost || 0;
                  } else if (data.type === "error") {
                    throw new Error(data.error);
                  }
                } catch (e) {
                  // 忽略 JSON 解析错误
                }
              }
            }
          }
        }

        // 标记为完成
        setAIResponses((prev) =>
          prev.map((r) =>
            r.agentId === gpt.id
              ? {
                  ...r,
                  content: accumulatedContent,
                  tokens: finalTokens,
                  cost: finalCost,
                  status: "completed" as const,
                }
              : r
          )
        );

        // 更新previousContent供下一个AI使用
        previousContent = accumulatedContent;

        // 标记前面的AI为已完成
        if (i > 0) {
          setAIResponses((prev) =>
            prev.map((r, idx) =>
              idx < i ? { ...r, status: "completed" as const } : r
            )
          );
        }
      } catch (error) {
        console.error(`AI ${gpt.name} error:`, error);
        setAIResponses((prev) =>
          prev.map((r) =>
            r.agentId === gpt.id
              ? { ...r, status: "error" as const, content: `Error: ${error}` }
              : r
          )
        );
        break; // 顺序模式遇错即停
      }
    }

    // 返回最终的响应状态
    return aiResponses;
  };

  const createSession = async (token: string): Promise<string> => {
    try {
      const response = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `AI 协作会话 - ${new Date().toLocaleString("zh-CN")}`,
          model: selectedGPTs[0]?.model || "gpt-3.5-turbo",
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.status}`);
      }

      const data = await response.json();
      console.log(`Session created:`, data.session);
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
    localStorage.removeItem("workspace-messages");
    localStorage.removeItem("workspace-session-id");
    console.log("Cleared conversation from localStorage");
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
      <div className="flex-1 overflow-y-auto p-2 sm:p-4 lg:p-6 space-y-4">
        {messages.length === 0 && selectedGPTs.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-blue-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {t.workspace.welcome}
            </h3>
            <p className="text-sm text-gray-500 mb-6">{t.workspace.selectAI}</p>
          </div>
        )}

        {messages.length === 0 && selectedGPTs.length > 0 && (
          <div className="text-center py-12">
            <Bot className="w-16 h-16 text-blue-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {selectedGPTs.length} AI {t.workspace.aiReady}
            </h3>
            <p className="text-sm text-gray-500 mb-2">
              {collaborationMode === "parallel"
                ? t.workspace.parallel
                : t.workspace.sequential}
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
                <div className="flex-1 max-w-xs sm:max-w-2xl lg:max-w-3xl text-right">
                  <Card className="p-2 sm:p-4 bg-blue-500 text-white">
                    <p className="text-xs sm:text-sm whitespace-pre-wrap break-words">
                      {message.content as string}
                    </p>
                  </Card>
                </div>
                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-4 sm:w-5 h-4 sm:h-5 text-white" />
                </div>
              </div>
            ) : message.isMultiAI ? (
              // 多AI响应
              <div className="space-y-3">
                <div className="flex items-center space-x-2 mb-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  <h4 className="font-semibold text-blue-900">
                    {t.workspace.collaboration} (
                    {(message.content as AIResponse[]).length} AI)
                  </h4>
                </div>

                {(message.content as AIResponse[]).map((aiResp, idx) => (
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

                    <div className="flex-1">
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

                      <Card className="p-4 bg-white border-gray-200">
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {aiResp.content || t.workspace.pending}
                        </p>

                        {aiResp.status === "completed" && aiResp.tokens && (
                          <div className="flex items-center space-x-3 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                            <div className="flex items-center space-x-1">
                              <Zap className="w-3 h-3" />
                              <span>{aiResp.tokens} tokens</span>
                            </div>
                            {aiResp.cost && (
                              <Badge variant="secondary" className="text-xs">
                                ${aiResp.cost.toFixed(6)}
                              </Badge>
                            )}
                          </div>
                        )}
                      </Card>
                    </div>

                    {collaborationMode === "sequential" &&
                      idx < (message.content as AIResponse[]).length - 1 && (
                        <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-4" />
                      )}
                  </div>
                ))}
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
              {aiResponses.map((aiResp, index) => (
                <div
                  key={aiResp.agentId}
                  className="flex items-center space-x-3"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${getStatusColor(
                      aiResp.status
                    )}`}
                  >
                    {getStatusIcon(aiResp.status)}
                  </div>

                  <div className="flex-1">
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
                      <Card className="p-3 bg-white border-gray-200">
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {aiResp.content}
                          {aiResp.status === "processing" && (
                            <span className="inline-block w-2 h-4 ml-1 bg-blue-500 animate-pulse" />
                          )}
                        </p>
                      </Card>
                    )}
                  </div>

                  {collaborationMode === "sequential" &&
                    index < aiResponses.length - 1 && (
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    )}
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

      {/* 输入区域 */}
      <div className="border-t border-gray-200 p-2 sm:p-4 bg-white">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.workspace.placeholder}
            className="flex-1 min-h-[60px] sm:min-h-[80px] max-h-[200px] resize-none text-sm sm:text-base"
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
            className="px-4 sm:px-6 h-[40px] sm:h-[80px] self-end sm:self-auto"
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>

        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
          <span>
            {selectedGPTs.length} AI {t.workspace.aiSelected} |
            {collaborationMode === "parallel"
              ? ` ${t.workspace.parallel}`
              : ` ${t.workspace.sequential}`}
          </span>
          <span>{t.workspace.enterToSend}</span>
        </div>
      </div>
    </div>
  );
}
