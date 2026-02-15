import { Button } from "@/components/ui/button";
import { ChatToolbar } from "@/components/chat-toolbar";
import { TASK_GRAPH_PRESETS } from "@/data/task-graph-presets";
import {
  Bot,
  Brain,
  ChevronDown,
  GitBranch,
  Layers,
  ListOrdered,
  Mic,
  Paperclip,
  Send,
  Volume2,
  X,
} from "lucide-react";
import type {
  AIAgent,
  CollaborationMode,
} from "./types";
import { useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { MultimodalAttachmentPayload } from "@/lib/chat/multimodal-types";

interface ChatInputPanelProps {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  placeholder: string;
  selectedGPTs: AIAgent[];
  setSelectedGPTs: (gpts: AIAgent[]) => void;
  availableAIs: AIAgent[];
  currentSessionId?: string;
  sessionConfig: any;
  effectiveCollaborationMode: CollaborationMode;
  setCollaborationMode: (mode: CollaborationMode) => void;
  modeMenuOpen: boolean;
  setModeMenuOpen: Dispatch<SetStateAction<boolean>>;
  onCollaborationModeChange: (mode: CollaborationMode) => void;
  taskGraphPresetId: string;
  setTaskGraphPresetId: Dispatch<SetStateAction<string>>;
  isProcessing: boolean;
  onSend: () => void;
  onStop: () => void;
  notifyComingSoon: (feature: "upload" | "voice" | "record") => void;
  language: string;
  attachments: MultimodalAttachmentPayload[];
  isRecording: boolean;
  recordingSeconds: number;
  onToggleRecording: () => void;
  onPickFiles: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
  onClearAttachments: () => void;
}

export function ChatInputPanel({
  input,
  setInput,
  placeholder,
  selectedGPTs,
  setSelectedGPTs,
  availableAIs,
  currentSessionId,
  sessionConfig,
  effectiveCollaborationMode,
  setCollaborationMode,
  modeMenuOpen,
  setModeMenuOpen,
  onCollaborationModeChange,
  taskGraphPresetId,
  setTaskGraphPresetId,
  isProcessing,
  onSend,
  onStop,
  notifyComingSoon,
  language,
  attachments,
  isRecording,
  recordingSeconds,
  onToggleRecording,
  onPickFiles,
  onRemoveAttachment,
  onClearAttachments,
}: ChatInputPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formatBytes = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return "0B";
    if (value < 1024) return `${Math.round(value)}B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
    return `${(value / (1024 * 1024)).toFixed(1)}MB`;
  };
  const formatRecordingTime = (seconds: number) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const min = Math.floor(safe / 60);
    const sec = safe % 60;
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="p-2 pt-0 sm:p-3 sm:pt-0 bg-white">
      <div className="max-w-4xl mx-auto rounded-2xl sm:rounded-[1.75rem] overflow-visible bg-white flex flex-col relative text-sm sm:text-base">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="relative z-0 flex-1 min-h-[44px] sm:min-h-[80px] w-full border-0 focus:border-0 focus-visible:border-0 focus:ring-0 focus-visible:ring-0 focus:ring-offset-0 focus-visible:ring-offset-0 ring-0 ring-offset-0 shadow-none focus:shadow-none focus-visible:shadow-none resize-none p-2 sm:p-3 bg-transparent rounded-none outline-none focus:outline-none focus-visible:outline-none appearance-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            border: "none",
            outline: "none",
            boxShadow: "none",
            WebkitAppearance: "none",
            appearance: "none",
            borderRadius: 0,
            background: "transparent",
          }}
          onKeyDown={(e) => {
            const isComposing =
              (e.nativeEvent as KeyboardEvent).isComposing || e.keyCode === 229;
            if (isComposing) return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          disabled={selectedGPTs.length === 0}
        />

        {attachments.length > 0 && (
          <div className="px-2 sm:px-3 pt-2 pb-1 bg-white">
            <div className="flex flex-wrap items-center gap-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-700"
                >
                  <span className="max-w-[180px] truncate">{attachment.name}</span>
                  <span className="text-gray-400">{formatBytes(attachment.size)}</span>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700"
                    onClick={() => onRemoveAttachment(attachment.id)}
                    aria-label={language === "zh" ? "移除附件" : "Remove attachment"}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {attachments.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-gray-500 hover:text-gray-700"
                  onClick={onClearAttachments}
                >
                  {language === "zh" ? "清空附件" : "Clear all"}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="relative z-20 px-2 sm:px-3 py-1.5 sm:py-2 bg-gray-50/30 rounded-b-2xl sm:rounded-b-[1.75rem]">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept="image/*,video/*,audio/*,.txt,.md,.markdown,.json,.csv,.ts,.tsx,.js,.jsx,.py,.java,.go,.rs,.sql,.xml,.yml,.yaml,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
            onChange={(e) => {
              onPickFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />

          <div className="flex items-center justify-between gap-1 sm:gap-2">
            <div className="relative z-30 flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-7 sm:h-8 px-2.5 sm:px-3.5 rounded-full text-xs sm:text-sm font-medium flex items-center gap-1.5 flex-shrink-0"
                onClick={() => setModeMenuOpen(!modeMenuOpen)}
                title="选择协作模式"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>
                  {effectiveCollaborationMode === "normal"
                    ? "普通模式"
                    : effectiveCollaborationMode === "sequential"
                    ? "顺序模式"
                    : effectiveCollaborationMode === "deep"
                      ? "深度模式"
                      : effectiveCollaborationMode === "graph"
                        ? "任务图模式"
                        : "并行模式"}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    modeMenuOpen ? "-rotate-180" : ""
                  }`}
                />
              </Button>

              {modeMenuOpen && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-[80] w-max flex flex-col gap-1">
                  <Button
                    variant={effectiveCollaborationMode === "normal" ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-2 text-xs flex items-center gap-2 justify-start min-w-max"
                    onClick={() => onCollaborationModeChange("normal")}
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>普通模式</span>
                  </Button>

                  <Button
                    variant={effectiveCollaborationMode === "parallel" ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-2 text-xs flex items-center gap-2 justify-start min-w-max"
                    onClick={() => onCollaborationModeChange("parallel")}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>并行模式</span>
                  </Button>

                  <Button
                    variant={effectiveCollaborationMode === "sequential" ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-2 text-xs flex items-center gap-2 justify-start min-w-max"
                    onClick={() => onCollaborationModeChange("sequential")}
                  >
                    <ListOrdered className="w-3.5 h-3.5" />
                    <span>顺序模式</span>
                  </Button>

                  <Button
                    variant={effectiveCollaborationMode === "deep" ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-2 text-xs flex items-center gap-2 justify-start min-w-max"
                    onClick={() => onCollaborationModeChange("deep")}
                  >
                    <Brain className="w-3.5 h-3.5" />
                    <span>深度模式</span>
                  </Button>

                  <Button
                    variant={effectiveCollaborationMode === "graph" ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-2 text-xs flex items-center gap-2 justify-start min-w-max"
                    onClick={() => onCollaborationModeChange("graph")}
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

            <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
              <div className="flex items-center gap-0.5 text-gray-400">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full"
                  onClick={() => fileInputRef.current?.click()}
                  title={language === "zh" ? "上传附件" : "Upload files"}
                  aria-label={language === "zh" ? "上传附件" : "Upload files"}
                >
                  <Paperclip className="w-3.5 h-3.5" />
                </Button>
                <div className="hidden sm:flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full"
                    onClick={() => notifyComingSoon("voice")}
                    title={language === "zh" ? "语音输入（即将上线）" : "Voice input (coming soon)"}
                    aria-label={
                      language === "zh" ? "语音输入（即将上线）" : "Voice input (coming soon)"
                    }
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 rounded-full ${
                    isRecording
                      ? "text-red-600 bg-red-50 hover:bg-red-100"
                      : ""
                  }`}
                  onClick={onToggleRecording}
                  title={
                    isRecording
                      ? language === "zh"
                        ? "停止录音"
                        : "Stop recording"
                      : language === "zh"
                        ? "开始录音"
                        : "Start recording"
                  }
                  aria-label={
                    isRecording
                      ? language === "zh"
                        ? "停止录音"
                        : "Stop recording"
                      : language === "zh"
                        ? "开始录音"
                        : "Start recording"
                  }
                >
                  <Mic className={`w-3.5 h-3.5 ${isRecording ? "animate-pulse" : ""}`} />
                </Button>
                {isRecording && (
                  <span className="text-[10px] font-medium text-red-600 tabular-nums">
                    {formatRecordingTime(recordingSeconds)}
                  </span>
                )}
              </div>

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

              <Button
                onClick={isProcessing ? onStop : onSend}
                disabled={
                  selectedGPTs.length === 0 ||
                  isRecording ||
                  (!isProcessing && !input.trim() && attachments.length === 0)
                }
                title={
                  isProcessing
                    ? language === "zh"
                      ? "停止生成"
                      : "Stop generation"
                    : language === "zh"
                      ? "发送"
                      : "Send"
                }
                aria-label={
                  isProcessing
                    ? language === "zh"
                      ? "停止生成"
                      : "Stop generation"
                    : language === "zh"
                      ? "发送"
                      : "Send"
                }
                className={`h-8 w-8 sm:h-9 sm:w-9 rounded-full p-0 flex-shrink-0 shadow-sm ${
                  isProcessing ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"
                }`}
              >
                {isProcessing ? <X className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="absolute inset-0 border border-gray-200 rounded-2xl sm:rounded-[1.75rem] pointer-events-none" />
      </div>
    </div>
  );
}
