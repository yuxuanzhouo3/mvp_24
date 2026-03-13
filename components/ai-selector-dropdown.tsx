"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject, TouchEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Search, Sparkles, Star, X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useUser } from "@/components/user-context";
import {
  getStoredModelFavorites,
  MODEL_FAVORITES_EVENT,
  toggleStoredModelFavorite,
} from "@/lib/ai/model-favorites";

interface AIAgent {
  id: string;
  name: string;
  provider: string;
  model: string;
  description: string;
  capabilities: string[];
  icon?: string;
  pricingLevel?: "free" | "low" | "medium" | "high";
  unitPrice?: number;
  openrouterRank?: number;
}

interface AISelectorDropdownProps {
  availableAIs: AIAgent[];
  selectedAIs: AIAgent[];
  onSelectionChange: (ais: AIAgent[]) => void;
  onClose: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
}

const SWIPE_CLOSE_DISTANCE = 90;
const SWIPE_CLOSE_VELOCITY = 0.7;

export function AISelectorDropdown({
  availableAIs,
  selectedAIs,
  onSelectionChange,
  onClose,
  triggerRef,
}: AISelectorDropdownProps) {
  const { language } = useLanguage();
  const { user } = useUser();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchLastYRef = useRef(0);
  const touchStartTimeRef = useRef(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [pricingFilter, setPricingFilter] = useState<
    "all" | "free" | "low" | "medium" | "high"
  >("all");
  const [sheetDragOffsetY, setSheetDragOffsetY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);

  const smartGradientTextClass =
    "bg-[linear-gradient(90deg,#2f8cff_0%,#7a5cff_35%,#ff2d95_70%,#ff8a1f_100%)] bg-clip-text text-transparent";
  const smartGradientSoftClass =
    "bg-[linear-gradient(90deg,#2f8cff14_0%,#7a5cff14_35%,#ff2d9514_70%,#ff8a1f14_100%)]";
  const smartGradientStrongClass =
    "bg-[linear-gradient(90deg,#2f8cff2e_0%,#7a5cff2e_35%,#ff2d952b_70%,#ff8a1f2b_100%)]";
  const smartGradientLockedClass =
    "bg-[linear-gradient(90deg,#2f8cff1f_0%,#7a5cff1f_35%,#ff2d951d_70%,#ff8a1f1d_100%)]";

  const isSmartModel = (ai: AIAgent) =>
    ai.model === "smart-auto" || ai.id.includes("smart-model");

  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const getPricingBadgeLabel = (ai: AIAgent) => {
    if (ai.pricingLevel === "low") return language === "zh" ? "低价" : "Low";
    if (ai.pricingLevel === "medium") return language === "zh" ? "中价" : "Medium";
    if (ai.pricingLevel === "high") return language === "zh" ? "高价" : "High";
    return language === "zh" ? "最低价" : "Lowest Price";
  };

  useEffect(() => {
    const syncFavorites = () => setFavoriteIds(getStoredModelFavorites(user?.id));
    syncFavorites();
    window.addEventListener(
      MODEL_FAVORITES_EVENT,
      syncFavorites as EventListener,
    );
    return () => {
      window.removeEventListener(
        MODEL_FAVORITES_EVENT,
        syncFavorites as EventListener,
      );
    };
  }, [user?.id]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        triggerRef?.current &&
        triggerRef.current.contains(event.target as Node)
      ) {
        return;
      }
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, triggerRef]);

  const sortedAIs = useMemo(() => {
    return [...availableAIs].sort((a, b) => {
      const favoriteA = favoriteIdSet.has(a.id) || favoriteIdSet.has(a.model) ? 1 : 0;
      const favoriteB = favoriteIdSet.has(b.id) || favoriteIdSet.has(b.model) ? 1 : 0;
      if (favoriteA !== favoriteB) return favoriteB - favoriteA;

      const rankA =
        typeof a.openrouterRank === "number"
          ? a.openrouterRank
          : Number.MAX_SAFE_INTEGER;
      const rankB =
        typeof b.openrouterRank === "number"
          ? b.openrouterRank
          : Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;

      return String(a.name || a.model).localeCompare(String(b.name || b.model));
    });
  }, [availableAIs, favoriteIdSet]);

  const filteredAIs = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return sortedAIs.filter((ai) => {
      const matchesSearch =
        keyword.length === 0 ||
        ai.name.toLowerCase().includes(keyword) ||
        ai.model.toLowerCase().includes(keyword) ||
        ai.description.toLowerCase().includes(keyword) ||
        ai.provider.toLowerCase().includes(keyword) ||
        ai.capabilities.some((capability) =>
          capability.toLowerCase().includes(keyword),
        );

      const matchesPricing =
        pricingFilter === "all" ||
        (!isSmartModel(ai) && ai.pricingLevel === pricingFilter);

      return matchesSearch && matchesPricing;
    });
  }, [pricingFilter, searchQuery, sortedAIs]);

  const sections = useMemo(() => {
    const favorites = filteredAIs.filter((ai) => favoriteIdSet.has(ai.id) || favoriteIdSet.has(ai.model));
    const rest = filteredAIs.filter((ai) => !favoriteIdSet.has(ai.id) && !favoriteIdSet.has(ai.model));

    return [
      {
        key: "favorites",
        title: language === "zh" ? "我的收藏" : "Favorites",
        items: favorites,
      },
      {
        key: "popular",
        title: language === "zh" ? "按热门排序" : "Sorted by Popularity",
        items: rest,
      },
    ].filter((section) => section.items.length > 0);
  }, [favoriteIdSet, filteredAIs, language]);

  const toggleFavorite = (ai: AIAgent) => {
    setFavoriteIds(toggleStoredModelFavorite(ai.id || ai.model, user?.id));
  };

  const toggleAI = (ai: AIAgent) => {
    const alreadySelected = selectedAIs.some((selected) => selected.id === ai.id);
    const smart = isSmartModel(ai);

    if (alreadySelected) {
      onSelectionChange(selectedAIs.filter((selected) => selected.id !== ai.id));
      return;
    }

    if (smart) {
      onSelectionChange([ai]);
      return;
    }

    const withoutSmart = selectedAIs.filter((selected) => !isSmartModel(selected));
    if (withoutSmart.length >= 4) {
      return;
    }

    onSelectionChange([...withoutSmart, ai]);
  };

  const handleSheetTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (typeof window !== "undefined" && window.innerWidth >= 640) {
      return;
    }
    const touch = event.touches[0];
    if (!touch) return;
    touchStartYRef.current = touch.clientY;
    touchLastYRef.current = touch.clientY;
    touchStartTimeRef.current = Date.now();
    setSheetDragging(true);
  };

  const handleSheetTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const startY = touchStartYRef.current;
    if (startY === null) return;
    const touch = event.touches[0];
    if (!touch) return;
    touchLastYRef.current = touch.clientY;
    const delta = Math.max(0, touch.clientY - startY);
    setSheetDragOffsetY(Math.min(delta, 320));
    if (delta > 0) event.preventDefault();
  };

  const resetSheetDrag = () => {
    touchStartYRef.current = null;
    touchLastYRef.current = 0;
    touchStartTimeRef.current = 0;
    setSheetDragging(false);
  };

  const handleSheetTouchEnd = () => {
    const startY = touchStartYRef.current;
    if (startY === null) return;
    const delta = Math.max(0, touchLastYRef.current - startY);
    const elapsedMs = Math.max(1, Date.now() - touchStartTimeRef.current);
    const velocity = delta / elapsedMs;
    resetSheetDrag();
    if (delta >= SWIPE_CLOSE_DISTANCE || velocity >= SWIPE_CLOSE_VELOCITY) {
      onClose();
      return;
    }
    setSheetDragOffsetY(0);
  };

  const handleSheetTouchCancel = () => {
    resetSheetDrag();
    setSheetDragOffsetY(0);
  };

  return (
    <Card
      ref={dropdownRef}
      className={`fixed bottom-0 sm:bottom-24 left-0 sm:left-1/2 sm:-translate-x-1/2 right-0 sm:right-auto mb-0 sm:mb-8 sm:w-[520px] shadow-2xl z-[1000] h-[85vh] sm:h-[620px] max-h-[85vh] flex flex-col bg-white/95 backdrop-blur-md border-t sm:border border-gray-200 rounded-t-3xl sm:rounded-2xl overflow-hidden translate-y-[var(--ai-sheet-drag-y)] sm:translate-y-0 ${
        sheetDragging ? "" : "transition-transform duration-200 ease-out"
      }`}
      style={{ "--ai-sheet-drag-y": `${sheetDragOffsetY}px` } as CSSProperties}
    >
      <div
        className="sm:hidden flex justify-center pt-3 pb-1"
        onTouchStart={handleSheetTouchStart}
        onTouchMove={handleSheetTouchMove}
        onTouchEnd={handleSheetTouchEnd}
        onTouchCancel={handleSheetTouchCancel}
      >
        <div className="w-12 h-1.5 bg-gray-200 rounded-full"></div>
      </div>

      <div className="flex items-center justify-between p-4 border-b bg-gray-50/50">
        <div>
          <h3 className="text-sm font-bold text-gray-900">
            {language === "zh" ? "选择 AI 模型" : "Choose AI Model"}
          </h3>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {language === "zh"
              ? "按收藏和热门度排序，最多可选 4 个模型；智能模型会独占选择。"
              : "Sorted by favorites and popularity. Select up to 4 models; smart mode is exclusive."}
          </p>
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

      <div className="p-3 bg-white space-y-3 border-b">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
          <Input
            type="text"
            placeholder={
              language === "zh"
                ? "搜索模型名称、能力或提供商..."
                : "Search model, capability, or provider..."
            }
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
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

        <div className="flex flex-wrap gap-2">
          <Button variant={pricingFilter === "all" ? "default" : "outline"} size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setPricingFilter("all")}>{language === "zh" ? "全部价格" : "All Prices"}</Button>
          <Button variant={pricingFilter === "free" ? "default" : "outline"} size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setPricingFilter("free")}>{language === "zh" ? "最低价" : "Lowest Price"}</Button>
          <Button variant={pricingFilter === "low" ? "default" : "outline"} size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setPricingFilter("low")}>{language === "zh" ? "低价" : "Low"}</Button>
          <Button variant={pricingFilter === "medium" ? "default" : "outline"} size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setPricingFilter("medium")}>{language === "zh" ? "中价" : "Medium"}</Button>
          <Button variant={pricingFilter === "high" ? "default" : "outline"} size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setPricingFilter("high")}>{language === "zh" ? "高价" : "High"}</Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 bg-white">
        <div className="p-2 space-y-4 min-h-[300px]">
          {sections.length === 0 ? (
            <div className="text-center py-12">
              <div className="bg-gray-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <Search className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">
                {language === "zh" ? "没有找到匹配的模型" : "No matching models found"}
              </p>
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.key} className="space-y-1">
                <div className="px-3 py-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  {section.title}
                  <div className="h-[1px] flex-1 bg-gray-100"></div>
                </div>

                <div className="grid grid-cols-1 gap-1">
                  {section.items.map((ai) => {
                    const selected = selectedAIs.some((item) => item.id === ai.id);
                    const smart = isSmartModel(ai);
                    const selectedNonSmartCount = selectedAIs.filter(
                      (item) => !isSmartModel(item),
                    ).length;
                    const disabledByLimit =
                      !selected && !smart && selectedNonSmartCount >= 4;
                    const disabled = disabledByLimit;
                    const favorite = favoriteIdSet.has(ai.id) || favoriteIdSet.has(ai.model);

                    return (
                      <div
                        key={ai.id}
                        className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                          smart
                            ? disabled
                              ? `cursor-not-allowed opacity-40 ${smartGradientLockedClass} border border-fuchsia-100`
                              : `cursor-pointer active:scale-[0.98] border ${
                                  selected
                                    ? `${smartGradientStrongClass} border-fuchsia-300 ring-2 ring-fuchsia-200 shadow-lg shadow-fuchsia-100/80`
                                    : `${smartGradientSoftClass} border-violet-200 hover:border-fuchsia-300 hover:shadow-md hover:shadow-fuchsia-100/80`
                                }`
                            : disabled
                              ? "cursor-not-allowed opacity-40"
                              : `cursor-pointer active:scale-[0.98] hover:bg-blue-50/50 ${selected ? "bg-blue-50 ring-1 ring-blue-200" : ""}`
                        }`}
                        onClick={() => !disabled && toggleAI(ai)}
                      >
                        {smart && (
                          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-white/85 border border-violet-200 px-1.5 py-0.5">
                            <Sparkles className="h-3 w-3 text-fuchsia-500" />
                            <span className={`text-[9px] font-bold tracking-wide ${smartGradientTextClass}`}>
                              {language === "zh" ? "自动" : "AUTO"}
                            </span>
                          </div>
                        )}

                        <div className={`flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                          smart
                            ? selected
                              ? "bg-[linear-gradient(135deg,#2f8cff_0%,#7a5cff_35%,#ff2d95_70%,#ff8a1f_100%)] border-transparent"
                              : "bg-white/85 border-violet-200"
                            : selected
                              ? "bg-blue-500 border-blue-500"
                              : "bg-white border-gray-300 group-hover:border-blue-400"
                        }`}>
                          {selected && <Check className="h-3.5 w-3.5 text-white" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleFavorite(ai);
                              }}
                              className="rounded p-0.5 text-gray-400 hover:text-amber-500"
                              title={
                                favorite
                                  ? language === "zh"
                                    ? "取消收藏"
                                    : "Unfavorite"
                                  : language === "zh"
                                    ? "收藏模型"
                                    : "Favorite model"
                              }
                            >
                              <Star className={`h-3.5 w-3.5 ${favorite ? "fill-amber-400 text-amber-500" : ""}`} />
                            </button>

                            {smart ? (
                              <Sparkles className="h-4 w-4 text-fuchsia-500 drop-shadow-[0_0_6px_rgba(217,70,239,0.45)]" />
                            ) : (
                              ai.icon && <span className="text-base leading-none">{ai.icon}</span>
                            )}

                            <span className={`text-sm font-semibold truncate ${smart ? smartGradientTextClass : selected ? "text-blue-700" : "text-gray-800"}`}>
                              {ai.name}
                            </span>
                          </div>

                          <div className="mt-0.5 flex items-center gap-2 min-w-0">
                            <p className={`min-w-0 flex-1 text-[11px] line-clamp-1 ${smart ? "text-slate-600" : "text-gray-500"}`}>
                              {ai.description}
                            </p>
                            {typeof ai.openrouterRank === "number" && ai.openrouterRank > 0 && (
                              <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                                #{ai.openrouterRank}
                              </span>
                            )}
                            {!smart && ai.pricingLevel && (
                              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                                {getPricingBadgeLabel(ai)}
                              </span>
                            )}
                          </div>

                          <div className="mt-1 text-[10px] text-gray-400 truncate">
                            {ai.model}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="p-4 border-t bg-gray-50/80 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <div className="text-xs font-medium text-gray-600">
              {language === "zh" ? "已选择 " : "Selected "}
              <span className="text-blue-600 font-bold">{selectedAIs.length}</span> / 4
            </div>
            {selectedAIs.length > 0 && (
              <button
                onClick={() => onSelectionChange([])}
                className="text-[10px] text-gray-400 hover:text-red-500 transition-colors text-left"
              >
                {language === "zh" ? "清空选择" : "Clear selection"}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedAIs.length >= 4 && (
              <div className="hidden xs:block text-[10px] px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">
                {language === "zh" ? "已达上限" : "Limit reached"}
              </div>
            )}
            <Button
              size="sm"
              className="h-9 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-bold shadow-lg shadow-blue-200 transition-all active:scale-95"
              onClick={onClose}
            >
              {language === "zh" ? "确定" : "Done"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
