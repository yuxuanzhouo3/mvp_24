"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AIAgent {
  id: string;
  name: string;
  provider: string;
  model: string;
  description: string;
  capabilities: string[];
  icon?: string;
}

interface AISelectorDropdownProps {
  availableAIs: AIAgent[];
  selectedAIs: AIAgent[];
  onSelectionChange: (ais: AIAgent[]) => void;
  onClose: () => void;
}

export function AISelectorDropdown({
  availableAIs,
  selectedAIs,
  onSelectionChange,
  onClose,
}: AISelectorDropdownProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // 过滤AI
  const filteredAIs = availableAIs.filter((ai) =>
    ai.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 按类别分组
  const groupedAIs = filteredAIs.reduce((groups, ai) => {
    // 根据描述判断分类
    let category = "其他模型";
    if (ai.description.includes("旗舰") || ai.description.includes("最强")) {
      category = "旗舰模型";
    } else if (
      ai.description.includes("性价比") ||
      ai.description.includes("平衡")
    ) {
      category = "平衡模型";
    } else if (
      ai.description.includes("快速") ||
      ai.description.includes("Flash") ||
      ai.description.includes("Turbo")
    ) {
      category = "快速模型";
    } else if (
      ai.description.includes("特殊") ||
      ai.description.includes("百万") ||
      ai.description.includes("代码")
    ) {
      category = "特殊场景";
    }

    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(ai);
    return groups;
  }, {} as Record<string, AIAgent[]>);

  // 切换选择 - 直接生效
  const toggleAI = (ai: AIAgent) => {
    const isSelected = selectedAIs.some((s) => s.id === ai.id);
    let newSelection: AIAgent[];

    if (isSelected) {
      newSelection = selectedAIs.filter((s) => s.id !== ai.id);
    } else {
      // 检查是否已达到最大选择数量
      if (selectedAIs.length >= 4) {
        return; // 不允许选择更多
      }
      newSelection = [...selectedAIs, ai];
    }

    // 立即更新选择
    onSelectionChange(newSelection);
  };

  return (
    <Card
      ref={dropdownRef}
      className="absolute bottom-full left-0 mb-2 w-80 shadow-lg z-50"
    >
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="text-sm font-semibold">选择AI模型</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 搜索框 */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="搜索AI模型..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* AI列表 */}
      <ScrollArea className="h-96">
        <div className="p-2">
          {Object.keys(groupedAIs).length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              没有找到匹配的AI模型
            </div>
          ) : (
            Object.entries(groupedAIs).map(([category, ais]) => (
              <div key={category} className="mb-3">
                {/* 分类标题 */}
                <div className="px-2 py-1 text-xs font-semibold text-gray-500">
                  {category}
                </div>

                {/* AI列表 */}
                {ais.map((ai) => {
                  const isSelected = selectedAIs.some((s) => s.id === ai.id);
                  const isDisabled = !isSelected && selectedAIs.length >= 4;
                  return (
                    <div
                      key={ai.id}
                      className={`flex items-start gap-3 px-2 py-2 rounded-md ${
                        isDisabled
                          ? "cursor-not-allowed opacity-50"
                          : "cursor-pointer hover:bg-gray-50"
                      } ${isSelected ? "bg-blue-50" : ""}`}
                      onClick={() => !isDisabled && toggleAI(ai)}
                    >
                      <Checkbox
                        checked={isSelected}
                        disabled={isDisabled}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {ai.icon && <span className="text-sm">{ai.icon}</span>}
                          <span className="text-sm font-medium">{ai.name}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                          {ai.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* 底部统计 */}
      <div className="p-3 border-t">
        <div className="text-sm text-gray-500 text-center">
          已选 {selectedAIs.length}/4 个
          {selectedAIs.length >= 4 && (
            <span className="ml-2 text-orange-600">(已达上限)</span>
          )}
        </div>
      </div>
    </Card>
  );
}
