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
}

export function ChatToolbar({
  selectedAIs,
  onAIsChange,
  availableAIs,
}: ChatToolbarProps) {
  const [showAISelector, setShowAISelector] = useState(false);

  // 显示当前选中的AI
  const getAIDisplayText = () => {
    if (selectedAIs.length === 0) {
      return "选择AI模型";
    }
    return `已选 ${selectedAIs.length}/4`;
  };

  // 移除单个AI
  const removeAI = (aiId: string) => {
    onAIsChange(selectedAIs.filter((ai) => ai.id !== aiId));
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-200 bg-white">
      {/* AI 选择器 */}
      <div className="relative">
        <Button
          variant="outline"
          className="h-9 px-3 gap-2 text-sm font-normal"
          onClick={() => setShowAISelector(!showAISelector)}
        >
          <Bot className="h-4 w-4" />
          {getAIDisplayText()}
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
        </Button>

        {/* AI 选择下拉菜单 */}
        {showAISelector && (
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
              className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-sm"
            >
              {ai.icon && <span className="text-xs">{ai.icon}</span>}
              <span>{ai.name}</span>
              <button
                onClick={() => removeAI(ai.id)}
                className="hover:bg-blue-100 rounded p-0.5"
                title={`移除 ${ai.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
