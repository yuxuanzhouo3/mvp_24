"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ArrowRight, ArrowDown, Zap, X, Plus } from "lucide-react"

interface SidebarProps {
  selectedGPTs: any[]
  setSelectedGPTs: (gpts: any[]) => void
  collaborationMode: string
  setCollaborationMode: (mode: string) => void
  language: string
}

export function Sidebar({
  selectedGPTs,
  setSelectedGPTs,
  collaborationMode,
  setCollaborationMode,
  language,
}: SidebarProps) {
  const t = {
    zh: {
      selectedAI: "已选择的AI",
      collaborationMode: "协作模式",
      sequential: "顺序处理",
      parallel: "并行处理",
      addAI: "添加AI",
      tokenUsage: "Token使用量",
      maxAI: "最多4个AI",
    },
    en: {
      selectedAI: "Selected AIs",
      collaborationMode: "Collaboration Mode",
      sequential: "Sequential",
      parallel: "Parallel",
      addAI: "Add AI",
      tokenUsage: "Token Usage",
      maxAI: "Max 4 AIs",
    },
  }

  const removeGPT = (index: number) => {
    setSelectedGPTs(selectedGPTs.filter((_, i) => i !== index))
  }

  const recommendedCombos = [
    {
      name: language === "zh" ? "智能研究助手" : "Smart Research Assistant",
      gpts: ["deepseek", "morngpt-research-org"],
      description:
        language === "zh"
          ? "DeepSeek模型 + 研究组织，提供全面的研究支持"
          : "DeepSeek model + Research organization for comprehensive research support",
    },
    {
      name: language === "zh" ? "商业分析专家" : "Business Analysis Expert",
      gpts: ["openai-gpt", "morngpt-business-org"],
      description:
        language === "zh"
          ? "GPT-4 + 商业组织，深度商业洞察分析"
          : "GPT-4 + Business organization for deep business insights",
    },
    {
      name: language === "zh" ? "全能创作团队" : "All-in-One Creative Team",
      gpts: ["morngpt-mix", "morngpt-creative-org"],
      description:
        language === "zh"
          ? "混合模型 + 创意组织，全方位创作支持"
          : "Mixed model + Creative organization for comprehensive creative support",
    },
  ]

  return (
    <div className="w-80 bg-white border-r border-gray-200 p-4 overflow-y-auto">
      <div className="space-y-6">
        {/* Selected GPTs */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">{t[language].selectedAI}</h3>
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
                  <span>{t[language].tokenUsage}</span>
                  <span className="font-mono">{gpt.tokens || 0}</span>
                </div>
              </Card>
            ))}

            {selectedGPTs.length < 4 && (
              <Button
                variant="dashed"
                className="w-full h-16 border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t[language].addAI}
              </Button>
            )}

            {selectedGPTs.length >= 4 && (
              <div className="text-xs text-amber-600 text-center py-2">{t[language].maxAI}</div>
            )}
          </div>
        </div>

        <Separator />

        {/* Collaboration Mode */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">{t[language].collaborationMode}</h3>

          <div className="space-y-2">
            <Button
              variant={collaborationMode === "sequential" ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => setCollaborationMode("sequential")}
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              {t[language].sequential}
            </Button>

            <Button
              variant={collaborationMode === "parallel" ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => setCollaborationMode("parallel")}
            >
              <ArrowDown className="w-4 h-4 mr-2" />
              {t[language].parallel}
            </Button>
          </div>

          <div className="mt-3 p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center space-x-2 text-blue-700 text-sm">
              <Zap className="w-4 h-4" />
              <span>
                {collaborationMode === "sequential"
                  ? language === "zh"
                    ? "AI将按顺序处理任务"
                    : "AIs will process tasks sequentially"
                  : language === "zh"
                    ? "AI将同时处理任务"
                    : "AIs will process tasks in parallel"}
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Quick Actions */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">{language === "zh" ? "推荐组合" : "Recommended Combos"}</h3>

          <div className="space-y-2">
            <Card className="p-3 cursor-pointer hover:bg-gray-50 transition-colors">
              <div className="font-medium text-sm">{language === "zh" ? "学术论文" : "Academic Paper"}</div>
              <div className="text-xs text-gray-500 mt-1">
                {language === "zh" ? "研究员 + 编辑" : "Researcher + Editor"}
              </div>
            </Card>

            <Card className="p-3 cursor-pointer hover:bg-gray-50 transition-colors">
              <div className="font-medium text-sm">{language === "zh" ? "商业分析" : "Business Analysis"}</div>
              <div className="text-xs text-gray-500 mt-1">
                {language === "zh" ? "分析师 + 策略师" : "Analyst + Strategist"}
              </div>
            </Card>

            <Card className="p-3 cursor-pointer hover:bg-gray-50 transition-colors">
              <div className="font-medium text-sm">{language === "zh" ? "创意写作" : "Creative Writing"}</div>
              <div className="text-xs text-gray-500 mt-1">{language === "zh" ? "作家 + 编辑" : "Writer + Editor"}</div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
