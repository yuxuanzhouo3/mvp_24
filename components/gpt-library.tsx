"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Plus,
  Star,
  Brain,
  Briefcase,
  Palette,
  Code,
  BookOpen,
  TrendingUp,
  Zap,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { interpolate, useTranslations } from "@/lib/i18n";
import { AVAILABLE_TEMPLATES, findTemplateById } from "@/lib/templates";

// 使用新的 AI 配置 API 接口
interface AIAgent {
  id: string;
  name: string;
  provider: string;
  model: string;
  description: string;
  capabilities: string[];
  maxTokens?: number;
  temperature?: number;
  icon?: string;
}

interface GPTLibraryProps {
  selectedGPTs: any[];
  setSelectedGPTs: (gpts: any[]) => void;
  collaborationMode?: "parallel" | "sequential";
  setCollaborationMode?: (mode: "parallel" | "sequential") => void;
}

export function GPTLibrary({
  selectedGPTs,
  setSelectedGPTs,
  collaborationMode,
  setCollaborationMode,
}: GPTLibraryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const { language } = useLanguage();
  const t = useTranslations(language);

  // 从新的 AI 配置 API 获取智能体
  const [enabledAgents, setEnabledAgents] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<string>("");

  // 从 API 加载 AI 配置（自动根据用户区域）
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/config/ai");
        if (!res.ok) {
          console.error("Failed to load AI config:", res.statusText);
          if (mounted) setEnabledAgents([]);
          return;
        }
        const data = await res.json();
        if (mounted) {
          setRegion(data.region || "");
          setEnabledAgents(data.agents || []);
          console.log(
            `✅ 加载 ${data.region} 区域配置，共 ${
              data.agents?.length || 0
            } 个 AI`
          );
        }
      } catch (err) {
        console.error("Failed to load AI config:", err);
        if (mounted) setEnabledAgents([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 根据AI能力返回图标ID
  function getIconIdForAgent(agent: AIAgent): string {
    if (agent.capabilities?.includes("coding")) return "code";
    if (agent.capabilities?.includes("creative")) return "palette";
    if (agent.capabilities?.includes("analysis")) return "trending";
    if (agent.capabilities?.includes("research")) return "book";
    if (agent.capabilities?.includes("translation")) return "message";
    return "sparkles";
  }

  // 获取React组件对应的图标
  function getIconComponent(iconId: string) {
    const iconMap: Record<string, React.ComponentType<any>> = {
      code: Code,
      palette: Palette,
      trending: TrendingUp,
      book: BookOpen,
      message: MessageSquare,
      sparkles: Sparkles,
    };
    return iconMap[iconId] || Sparkles;
  }

  // 转换成UI需要的格式
  const gptLibrary = enabledAgents.map((agent: AIAgent) => ({
    ...agent,
    iconId: getIconIdForAgent(agent),
    category: getCategoryForAgent(agent),
    color: getColorForProvider(agent.provider),
    role: agent.name,
    systemPrompt: `You are ${agent.name}, ${agent.description}`,
    enabled: true,
  }));

  // 根据AI能力返回分类
  function getCategoryForAgent(agent: AIAgent): string {
    if (agent.capabilities?.includes("coding")) return "coding";
    if (agent.capabilities?.includes("creative")) return "creative";
    if (agent.capabilities?.includes("analysis")) return "analysis";
    if (agent.capabilities?.includes("research")) return "research";
    return "general";
  }

  // 根据 provider 返回颜色
  function getColorForProvider(provider: string): string {
    const colors: Record<string, string> = {
      openai: "bg-green-500",
      anthropic: "bg-orange-500",
      deepseek: "bg-gray-600",
      qwen: "bg-blue-500",
      ernie: "bg-purple-500",
      glm: "bg-indigo-500",
    };
    return colors[provider] || "bg-gray-500";
  }

  const recommendedCombos = AVAILABLE_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    agentIds: [] as string[], // 模板功能暂时禁用
  }));

  const filteredGPTs = gptLibrary.filter((gpt: any) => {
    const matchesSearch =
      gpt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      gpt.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      activeCategory === "all" || gpt.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const addGPT = (gpt: any) => {
    if (
      selectedGPTs.length < 4 &&
      !selectedGPTs.find((selected) => selected.id === gpt.id)
    ) {
      // 手动添加AI时，移除task属性，确保使用并行模式
      const cleanGPT = { ...gpt };
      delete cleanGPT.task;
      delete cleanGPT.templateStep;
      delete cleanGPT.iconId;
      delete cleanGPT.color;
      delete cleanGPT.category;
      delete cleanGPT.systemPrompt;
      setSelectedGPTs([...selectedGPTs, cleanGPT]);
    }
  };

  const removeGPT = (gptId: string) => {
    const newSelectedGPTs = selectedGPTs
      .filter((gpt) => gpt.id !== gptId)
      .map((gpt) => {
        // 清除task属性和UI属性
        const cleanGPT = { ...gpt };
        delete (cleanGPT as any).task;
        delete (cleanGPT as any).templateStep;
        delete (cleanGPT as any).iconId;
        delete (cleanGPT as any).color;
        delete (cleanGPT as any).category;
        delete (cleanGPT as any).systemPrompt;
        return cleanGPT;
      });
    setSelectedGPTs(newSelectedGPTs);
    // 删除AI后，切换到并行模式（因为用户进行了自定义修改）
    if (setCollaborationMode && collaborationMode === "sequential") {
      setCollaborationMode("parallel");
    }
  };

  const addCombo = (combo: any) => {
    // 如果是模板选择，设置协作模式为sequential
    if (setCollaborationMode) {
      setCollaborationMode("sequential");
    }

    const comboGPTs = combo.agentIds
      .map((id: string) => gptLibrary.find((gpt: any) => gpt.id === id))
      .filter(Boolean);

    // 为模板选择的AI添加task属性
    const template = AVAILABLE_TEMPLATES.find((t) => t.id === combo.id);
    const newGPTs = comboGPTs
      .map((gpt: any, index: number) => {
        const step = template?.aiSequence[index];
        const cleanGPT: any = {
          id: gpt.id,
          name: gpt.name,
          provider: gpt.provider,
          model: gpt.model,
          description: gpt.description,
          capabilities: gpt.capabilities,
          maxTokens: gpt.maxTokens,
          temperature: gpt.temperature,
          task: step?.task,
          role: step?.role,
          templateStep: step,
        };
        return cleanGPT;
      })
      .filter(
        (gpt: any) => !selectedGPTs.find((selected) => selected.id === gpt.id)
      );

    if (selectedGPTs.length + newGPTs.length <= 4) {
      setSelectedGPTs([...selectedGPTs, ...newGPTs]);
    }
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {t.library.title}
          </h2>
          <p className="text-gray-600">
            {interpolate(t.library.subtitleWithCount, {
              count: enabledAgents.length,
            })}
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder={t.library.search}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="all">{t.library.categories.all}</TabsTrigger>
            <TabsTrigger value="coding">
              {t.library.categories.coding}
            </TabsTrigger>
            <TabsTrigger value="creative">
              {t.library.categories.creative}
            </TabsTrigger>
            <TabsTrigger value="analysis">
              {t.library.categories.analysis}
            </TabsTrigger>
            <TabsTrigger value="research">
              {t.library.categories.research}
            </TabsTrigger>
            <TabsTrigger value="recommended">
              {t.library.categories.recommended}
            </TabsTrigger>
          </TabsList>

          {/* Recommended Combos Tab */}
          {activeCategory === "recommended" && (
            <TabsContent value="recommended" className="space-y-4 mt-6">
              <div className="grid gap-4">
                {recommendedCombos.map((combo, index) => (
                  <Card
                    key={index}
                    className="p-6 hover:shadow-lg transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-2">
                          {combo.name}
                        </h3>
                        <p className="text-gray-600 text-sm mb-3">
                          {combo.description}
                        </p>
                        <div className="flex items-center flex-wrap gap-2">
                          {combo.agentIds.map((agentId) => {
                            const agent = gptLibrary.find(
                              (g) => g.id === agentId
                            );
                            return agent ? (
                              <Badge
                                key={agentId}
                                variant="outline"
                                className="flex items-center space-x-1 bg-gray-50 text-gray-700 border-gray-200"
                              >
                                <div
                                  className={`w-3 h-3 rounded-full ${agent.color}`}
                                ></div>
                                <span>{agent.name}</span>
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      </div>
                      <Button onClick={() => addCombo(combo)} className="ml-4">
                        <Plus className="w-4 h-4 mr-2" />
                        {t.library.add}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>
          )}

          {/* AI Agents Grid */}
          {activeCategory !== "recommended" && (
            <TabsContent value={activeCategory} className="space-y-4 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredGPTs.map((gpt: any) => {
                  const isSelected = selectedGPTs.find(
                    (selected) => selected.id === gpt.id
                  );
                  const Icon = getIconComponent(gpt.iconId);

                  return (
                    <Card
                      key={gpt.id}
                      className={`p-6 transition-all hover:shadow-lg ${
                        isSelected ? "ring-2 ring-blue-500" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div
                            className={`w-12 h-12 rounded-lg ${gpt.color} flex items-center justify-center`}
                          >
                            <Icon className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg">
                              {gpt.name}
                            </h3>
                            <p className="text-sm text-gray-600">{gpt.role}</p>
                          </div>
                        </div>
                      </div>

                      <p className="text-gray-700 text-sm mb-4">
                        {gpt.description}
                      </p>

                      {/* Model Info */}
                      <div className="mb-3">
                        <div className="text-xs font-medium text-gray-500 mb-1">
                          {t.library.model}
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className="text-xs">
                            {gpt.provider}
                          </Badge>
                          <span className="text-xs text-gray-600">
                            {gpt.model}
                          </span>
                        </div>
                      </div>

                      {/* Capabilities */}
                      <div className="mb-4">
                        <div className="text-xs font-medium text-gray-500 mb-2">
                          {t.library.capabilitiesTitle}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {gpt.capabilities?.includes("coding") && (
                            <Badge variant="outline" className="text-xs">
                              {t.library.capabilities.coding}
                            </Badge>
                          )}
                          {gpt.capabilities?.includes("analysis") && (
                            <Badge variant="outline" className="text-xs">
                              {t.library.capabilities.analysis}
                            </Badge>
                          )}
                          {gpt.capabilities?.includes("creative") && (
                            <Badge variant="outline" className="text-xs">
                              {t.library.capabilities.creative}
                            </Badge>
                          )}
                          {gpt.capabilities?.includes("research") && (
                            <Badge variant="outline" className="text-xs">
                              {t.library.capabilities.research}
                            </Badge>
                          )}
                          {gpt.capabilities?.includes("translation") && (
                            <Badge variant="outline" className="text-xs">
                              {t.library.capabilities.translation}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <Button
                        className="w-full"
                        variant={isSelected ? "secondary" : "default"}
                        onClick={() =>
                          isSelected ? removeGPT(gpt.id) : addGPT(gpt)
                        }
                        disabled={!isSelected && selectedGPTs.length >= 4}
                      >
                        {isSelected ? (
                          <span>{t.library.remove}</span>
                        ) : (
                          <>
                            <Plus className="w-4 h-4 mr-2" />
                            {t.library.add}
                          </>
                        )}
                      </Button>
                    </Card>
                  );
                })}
              </div>

              {filteredGPTs.length === 0 && (
                <div className="text-center py-12">
                  <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">{t.library.noResults}</p>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>

        {/* Selected Count */}
        {selectedGPTs.length > 0 && (
          <Card className="p-4 bg-blue-50 border-blue-200 sticky bottom-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Zap className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-blue-900">
                  {interpolate(t.library.selectedCount, {
                    count: selectedGPTs.length,
                  })}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedGPTs([])}
              >
                {t.library.clearAll}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
