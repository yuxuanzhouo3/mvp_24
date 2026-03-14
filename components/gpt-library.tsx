"use client";

import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Plus,
  Code,
  BookOpen,
  TrendingUp,
  Zap,
  Sparkles,
  MessageSquare,
  Palette,
  Star,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { interpolate, useTranslations } from "@/lib/i18n";
import { useUser } from "@/components/user-context";
import { fetchClientAIConfig, type ClientAIAgent } from "@/lib/ai/client-config";
import { isChinaRegion } from "@/lib/config/region";
import { getStoredModelFavorites, toggleStoredModelFavorite, MODEL_FAVORITES_EVENT } from "@/lib/ai/model-favorites";

type AIAgent = ClientAIAgent;

interface GPTLibraryProps {
  selectedGPTs: any[];
  setSelectedGPTs: (gpts: any[]) => void;
  collaborationMode?: "normal" | "parallel" | "sequential" | "deep" | "graph";
  setCollaborationMode?: (
    mode: "normal" | "parallel" | "sequential" | "deep" | "graph"
  ) => void;
}
const CHINA_REGION = isChinaRegion();

function getDisplayPricingLevel(
  pricingLevel: AIAgent["pricingLevel"],
  chinaRegion: boolean,
) {
  if (chinaRegion && pricingLevel === "free") return "low";
  return pricingLevel;
}

