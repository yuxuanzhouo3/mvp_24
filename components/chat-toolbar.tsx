"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bot, X, ChevronDown, Sparkles } from "lucide-react";
import { AISelectorDropdown } from "./ai-selector-dropdown";

interface AIAgent {
  id: string;
  name: string;
  provider: string;
  model: string;
  description: string;
  capabilities: string[];
  icon?: string;
}

interface ChatToolbarProps {
  selectedAIs: AIAgent[];
  onAIsChange: (ais: AIAgent[]) => void;
  availableAIs: AIAgent[];
  sessionId?: string;
  sessionConfig?: any;
  collaborationMode?: "parallel" | "sequential" | "deep" | "graph";
  onCollaborationModeChange?: (mode: "parallel" | "sequential" | "deep" | "graph") => void;
  variant?: "default" | "integrated";
}

export function ChatToolbar({
  selectedAIs,
  onAIsChange,
  availableAIs,
  sessionId,
  sessionConfig,
  collaborationMode = "parallel",
  onCollaborationModeChange,
  variant = "default",
}: ChatToolbarProps) {
  const [showAISelector, setShowAISelector] = useState(false);
  const selectorTriggerRef = useRef<HTMLDivElement | null>(null);
  const smartGradientTextClass =
    "bg-[linear-gradient(90deg,#2f8cff_0%,#7a5cff_35%,#ff2d95_70%,#ff8a1f_100%)] bg-clip-text text-transparent";
  const smartGradientSoftClass =
    "bg-[linear-gradient(90deg,#2f8cff14_0%,#7a5cff14_35%,#ff2d9514_70%,#ff8a1f14_100%)]";
  const smartGradientHoverClass =
    "hover:bg-[linear-gradient(90deg,#2f8cff24_0%,#7a5cff24_35%,#ff2d9522_70%,#ff8a1f22_100%)]";
  const smartGradientMutedClass =
    "bg-[linear-gradient(90deg,#2f8cff21_0%,#7a5cff21_35%,#ff2d951e_70%,#ff8a1f1e_100%)]";
  const isSmartModel = (ai: AIAgent) =>
    ai.model === "smart-auto" || ai.id.includes("smart-model");
  const isSingleSmartModel =
    selectedAIs.length === 1 && isSmartModel(selectedAIs[0]);

  // ✅ 改进：会话创建且有 multi_ai_config 时，禁用AI选择
  // 无论是单AI还是多AI，都应该被锁定
  const isSessionLocked = sessionId && sessionConfig;

  // 显示当前选中的AI
  const getAIDisplayText = () => {
    if (selectedAIs.length === 0) {
      return "选择AI模型";
    }
    if (isSessionLocked) {
      return `🔒 已锁定 ${selectedAIs.length} AI`;
    }
    return `已选 ${selectedAIs.length}/4`;
  };

  // 移除单个AI
  const removeAI = (aiId: string) => {
    if (isSessionLocked) {
      return;
    }
    onAIsChange(selectedAIs.filter((ai) => ai.id !== aiId));
  };

  if (variant === "integrated") {
    return (
      <div className="flex items-center gap-1 min-w-0">
        <div ref={selectorTriggerRef} className="relative min-w-0">
          <Button
            variant="outline"
            className={`h-7 sm:h-8 px-2 sm:px-3 gap-1 sm:gap-2 text-[11px] sm:text-sm font-normal rounded-lg sm:rounded-xl min-w-0 transition-all ${
              isSingleSmartModel
                ? `${smartGradientSoftClass} ${smartGradientHoverClass} border-violet-200 text-slate-700 shadow-[0_10px_24px_-16px_rgba(168,85,247,0.65)]`
                : "border-gray-200 hover:bg-gray-50"
            } ${isSessionLocked ? "opacity-60 cursor-not-allowed" : ""}`}
            onClick={() => !isSessionLocked && setShowAISelector((prev) => !prev)}
            disabled={isSessionLocked}
          >
            {isSingleSmartModel ? (
              <Sparkles className="w-3.5 h-3.5 text-fuchsia-500 flex-shrink-0" />
            ) : (
              <Bot className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            )}
            <span
              className={`truncate max-w-[40px] sm:max-w-[100px] ${
                isSingleSmartModel ? smartGradientTextClass : "text-gray-700"
              }`}
            >
              {selectedAIs.length === 0
                ? "模型"
                : selectedAIs.length === 1
                ? selectedAIs[0].name.slice(0, 6)
                : `${selectedAIs.length}个`}
            </span>
            <ChevronDown
              className={`w-3 h-3 flex-shrink-0 ${
                isSingleSmartModel ? "text-fuchsia-500" : "text-gray-400"
              }`}
            />
          </Button>

          {showAISelector && !isSessionLocked && (
            <AISelectorDropdown
              availableAIs={availableAIs}
              selectedAIs={selectedAIs}
              onSelectionChange={onAIsChange}
              onClose={() => setShowAISelector(false)}
              triggerRef={selectorTriggerRef}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-2 border-t border-gray-200 bg-white relative z-20 w-full max-w-full overflow-hidden">
      {/* 协作模式选择（会话未锁定时可选） */}
      {onCollaborationModeChange && selectedAIs.length > 1 && (
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <Button
            variant={collaborationMode === "parallel" ? "default" : "outline"}
            className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm"
            onClick={() => !isSessionLocked && onCollaborationModeChange("parallel")}
            disabled={!!isSessionLocked}
          >
            并行
          </Button>
          <Button
            variant={collaborationMode === "sequential" ? "default" : "outline"}
            className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm"
            onClick={() => !isSessionLocked && onCollaborationModeChange("sequential")}
            disabled={!!isSessionLocked}
          >
            顺序
          </Button>
        </div>
      )}

      {/* AI 选择器 */}
      <div ref={selectorTriggerRef} className="relative flex-shrink-0 z-[101]">
        <Button
          variant={isSessionLocked ? "secondary" : "outline"}
          className={`h-8 sm:h-9 px-2 sm:px-3 gap-1 sm:gap-2 text-xs sm:text-sm font-normal ${
            !isSessionLocked && isSingleSmartModel
              ? `${smartGradientSoftClass} ${smartGradientHoverClass} border-violet-200 text-slate-700 shadow-[0_10px_24px_-16px_rgba(168,85,247,0.65)]`
              : ""
          } ${isSessionLocked ? "opacity-60 cursor-not-allowed" : ""}`}
          onClick={() => !isSessionLocked && setShowAISelector((prev) => !prev)}
          disabled={isSessionLocked}
        >
          {isSingleSmartModel ? (
            <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-fuchsia-500" />
          ) : (
            <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          )}
          <span className={`hidden xs:inline ${isSingleSmartModel ? smartGradientTextClass : ""}`}>
            {getAIDisplayText()}
          </span>
          <span className="xs:hidden">{selectedAIs.length > 0 ? `${selectedAIs.length}` : "+"}</span>
          {!isSessionLocked && (
            <svg
              className="h-3 w-3 sm:h-4 sm:w-4 ml-0.5 sm:ml-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          )}
        </Button>

        {/* AI 选择下拉菜单 */}
        {showAISelector && !isSessionLocked && (
          <AISelectorDropdown
            availableAIs={availableAIs}
            selectedAIs={selectedAIs}
            onSelectionChange={onAIsChange}
            onClose={() => setShowAISelector(false)}
            triggerRef={selectorTriggerRef}
          />
        )}
      </div>

      {/* 显示已选择的AI标签 */}
      {selectedAIs.length > 0 && (
        <div className="flex-1 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5 min-w-0">
          {selectedAIs.map((ai) => (
            <div
              key={ai.id}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 rounded-full text-xs sm:text-sm whitespace-nowrap flex-shrink-0 border transition-colors ${
                isSmartModel(ai)
                  ? isSessionLocked
                    ? `${smartGradientMutedClass} text-slate-500 border-violet-200`
                    : `${smartGradientSoftClass} text-slate-700 border-violet-200 shadow-[0_10px_24px_-16px_rgba(168,85,247,0.65)]`
                  : 
                isSessionLocked
                  ? "bg-gray-100 text-gray-500 border-gray-200"
                  : "bg-blue-50 text-blue-700 border-blue-100"
              }`}
            >
              {isSmartModel(ai) ? (
                <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-fuchsia-500 drop-shadow-[0_0_6px_rgba(217,70,239,0.45)]" />
              ) : (
                ai.icon && <span className="text-[10px] sm:text-xs">{ai.icon}</span>
              )}
              <span className={`font-medium ${isSmartModel(ai) ? smartGradientTextClass : ""}`}>
                {ai.name}
              </span>
              {!isSessionLocked && (
                <button
                  onClick={() => removeAI(ai.id)}
                  className={`rounded-full p-0.5 transition-colors ${
                    isSmartModel(ai)
                      ? "hover:bg-fuchsia-100/60"
                      : "hover:bg-blue-200/50"
                  }`}
                  title={`移除 ${ai.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 显示锁定提示 (仅在宽屏显示) */}
      {isSessionLocked && (
        <div className="hidden md:block text-xs text-gray-500 ml-2 whitespace-nowrap">
          AI配置已锁定
        </div>
      )}
    </div>
  );
}
