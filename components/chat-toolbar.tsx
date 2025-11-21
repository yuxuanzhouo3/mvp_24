"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Bot, X } from "lucide-react";
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
}

export function ChatToolbar({
  selectedAIs,
  onAIsChange,
  availableAIs,
  sessionId,
  sessionConfig,
}: ChatToolbarProps) {
  const [showAISelector, setShowAISelector] = useState(false);

  // 会话创建且为多AI时，禁用AI选择
  const isSessionLocked = sessionId && sessionConfig?.isMultiAI;

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

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-200 bg-white">
      {/* AI 选择器 */}
      <div className="relative">
        <Button
          variant={isSessionLocked ? "secondary" : "outline"}
          className={`h-9 px-3 gap-2 text-sm font-normal ${isSessionLocked ? "opacity-60 cursor-not-allowed" : ""}`}
          onClick={() => !isSessionLocked && setShowAISelector(!showAISelector)}
          disabled={isSessionLocked}
        >
          <Bot className="h-4 w-4" />
          {getAIDisplayText()}
          {!isSessionLocked && (
            <svg
              className="h-4 w-4 ml-1"
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
          />
        )}
      </div>

      {/* 显示已选择的AI标签 */}
      {selectedAIs.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {selectedAIs.map((ai) => (
            <div
              key={ai.id}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm ${
                isSessionLocked
                  ? "bg-gray-200 text-gray-600"
                  : "bg-blue-50 text-blue-700"
              }`}
            >
              {ai.icon && <span className="text-xs">{ai.icon}</span>}
              <span>{ai.name}</span>
              {!isSessionLocked && (
                <button
                  onClick={() => removeAI(ai.id)}
                  className="hover:bg-blue-100 rounded p-0.5"
                  title={`移除 ${ai.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 显示锁定提示 */}
      {isSessionLocked && (
        <div className="text-xs text-gray-500 ml-2">
          AI配置已锁定。创建新会话以更改AI配置。
        </div>
      )}
    </div>
  );
}