export function GPTLibrary({
  selectedGPTs,
  setSelectedGPTs,
  collaborationMode,
  setCollaborationMode,
}: GPTLibraryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [pricingFilter, setPricingFilter] = useState<"all" | "free" | "low" | "medium" | "high">("all");
  const { language } = useLanguage();
  const { user } = useUser();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const t = useTranslations(language);
  const [enabledAgents, setEnabledAgents] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const syncFavorites = () => setFavoriteIds(getStoredModelFavorites(user?.id));
    syncFavorites();
    window.addEventListener(MODEL_FAVORITES_EVENT, syncFavorites as EventListener);
    return () => window.removeEventListener(MODEL_FAVORITES_EVENT, syncFavorites as EventListener);
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchClientAIConfig();
        if (mounted) {
          setEnabledAgents(data.agents || []);
        }
      } catch {
        if (mounted) setEnabledAgents([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  function getIconIdForAgent(agent: AIAgent): string {
    if (agent.capabilities?.includes("coding")) return "code";
    if (agent.capabilities?.includes("creative")) return "palette";
    if (agent.capabilities?.includes("research")) return "book";
    if (agent.capabilities?.includes("analysis")) return "trending";
    if (agent.capabilities?.includes("translation")) return "message";
    return "sparkles";
  }

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

  function getCategoryForAgent(agent: AIAgent): string {
    if (agent.capabilities?.includes("coding")) return "coding";
    if (agent.capabilities?.includes("creative")) return "creative";
    if (agent.capabilities?.includes("research")) return "research";
    if (agent.capabilities?.includes("analysis")) return "analysis";
    return "analysis";
  }

  function getPricingBadgeLabel(agent: AIAgent): string {
    const pricingLevel = getDisplayPricingLevel(agent.pricingLevel, CHINA_REGION);
    if (pricingLevel === "low") return language === "zh" ? "低价" : "Low";
    if (pricingLevel === "medium") return language === "zh" ? "中价" : "Medium";
    if (pricingLevel === "high") return language === "zh" ? "高价" : "High";
    return language === "zh" ? "最低价" : "Lowest Price";
  }

  function getPricingBadgeVariant(agent: AIAgent): "default" | "secondary" | "outline" {
    const pricingLevel = getDisplayPricingLevel(agent.pricingLevel, CHINA_REGION);
    if (pricingLevel === "high") return "default";
    if (pricingLevel === "medium") return "outline";
    if (pricingLevel === "low") return "secondary";
    return "secondary";
  }

  function getColorForProvider(provider: string): string {
    const colors: Record<string, string> = {
      openai: "bg-green-500",
      anthropic: "bg-orange-500",
      deepseek: "bg-gray-600",
      qwen: "bg-blue-500",
      ernie: "bg-purple-500",
      glm: "bg-indigo-500",
      google: "bg-cyan-500",
      openrouter: "bg-slate-600",
    };
    return colors[provider] || "bg-gray-500";
  }

  const gptLibrary = useMemo(
    () =>
      enabledAgents.map((agent: AIAgent) => ({
        ...agent,
        iconId: getIconIdForAgent(agent),
        category: getCategoryForAgent(agent),
        color: getColorForProvider(agent.provider),
        role: agent.name,
        systemPrompt: `You are ${agent.name}, ${agent.description}`,
        enabled: true,
        isPopular: agent.openrouterOrder === "most-popular" && typeof agent.openrouterRank === "number" && agent.openrouterRank > 0,
      })),
    [enabledAgents]
  );


  const filteredGPTs = gptLibrary.filter((gpt: any) => {
    const matchesSearch =
      gpt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      gpt.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      gpt.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
      gpt.provider.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      activeCategory === "all" ||
      (activeCategory === "popular" ? !!gpt.isPopular : gpt.category === activeCategory);
    const matchesPricing =
      pricingFilter === "all" ||
      getDisplayPricingLevel(gpt.pricingLevel, CHINA_REGION) === pricingFilter;
    return matchesSearch && matchesCategory && matchesPricing;
  });

  const visibleGPTs = useMemo(() => {
    const items = [...filteredGPTs];
    items.sort((a: any, b: any) => {
      const favA = favoriteIds.includes(a.id) || favoriteIds.includes(a.model) ? 1 : 0;
      const favB = favoriteIds.includes(b.id) || favoriteIds.includes(b.model) ? 1 : 0;
      if (favA !== favB) return favB - favA;
      const rankA = typeof a.openrouterRank === "number" ? a.openrouterRank : Number.MAX_SAFE_INTEGER;
      const rankB = typeof b.openrouterRank === "number" ? b.openrouterRank : Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      return String(a.name || a.model).localeCompare(String(b.name || b.model));
    });
    if (activeCategory === "popular") {
      items.sort((a: any, b: any) => {
        const rankA = typeof a.openrouterRank === "number" ? a.openrouterRank : Number.MAX_SAFE_INTEGER;
        const rankB = typeof b.openrouterRank === "number" ? b.openrouterRank : Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) return rankA - rankB;
        return String(a.name || a.model).localeCompare(String(b.name || b.model));
      });
    }
    return items;
  }, [activeCategory, favoriteIds, filteredGPTs]);

  const addGPT = (gpt: any) => {
    if (
      selectedGPTs.length < 4 &&
      !selectedGPTs.find((selected) => selected.id === gpt.id)
    ) {
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
    const newSelectedGPTs = selectedGPTs.filter((gpt) => gpt.id !== gptId).map((gpt) => {
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
    if (setCollaborationMode && collaborationMode === "sequential") {
      setCollaborationMode("parallel");
    }
  };


  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t.library.title}</h2>
          <p className="text-gray-600">{interpolate(t.library.subtitleWithCount, { count: enabledAgents.length })}</p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input placeholder={t.library.search} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant={pricingFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setPricingFilter("all")}>
              {language === "zh" ? "全部价格" : "All Prices"}
            </Button>
            {!CHINA_REGION && (
              <Button variant={pricingFilter === "free" ? "default" : "outline"} size="sm" onClick={() => setPricingFilter("free")}>
                {language === "zh" ? "最低价" : "Lowest Price"}
              </Button>
            )}
            <Button variant={pricingFilter === "low" ? "default" : "outline"} size="sm" onClick={() => setPricingFilter("low")}>
              {language === "zh" ? "低价" : "Low"}
            </Button>
            <Button variant={pricingFilter === "medium" ? "default" : "outline"} size="sm" onClick={() => setPricingFilter("medium")}>
              {language === "zh" ? "中价" : "Medium"}
            </Button>
            <Button variant={pricingFilter === "high" ? "default" : "outline"} size="sm" onClick={() => setPricingFilter("high")}>
              {language === "zh" ? "高价" : "High"}
            </Button>
          </div>
        </div>

        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto p-1 sm:grid sm:grid-cols-6 sm:gap-0 sm:overflow-visible">
            <TabsTrigger value="all" className="min-w-max shrink-0 text-xs sm:min-w-0 sm:shrink sm:text-sm">{t.library.categories.all}</TabsTrigger>
            <TabsTrigger value="popular" className="min-w-max shrink-0 text-xs sm:min-w-0 sm:shrink sm:text-sm">{language === "zh" ? "最热门" : "Most Popular"}</TabsTrigger>
            <TabsTrigger value="coding" className="min-w-max shrink-0 text-xs sm:min-w-0 sm:shrink sm:text-sm">{t.library.categories.coding}</TabsTrigger>
            <TabsTrigger value="creative" className="min-w-max shrink-0 text-xs sm:min-w-0 sm:shrink sm:text-sm">{t.library.categories.creative}</TabsTrigger>
            <TabsTrigger value="analysis" className="min-w-max shrink-0 text-xs sm:min-w-0 sm:shrink sm:text-sm">{t.library.categories.analysis}</TabsTrigger>
            <TabsTrigger value="research" className="min-w-max shrink-0 text-xs sm:min-w-0 sm:shrink sm:text-sm">{t.library.categories.research}</TabsTrigger>
          </TabsList>

          <TabsContent value={activeCategory} className="space-y-4 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {visibleGPTs.map((gpt: any) => {
                  const isSelected = selectedGPTs.find((selected) => selected.id === gpt.id);
                  const Icon = getIconComponent(gpt.iconId);
                  return (
                    <Card key={gpt.id} className={`p-6 transition-all hover:shadow-lg flex h-full flex-col ${isSelected ? "ring-2 ring-blue-500" : ""}`}>
                      <div className="flex items-start gap-3 mb-4">
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className={`w-12 h-12 rounded-lg ${gpt.color} flex items-center justify-center shrink-0`}>
                            <Icon className="w-6 h-6 text-white" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-lg">{gpt.name}</h3>
                            <p className="text-sm text-gray-600">{gpt.role}</p>
                            {typeof gpt.openrouterRank === "number" && gpt.openrouterRank > 0 && <p className="text-xs text-blue-600">#{gpt.openrouterRank}</p>}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="ml-auto shrink-0 rounded p-1 text-gray-400 hover:text-amber-500"
                          onClick={() => setFavoriteIds(toggleStoredModelFavorite(gpt.id || gpt.model, user?.id))}
                          title={favoriteIds.includes(gpt.id) || favoriteIds.includes(gpt.model) ? (language === "zh" ? "取消收藏" : "Unfavorite") : (language === "zh" ? "收藏模型" : "Favorite model")}
                        >
                          <Star className={`h-4 w-4 ${(favoriteIds.includes(gpt.id) || favoriteIds.includes(gpt.model)) ? "fill-amber-400 text-amber-500" : ""}`} />
                        </button>
                      </div>

                      <p className="text-gray-700 text-sm mb-4">{gpt.description}</p>

                      <div className="mb-3">
                        <div className="text-xs font-medium text-gray-500 mb-1">{t.library.model}</div>
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className="text-xs">{gpt.provider}</Badge>
                          <Badge variant={getPricingBadgeVariant(gpt)} className="text-xs">{getPricingBadgeLabel(gpt)}</Badge>
                          <span className="text-xs text-gray-600">{gpt.model}</span>
                        </div>
                      </div>

                      <div className="mb-4">
                        <div className="text-xs font-medium text-gray-500 mb-2">{t.library.capabilitiesTitle}</div>
                        <div className="flex flex-wrap gap-1">
                          {gpt.capabilities?.includes("coding") && <Badge variant="outline" className="text-xs">{t.library.capabilities.coding}</Badge>}
                          {gpt.capabilities?.includes("analysis") && <Badge variant="outline" className="text-xs">{t.library.capabilities.analysis}</Badge>}
                          {gpt.capabilities?.includes("creative") && <Badge variant="outline" className="text-xs">{t.library.capabilities.creative}</Badge>}
                          {gpt.capabilities?.includes("research") && <Badge variant="outline" className="text-xs">{t.library.capabilities.research}</Badge>}
                          {gpt.capabilities?.includes("translation") && <Badge variant="outline" className="text-xs">{t.library.capabilities.translation}</Badge>}
                        </div>
                      </div>

                      <Button className="mt-auto w-full" variant={isSelected ? "secondary" : "default"} onClick={() => isSelected ? removeGPT(gpt.id) : addGPT(gpt)} disabled={!isSelected && selectedGPTs.length >= 4}>
                        {isSelected ? <span>{t.library.remove}</span> : <><Plus className="w-4 h-4 mr-2" />{t.library.add}</>}
                      </Button>
                    </Card>
                  );
                })}
              </div>

              {visibleGPTs.length === 0 && (
                <div className="text-center py-12">
                  <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">{t.library.noResults}</p>
                </div>
              )}
          </TabsContent>
        </Tabs>

        {selectedGPTs.length > 0 && (
          <Card className="p-4 bg-blue-50 border-blue-200 sticky bottom-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Zap className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-blue-900">{interpolate(t.library.selectedCount, { count: selectedGPTs.length })}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelectedGPTs([])}>{t.library.clearAll}</Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
