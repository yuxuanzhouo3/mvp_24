"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, X, Check } from "lucide-react";

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
    // 根据描述或名称判断分类
    let category = "其他模型";
    const desc = ai.description.toLowerCase();
    const name = ai.name.toLowerCase();
    
    if (desc.includes("旗舰") || desc.includes("最强") || name.includes("max") || name.includes("pro")) {
      category = "旗舰模型";
    } else if (desc.includes("思考") || desc.includes("thinking") || name.includes("thinking")) {
      category = "深度思考";
    } else if (desc.includes("性价比") || desc.includes("平衡") || name.includes("plus")) {
      category = "平衡模型";
    } else if (desc.includes("快速") || desc.includes("flash") || desc.includes("turbo") || name.includes("flash") || name.includes("turbo")) {
      category = "快速模型";
    } else if (desc.includes("代码") || desc.includes("coding") || desc.includes("百万") || desc.includes("128k")) {
      category = "特殊场景";
    }

    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(ai);
    return groups;
  }, {} as Record<string, AIAgent[]>);

  // 排序分类
  const categoryOrder = ["旗舰模型", "深度思考", "平衡模型", "快速模型", "特殊场景", "其他模型"];
  const sortedCategories = Object.keys(groupedAIs).sort((a, b) => {
    const indexA = categoryOrder.indexOf(a);
    const indexB = categoryOrder.indexOf(b);
    return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
  });

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
      className="fixed bottom-0 sm:bottom-24 left-0 sm:left-1/2 sm:-translate-x-1/2 right-0 sm:right-auto mb-0 sm:mb-8 sm:w-[500px] shadow-2xl z-[1000] h-[85vh] sm:h-[600px] max-h-[85vh] flex flex-col bg-white/95 backdrop-blur-md border-t sm:border border-gray-200 rounded-t-3xl sm:rounded-2xl overflow-hidden"
    >
      {/* 移动端拉手 */}
      <div className="sm:hidden flex justify-center pt-3 pb-1">
        <div className="w-12 h-1.5 bg-gray-200 rounded-full"></div>
      </div>

      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50/50">
        <div>
          <h3 className="text-sm font-bold text-gray-900">选择 AI 模型</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">最多可选 4 个模型并行对话</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full hover:bg-gray-200 transition-colors"
          onClick={onClose}
        >
          <X className="h-4 w-4 text-gray-500" />
        </Button>
      </div>

      {/* 搜索框 */}
      <div className="p-3 bg-white">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
          <Input
            type="text"
            placeholder="搜索模型名称或功能..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9 h-10 bg-gray-100 border-transparent focus:bg-white focus:border-blue-500 rounded-xl transition-all text-sm"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full hover:bg-gray-200"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-3.5 w-3.5 text-gray-400" />
            </Button>
          )}
        </div>
      </div>

      {/* AI列表 */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-white">
        <div className="p-2 space-y-4 min-h-[300px]">
          {sortedCategories.length === 0 ? (
            <div className="text-center py-12">
              <div className="bg-gray-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <Search className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">没有找到匹配的模型</p>
            </div>
          ) : (
            sortedCategories.map((category) => {
              const ais = groupedAIs[category];
              return (
                <div key={category} className="space-y-1">
                  {/* 分类标题 */}
                  <div className="px-3 py-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                    {category}
                    <div className="h-[1px] flex-1 bg-gray-100"></div>
                  </div>

                  {/* AI列表 */}
                  <div className="grid grid-cols-1 gap-1">
                    {ais.map((ai) => {
                      const isSelected = selectedAIs.some((s) => s.id === ai.id);
                      const isDisabled = !isSelected && selectedAIs.length >= 4;
                      return (
                        <div
                          key={ai.id}
                          className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                            isDisabled
                              ? "cursor-not-allowed opacity-40"
                              : "cursor-pointer hover:bg-blue-50/50 active:scale-[0.98]"
                          } ${isSelected ? "bg-blue-50 ring-1 ring-blue-200" : ""}`}
                          onClick={() => !isDisabled && toggleAI(ai)}
                        >
                          <div className={`flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                            isSelected ? "bg-blue-500 border-blue-500" : "bg-white border-gray-300 group-hover:border-blue-400"
                          }`}>
                            {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {ai.icon && <span className="text-base leading-none">{ai.icon}</span>}
                              <span className={`text-sm font-semibold truncate ${isSelected ? "text-blue-700" : "text-gray-700"}`}>
                                {ai.name}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                              {ai.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 底部统计 */}
      <div className="p-4 border-t bg-gray-50/80 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <div className="text-xs font-medium text-gray-600">
              已选择 <span className="text-blue-600 font-bold">{selectedAIs.length}</span> / 4
            </div>
            {selectedAIs.length > 0 && (
              <button 
                onClick={() => onSelectionChange([])}
                className="text-[10px] text-gray-400 hover:text-red-500 transition-colors text-left"
              >
                清空选择
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedAIs.length >= 4 && (
              <div className="hidden xs:block text-[10px] px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">
                已达上限
              </div>
            )}
            <Button 
              size="sm" 
              className="h-9 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-bold shadow-lg shadow-blue-200 transition-all active:scale-95"
              onClick={onClose}
            >
              确定
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
