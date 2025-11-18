"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, ArrowDown, Zap, X, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import { AVAILABLE_TEMPLATES, findTemplateById } from "@/lib/templates";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useWorkspaceMessages } from "@/components/workspace-messages-context";

// 简化版本：不再依赖旧的配置文件

interface SidebarProps {
  selectedGPTs: any[];
  setSelectedGPTs: (gpts: any[]) => void;
  collaborationMode: string;
  setCollaborationMode: (mode: string) => void;
}

export function Sidebar({
  selectedGPTs,
  setSelectedGPTs,
  collaborationMode,
  setCollaborationMode,
}: SidebarProps) {
  const { language } = useLanguage();
  const t = useTranslations(language);
  const { messages, clearMessages } = useWorkspaceMessages();

  // 处理模板选择
  const handleTemplateSelect = (templateId: string) => {
    const template = findTemplateById(templateId);
    if (!template) return;

    // 设置为顺序模式
    setCollaborationMode("sequential");

    // 模板功能暂时简化：直接清空选择
    // TODO: 需要从新 API 加载 AI 并匹配模板
    alert("模板功能正在升级中，请手动选择 AI");
    return;
  };

  // 检查是否是通过模板选择的AI（所有AI都有task属性）
  const isTemplateSelected =
    selectedGPTs.length > 0 && selectedGPTs.every((gpt) => (gpt as any).task);

  // 如果不是模板选择，强制设置为并行模式
  useEffect(() => {
    if (!isTemplateSelected && collaborationMode === "sequential") {
      setCollaborationMode("parallel");
    }
  }, [isTemplateSelected, setCollaborationMode]); // 移除collaborationMode依赖

  const removeGPT = (index: number) => {
    const newSelectedGPTs = selectedGPTs
      .filter((_, i) => i !== index)
      .map((gpt) => {
        // 清除task属性，表示不再是模板选择
        const cleanGPT = { ...gpt };
        delete (cleanGPT as any).task;
        delete (cleanGPT as any).templateStep;
        return cleanGPT;
      });
    setSelectedGPTs(newSelectedGPTs);
    // 删除AI后，切换到并行模式（因为用户进行了自定义修改）
    if (collaborationMode === "sequential") {
      setCollaborationMode("parallel");
    }
  };

  const recommendedCombos = [
    {
      name: t.sidebar.combos.smartResearch.name,
      gpts: ["deepseek", "morngpt-research-org"],
      description: t.sidebar.combos.smartResearch.description,
    },
    {
      name: t.sidebar.combos.businessAnalysis.name,
      gpts: ["openai-gpt", "morngpt-business-org"],
      description: t.sidebar.combos.businessAnalysis.description,
    },
    {
      name: t.sidebar.combos.creativeTeam.name,
      gpts: ["morngpt-mix", "morngpt-creative-org"],
      description: t.sidebar.combos.creativeTeam.description,
    },
  ];

  return (
    <div className="hidden lg:flex w-80 bg-white border-r border-gray-200 p-4 overflow-y-auto flex-col relative pb-20">
      <div className="space-y-6 flex-1">
        {/* Selected GPTs */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">
              {t.sidebar.selectedAI}
            </h3>
            <Badge variant="secondary">{selectedGPTs.length}/4</Badge>
          </div>

          <div className="space-y-2">
            {selectedGPTs.map((gpt, index) => (
              <Card key={index} className="p-3 relative group">
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeGPT(index)}
                >
                  <X className="w-3 h-3" />
                </Button>

                <div className="flex items-center space-x-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${gpt.color}`}
                  >
                    {gpt.type === "organization" ? "团" : gpt.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{gpt.name}</div>
                    <div className="text-xs text-gray-500">{gpt.role}</div>
                    {gpt.type === "organization" && (
                      <div className="text-xs text-blue-600 mt-1">
                        {language === "zh"
                          ? `${gpt.members?.length || 0}个成员`
                          : `${gpt.members?.length || 0} members`}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                  <span>{t.sidebar.tokenUsage}</span>
                  <span className="font-mono">{gpt.tokens || 0}</span>
                </div>
              </Card>
            ))}

            {selectedGPTs.length < 4 && (
              <Button
                variant="outline"
                className="w-full h-16 border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t.sidebar.addAI}
              </Button>
            )}

            {selectedGPTs.length >= 4 && (
              <div className="text-xs text-amber-600 text-center py-2">
                {t.sidebar.maxAI}
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Collaboration Mode */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">
            {t.sidebar.collaborationMode}
          </h3>

          <div className="space-y-2">
            <Button
              variant={
                collaborationMode === "sequential" ? "default" : "outline"
              }
              className="w-full justify-start"
              onClick={() => {
                if (isTemplateSelected) {
                  setCollaborationMode("sequential");
                }
              }}
              disabled={!isTemplateSelected}
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              {t.sidebar.sequential}
              {!isTemplateSelected && (
                <span className="ml-2 text-xs opacity-60">
                  ({t.sidebar.templatesOnly})
                </span>
              )}
            </Button>

            <Button
              variant={collaborationMode === "parallel" ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => setCollaborationMode("parallel")}
            >
              <ArrowDown className="w-4 h-4 mr-2" />
              {t.sidebar.parallel}
            </Button>
          </div>

          <div className="mt-3 p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center space-x-2 text-blue-700 text-sm">
              <Zap className="w-4 h-4" />
              <span>
                {isTemplateSelected && collaborationMode === "sequential"
                  ? t.sidebar.sequentialDesc
                  : t.sidebar.parallelDesc}
              </span>
            </div>
            {!isTemplateSelected && (
              <div className="text-xs text-blue-600 mt-2">
                {t.sidebar.selectTemplate}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 新建对话按钮 */}
      <div className="absolute bottom-4 left-4 right-4">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            clearMessages();
          }}
          disabled={messages.length === 0}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          {t.workspace.newConversation}
        </Button>
      </div>
    </div>
  );
}
