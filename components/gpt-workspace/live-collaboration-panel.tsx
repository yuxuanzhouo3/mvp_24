import { Fragment } from "react";
import type { ReactElement } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import {
  Users,
  Loader2,
  GitBranch,
  ArrowRight,
  Copy,
  Share2,
  Download,
} from "lucide-react";
import { TASK_GRAPH_PRESETS } from "@/data/task-graph-presets";
import { topoLayers, type TaskGraphSpec } from "@/types/task-graph";
import type { AIResponse, CollaborationMode } from "./types";
import { SmoothStreamText } from "./smooth-stream-text";

interface LiveCollaborationPanelProps {
  isProcessing: boolean;
  aiResponses: AIResponse[];
  showPreflightPlaceholder?: boolean;
  effectiveCollaborationMode: CollaborationMode;
  activeTaskGraphSpec: TaskGraphSpec | null;
  taskGraphPresetId: string;
  language: string;
  t: any;
  getStatusColor: (status: string) => string;
  getStatusIcon: (status: string) => ReactElement;
  getLiveResponseAnchorId: (response: AIResponse, index: number) => string;
  onCopyContent: (content: string) => void;
  onDownloadContent: (content: string) => void;
  shareMessageByLink: (content: string) => Promise<void>;
}

export function LiveCollaborationPanel({
  isProcessing,
  aiResponses,
  showPreflightPlaceholder = false,
  effectiveCollaborationMode,
  activeTaskGraphSpec,
  taskGraphPresetId,
  language,
  t,
  getStatusColor,
  getStatusIcon,
  getLiveResponseAnchorId,
  onCopyContent,
  onDownloadContent,
  shareMessageByLink,
}: LiveCollaborationPanelProps) {
  const isSmartAgentId = (value?: string) => {
    const normalized = (value || "").trim().toLowerCase();
    return normalized === "smart-model" || normalized.includes("smart-model");
  };

  const isSmartAgentName = (value?: string) => {
    const normalized = (value || "").trim().toLowerCase();
    return normalized.includes("smart model") || normalized.includes("智能模型");
  };

  const isSmartResponse = (resp?: AIResponse) =>
    !!resp && (isSmartAgentId(resp.agentId) || isSmartAgentName(resp.agentName));
  const looksLikeMarkdown = (value?: string) => {
    const text = (value || "").trim();
    if (!text) return false;
    return /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|~~~)|\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\|.+\|/.test(
      text
    );
  };
  const hasSmartResponse = aiResponses.some((resp) => isSmartResponse(resp));
  const smartPanelClass =
    "bg-[linear-gradient(90deg,#2f8cff14_0%,#7a5cff14_35%,#ff2d9514_70%,#ff8a1f14_100%)] border-violet-200";
  const smartAvatarClass =
    "bg-[linear-gradient(145deg,#64b5ff_0%,#9f8bff_35%,#ff78bc_70%,#ffb36b_100%)] border border-white/70 ring-1 ring-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_20px_-12px_rgba(99,102,241,0.45)]";

  if (!isProcessing) {
    return null;
  }

  if (aiResponses.length === 0) {
    if (!showPreflightPlaceholder) {
      return null;
    }
    return (
      <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-blue-900">{t.workspace.collaboration}</h3>
          </div>
          <Badge variant="secondary" className="bg-blue-100 text-blue-800 animate-pulse">
            {t.workspace.processing}
          </Badge>
        </div>
        <div className="flex items-start gap-2 text-sm text-blue-800">
          <Loader2 className="w-4 h-4 mt-0.5 animate-spin" />
          <span>
            {language === "zh"
              ? "正在处理输入并启动模型，请稍候..."
              : "Processing input and starting models..."}
          </span>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`p-4 ${hasSmartResponse ? smartPanelClass : "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200"}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-blue-900">{t.workspace.collaboration}</h3>
        </div>
        <Badge variant="secondary" className="bg-blue-100 text-blue-800 animate-pulse">
          {t.workspace.processing}
        </Badge>
      </div>

      {effectiveCollaborationMode === "graph" && !activeTaskGraphSpec && (
        <Card className="p-3 bg-white/60 border-blue-100 mb-4">
          <div className="flex items-start gap-2">
            <Loader2 className="w-4 h-4 mt-0.5 text-blue-600 animate-spin" />
            <div>
              <div className="text-sm font-semibold text-blue-900">
                {language === "zh" ? "正在构建任务图" : "Building Task Graph"}
              </div>
              <div className="text-xs text-blue-700/80 mt-0.5">
                {language === "zh"
                  ? "系统正在拆解问题并分配节点，马上开始逐节点输出。"
                  : "We are decomposing your goal and assigning nodes. Execution will start shortly."}
              </div>
            </div>
          </div>
        </Card>
      )}

      {activeTaskGraphSpec && (
        <Card className="p-3 bg-white/60 border-blue-100 mb-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <GitBranch className="w-4 h-4 text-blue-600" />
            <div className="text-sm font-semibold text-blue-900">任务图模式执行中</div>
            <Badge variant="outline" className="text-xs">
              {activeTaskGraphSpec.nodes.length} 节点
            </Badge>
            <Badge variant="outline" className="text-xs">
              {TASK_GRAPH_PRESETS.find((p) => p.id === taskGraphPresetId)?.name || "模板"}
            </Badge>
          </div>

          <div className="mb-1 text-[11px] text-blue-700/80">
            {language === "zh" ? "可左右滑动查看完整节点流" : "Scroll horizontally to view all nodes"}
          </div>
          <div className="overflow-x-auto pb-1">
            <div className="flex items-start gap-3 min-w-max">
              {topoLayers(activeTaskGraphSpec).map((layer, idx, arr) => (
                <Fragment key={`live-layer-${idx}`}>
                  <div className="w-[220px] sm:w-[240px] flex-shrink-0 space-y-2">
                    {layer.map((nodeId) => {
                      const node = activeTaskGraphSpec.nodes.find((n) => n.id === nodeId);
                      const r = aiResponses.find((x) => x.nodeId === nodeId);
                      const nodeStatus =
                        r?.status ||
                        (((r?.content || "").trim().length > 0) ? "completed" : "pending");
                      return (
                        <div
                          key={nodeId}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200"
                        >
                          <div
                            className={`w-2.5 h-2.5 rounded-full ${getStatusColor(nodeStatus)}`}
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-gray-800 truncate">
                              {node?.title || nodeId}
                            </div>
                            <div className="text-[11px] text-gray-500 truncate">
                              {(r?.agentName || node?.agentId || "AI") +
                                (r?.model && !isSmartResponse(r) ? ` · ${r.model}` : "")}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {idx < arr.length - 1 && (
                    <div className="pt-3 flex-shrink-0">
                      <ArrowRight className="w-4 h-4 text-blue-300" />
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {aiResponses.map((aiResp, idx) => {
          const hasTextContent = (aiResp.content || "").trim().length > 0;
          const resolvedStatus = aiResp.status || (hasTextContent ? "completed" : "pending");
          const renderProcessingAsMarkdown =
            resolvedStatus === "processing" && looksLikeMarkdown(aiResp.content);

          return (
            <div
              key={aiResp.nodeId || `${aiResp.agentId}-${idx}`}
              className="flex items-start space-x-3 group"
              id={getLiveResponseAnchorId(aiResp, idx)}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isSmartResponse(aiResp) ? smartAvatarClass : getStatusColor(resolvedStatus)
                }`}
              >
                {getStatusIcon(resolvedStatus)}
              </div>

              <div className="flex-1 max-w-xs sm:max-w-2xl lg:max-w-3xl">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="font-medium text-sm">
                    {aiResp.nodeTitle ? `${aiResp.nodeTitle} · ${aiResp.agentName}` : aiResp.agentName}
                  </span>
                  {aiResp.model && !isSmartResponse(aiResp) && (
                    <Badge variant="outline" className="text-xs">
                      {aiResp.model}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {resolvedStatus === "completed"
                      ? t.workspace.completed
                      : resolvedStatus === "processing"
                        ? t.workspace.processing_status
                        : t.workspace.pending}
                  </Badge>
                </div>

                {(aiResp.content || resolvedStatus === "processing") && (
                  <>
                    <Card className="p-3 bg-white border-gray-200 max-w-full">
                      {resolvedStatus === "processing" ? (
                        renderProcessingAsMarkdown ? (
                          aiResp.content ? (
                            <MarkdownRenderer content={aiResp.content} />
                          ) : (
                            <p className="text-sm text-gray-500">{t.workspace.pending}</p>
                          )
                        ) : (
                          <SmoothStreamText
                            text={aiResp.content || ""}
                            isStreaming={resolvedStatus === "processing"}
                            className="text-[15px] leading-7 whitespace-pre-wrap break-words text-gray-800 min-h-6"
                          />
                        )
                      ) : aiResp.content ? (
                        <MarkdownRenderer content={aiResp.content} />
                      ) : (
                        <p className="text-sm text-gray-500">{t.workspace.pending}</p>
                      )}
                    </Card>

                    {resolvedStatus === "completed" && (
                      <div className="flex items-center gap-0.5 mt-1">
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
      </div>
    </Card>
  );
}
