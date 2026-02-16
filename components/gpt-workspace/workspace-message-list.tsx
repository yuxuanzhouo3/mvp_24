import { Fragment } from "react";
import type { ReactElement } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import {
  Users,
  Bot,
  User,
  Loader2,
  Star,
  Sparkles,
  Copy,
  Share2,
  Download,
  ArrowRight,
  GitBranch,
} from "lucide-react";
import type { AIResponse, AIAgent, Message } from "./types";
import { topoLayers, type TaskGraphSpec } from "@/types/task-graph";

interface FavoritePayload {
  id: string;
  sessionId: string;
  anchorId: string;
  role: "user" | "assistant";
  preview: string;
}

interface WorkspaceMessageListProps {
  messages: Message[];
  selectedGPTs: AIAgent[];
  isProcessing: boolean;
  isSessionLoading?: boolean;
  t: any;
  availableAIs: AIAgent[];
  currentSessionId?: string;
  language: string;
  getMessageAnchorId: (messageId: string) => string;
  getMultiAIResponseAnchorId: (
    messageId: string,
    response: AIResponse,
    index: number
  ) => string;
  buildFavoriteId: (sessionId: string | undefined, anchorId: string) => string;
  isFavorite: (id: string) => boolean;
  toggleFavoriteWithToast: (payload: FavoritePayload) => void;
  shareMessageByLink: (content: string) => Promise<void>;
  getStatusColor: (status: string) => string;
  getStatusIcon: (status: string) => ReactElement;
  onCopyContent: (content: string) => void;
  onDownloadContent: (content: string) => void;
}

export function WorkspaceMessageList({
  messages,
  selectedGPTs,
  isProcessing,
  isSessionLoading = false,
  t,
  availableAIs,
  currentSessionId,
  language,
  getMessageAnchorId,
  getMultiAIResponseAnchorId,
  buildFavoriteId,
  isFavorite,
  toggleFavoriteWithToast,
  shareMessageByLink,
  getStatusColor,
  getStatusIcon,
  onCopyContent,
  onDownloadContent,
}: WorkspaceMessageListProps) {
  const isSmartAgentId = (value?: string) => {
    const normalized = (value || "").trim().toLowerCase();
    return normalized === "smart-model" || normalized.includes("smart-model");
  };

  const isSmartAgentName = (value?: string) => {
    const normalized = (value || "").trim().toLowerCase();
    return normalized.includes("smart model") || normalized.includes("智能模型");
  };

  const isSmartAIAgent = (agent?: { id?: string; model?: string; name?: string }) =>
    !!agent &&
    (isSmartAgentId(agent.id) ||
      (agent.model || "").trim().toLowerCase() === "smart-auto" ||
      isSmartAgentName(agent.name));

  const isSmartResponse = (resp: AIResponse) =>
    isSmartAgentId(resp.agentId) || isSmartAgentName(resp.agentName);

  const selectedSingleSmartAgent =
    selectedGPTs.length === 1 && isSmartAIAgent(selectedGPTs[0]) ? selectedGPTs[0] : null;
  const smartGradientTextClass =
    "bg-[linear-gradient(90deg,#2f8cff_0%,#7a5cff_35%,#ff2d95_70%,#ff8a1f_100%)] bg-clip-text text-transparent";
  const smartGradientChipClass =
    "bg-[linear-gradient(90deg,#2f8cff14_0%,#7a5cff14_35%,#ff2d9514_70%,#ff8a1f14_100%)] border-violet-200";
  const smartAvatarClass =
    "bg-[linear-gradient(145deg,#64b5ff_0%,#9f8bff_35%,#ff78bc_70%,#ffb36b_100%)] border border-white/70 ring-1 ring-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_20px_-12px_rgba(99,102,241,0.45)]";
  const isSmartAssistantMessage = (msg: Message) => {
    const rawAgentId = (msg as any)?.agentId;
    const rawAgentName = (msg as any)?.agentName;
    const rawModel = (msg as any)?.model;
    if (
      (typeof rawAgentId === "string" && isSmartAgentId(rawAgentId)) ||
      (typeof rawAgentName === "string" && isSmartAgentName(rawAgentName))
    ) {
      return true;
    }
    if (typeof rawModel === "string") {
      const normalized = rawModel.trim().toLowerCase();
      return normalized === "smart-auto" || normalized.includes("smart-model");
    }
    return false;
  };

  return (
    <>
      {messages.length === 0 && isSessionLoading && (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 text-gray-400 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-gray-500">
            {language === "zh" ? "正在加载对话..." : "Loading conversation..."}
          </p>
        </div>
      )}

      {messages.length === 0 && !isSessionLoading && selectedGPTs.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-16 h-16 text-blue-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{t.workspace.welcome}</h3>
          <p className="text-sm text-gray-500 mb-6">{t.workspace.selectAI}</p>
        </div>
      )}

      {messages.length === 0 &&
        !isSessionLoading &&
        selectedGPTs.length > 0 &&
        !isProcessing && (
        <div className="text-center py-12">
          <Bot className="w-16 h-16 text-blue-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {selectedGPTs.length} AI {t.workspace.aiReady}
          </h3>
          <p className="text-sm text-gray-500 mb-2">{t.workspace.parallel}</p>
          <p className="text-sm text-gray-500 mb-6">{t.workspace.example}</p>

          <div className="flex flex-wrap justify-center gap-3 max-w-2xl mx-auto">
            {selectedGPTs.map((gpt) => {
              const isSmart = isSmartAIAgent(gpt);
              return (
                <div
                  key={gpt.id}
                  className={`flex items-center gap-2 px-4 py-1.5 border rounded-full text-sm font-medium shadow-sm transition-all group ${
                    isSmart
                      ? `${smartGradientChipClass} hover:border-fuchsia-300`
                      : "bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50"
                  }`}
                >
                  {isSmart ? (
                    <Sparkles className="w-4 h-4 text-fuchsia-500 drop-shadow-[0_0_6px_rgba(217,70,239,0.45)]" />
                  ) : gpt.icon ? (
                    <span className="text-base group-hover:scale-110 transition-transform">{gpt.icon}</span>
                  ) : (
                    <Bot className="w-4 h-4 text-blue-500" />
                  )}
                  <span className={isSmart ? smartGradientTextClass : ""}>{gpt.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {messages.map((message) => (
        <div key={message.id} id={getMessageAnchorId(message.id)}>
          {message.role === "user" ? (
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
                      isFavorite(buildFavoriteId(currentSessionId, getMessageAnchorId(message.id)))
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    }`}
                    onClick={() => {
                      const anchorId = getMessageAnchorId(message.id);
                      toggleFavoriteWithToast({
                        id: buildFavoriteId(currentSessionId, anchorId),
                        sessionId: currentSessionId || "",
                        anchorId,
                        role: "user",
                        preview: typeof message.content === "string" ? message.content : "",
                      });
                    }}
                    title={language === "zh" ? "收藏这条对话" : "Favorite message"}
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        isFavorite(buildFavoriteId(currentSessionId, getMessageAnchorId(message.id)))
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
            <div className="space-y-3">
              {(message.content as AIResponse[]).length > 1 && (
                <div className="flex items-center space-x-2 mb-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  <h4 className="font-semibold text-blue-900">
                    {t.workspace.collaboration} ({(message.content as AIResponse[]).length} AI)
                  </h4>
                </div>
              )}

              {(message.content as AIResponse[]).map((aiResp, idx) => {
                const anchorId = getMultiAIResponseAnchorId(message.id, aiResp, idx);
                const favoriteId = buildFavoriteId(currentSessionId, anchorId);
                const isFav = isFavorite(favoriteId);
                const isSequentialMessage =
                  (message as any).collaborationMode === "sequential";
                const hasTextContent = (aiResp.content || "").trim().length > 0;
                const resolvedStatus = aiResp.status || (hasTextContent ? "completed" : "pending");
                const hideResponseModel = isSmartResponse(aiResp);
                const contentPreview = aiResp.content
                  ? aiResp.content.replace(/\s+/g, " ").trim().slice(0, 80)
                  : "";

                return (
                  <div
                    key={aiResp.nodeId || `${aiResp.agentId}-${idx}`}
                    className="flex items-start space-x-3 group"
                    id={anchorId}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isSmartResponse(aiResp) ? smartAvatarClass : getStatusColor(resolvedStatus)
                      }`}
                    >
                      {getStatusIcon(resolvedStatus)}
                    </div>

                    <div className="flex-1 max-w-xs sm:max-w-2xl lg:max-w-3xl">
                      {isSequentialMessage ? (
                        <details className="rounded-md border border-gray-200 bg-white px-3 py-2">
                          <summary className="cursor-pointer list-none">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-sm">
                                {aiResp.nodeTitle
                                  ? `${aiResp.nodeTitle} · ${aiResp.agentName}`
                                  : aiResp.agentName}
                              </span>
                              {aiResp.model && !hideResponseModel && (
                                <Badge variant="outline" className="text-xs">
                                  {aiResp.model}
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {resolvedStatus === "completed"
                                  ? t.workspace.completed
                                  : resolvedStatus === "processing"
                                    ? t.workspace.processing_status
                                    : resolvedStatus === "error"
                                      ? t.workspace.error
                                      : t.workspace.pending}
                              </Badge>
                            </div>
                            {contentPreview ? (
                              <p className="mt-1 text-xs text-gray-500 line-clamp-1">
                                {contentPreview}
                              </p>
                            ) : (
                              <p className="mt-1 text-xs text-gray-400">
                                {t.workspace.pending}
                              </p>
                            )}
                          </summary>

                          <Card className="mt-2 p-3 sm:p-4 bg-white border-gray-200 max-w-full">
                            {aiResp.content ? (
                              <MarkdownRenderer content={aiResp.content} />
                            ) : resolvedStatus === "completed" ? (
                              <p className="text-sm text-gray-500">
                                {language === "zh"
                                  ? "该模型未返回文本内容"
                                  : "No textual output returned by this model"}
                              </p>
                            ) : (
                              <p className="text-sm text-gray-500">{t.workspace.pending}</p>
                            )}
                          </Card>

                          {resolvedStatus === "completed" && aiResp.content && (
                            <div className="flex items-center gap-0.5 mt-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50 ${
                                  isFav ? "text-blue-600" : ""
                                }`}
                                onClick={() => {
                                  toggleFavoriteWithToast({
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
                                onClick={() => onCopyContent(aiResp.content)}
                                title={language === "zh" ? "复制" : "Copy"}
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                                onClick={() => shareMessageByLink(aiResp.content)}
                                title={language === "zh" ? "分享" : "Share"}
                              >
                                <Share2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                                onClick={() => onDownloadContent(aiResp.content)}
                                title={language === "zh" ? "下载" : "Download"}
                              >
                                <Download className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </details>
                      ) : (
                        <>
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="font-medium text-sm">
                              {aiResp.nodeTitle
                                ? `${aiResp.nodeTitle} · ${aiResp.agentName}`
                                : aiResp.agentName}
                            </span>
                            {aiResp.model && !hideResponseModel && (
                              <Badge variant="outline" className="text-xs">
                                {aiResp.model}
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-xs">
                              {resolvedStatus === "completed"
                                ? t.workspace.completed
                                : resolvedStatus === "processing"
                                  ? t.workspace.processing_status
                                  : resolvedStatus === "error"
                                    ? t.workspace.error
                                    : t.workspace.pending}
                            </Badge>
                          </div>

                          <Card className="p-3 sm:p-4 bg-white border-gray-200 max-w-full">
                            {aiResp.content ? (
                              <MarkdownRenderer content={aiResp.content} />
                            ) : resolvedStatus === "completed" ? (
                              <p className="text-sm text-gray-500">
                                {language === "zh"
                                  ? "该模型未返回文本内容"
                                  : "No textual output returned by this model"}
                              </p>
                            ) : (
                              <p className="text-sm text-gray-500">{t.workspace.pending}</p>
                            )}
                          </Card>

                          {resolvedStatus === "completed" && aiResp.content && (
                            <div className="flex items-center gap-0.5 mt-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50 ${
                                  isFav ? "text-blue-600" : ""
                                }`}
                                onClick={() => {
                                  toggleFavoriteWithToast({
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
                                onClick={() => onCopyContent(aiResp.content)}
                                title={language === "zh" ? "复制" : "Copy"}
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                                onClick={() => shareMessageByLink(aiResp.content)}
                                title={language === "zh" ? "分享" : "Share"}
                              >
                                <Share2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                                onClick={() => onDownloadContent(aiResp.content)}
                                title={language === "zh" ? "下载" : "Download"}
                              >
                                <Download className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {(message as any).taskGraph?.spec && (
                <Card className="p-3 sm:p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                  <div className="flex items-center gap-2 mb-3">
                    <GitBranch className="w-4 h-4 text-blue-600" />
                    <div className="text-sm font-semibold text-blue-900">任务图模式（2.0）</div>
                    <Badge variant="outline" className="text-xs">
                      {((message as any).taskGraph?.spec?.nodes?.length as number) || 0} 节点
                    </Badge>
                  </div>
                  <div className="mb-1 text-[11px] text-blue-700/80">
                    {language === "zh"
                      ? "可左右滑动查看完整节点流"
                      : "Scroll horizontally to view all nodes"}
                  </div>
                  <div className="overflow-x-auto pb-1">
                    <div className="flex items-start gap-3 min-w-max">
                      {topoLayers((message as any).taskGraph.spec as TaskGraphSpec).map(
                        (layer, idx, arr) => (
                          <Fragment key={`layer-${idx}`}>
                            <div className="w-[220px] sm:w-[240px] flex-shrink-0 space-y-2">
                              {layer.map((nodeId) => {
                                const specNode = (
                                  (message as any).taskGraph.spec as TaskGraphSpec
                                ).nodes.find((n) => n.id === nodeId);
                                const resp = (message.content as AIResponse[]).find(
                                  (r) => r.nodeId === nodeId
                                );
                                return (
                                  <Card key={nodeId} className="px-3 py-2 bg-white border-gray-200">
                                    <div className="text-xs font-semibold text-gray-800 line-clamp-1">
                                      {specNode?.title || nodeId}
                                    </div>
                                    <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                                      {(resp?.agentName || specNode?.agentId || "AI") +
                                        (resp?.model && !isSmartResponse(resp)
                                          ? ` · ${resp.model}`
                                          : "")}
                                    </div>
                                  </Card>
                                );
                              })}
                            </div>
                            {idx < arr.length - 1 && (
                              <div className="pt-3 flex-shrink-0">
                                <ArrowRight className="w-4 h-4 text-blue-300" />
                              </div>
                            )}
                          </Fragment>
                        )
                      )}
                    </div>
                  </div>
                </Card>
              )}
            </div>
          ) : message.role === "assistant" ? (
            <div className="flex items-start space-x-3 group" id={getMessageAnchorId(message.id)}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isSmartAssistantMessage(message) || selectedSingleSmartAgent
                    ? smartAvatarClass
                    : "bg-green-500"
                }`}
              >
                {getStatusIcon("completed")}
              </div>

              <div className="inline-block max-w-xs sm:max-w-2xl lg:max-w-3xl">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="font-medium text-sm">
                    {(message as any).agentName ||
                      selectedSingleSmartAgent?.name ||
                      availableAIs.find((ai) => ai.model === (message as any).model)?.name ||
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

                {typeof message.content === "string" && message.content && (
                  <div className="flex items-center gap-0.5 mt-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50 ${
                        isFavorite(buildFavoriteId(currentSessionId, getMessageAnchorId(message.id)))
                          ? "text-blue-600"
                          : ""
                      }`}
                      onClick={() => {
                        const anchorId = getMessageAnchorId(message.id);
                        toggleFavoriteWithToast({
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
                      onClick={() => onCopyContent(message.content as string)}
                      title={language === "zh" ? "复制" : "Copy"}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                      onClick={() => shareMessageByLink(message.content as string)}
                      title={language === "zh" ? "分享" : "Share"}
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                      onClick={() => onDownloadContent(message.content as string)}
                      title={language === "zh" ? "下载" : "Download"}
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
    </>
  );
}
