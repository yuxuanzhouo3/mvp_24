"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { X, Settings } from "lucide-react";

type DebugRegion = "china" | "usa" | "europe" | null;

export function DebugModeIndicator() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [debugRegion, setDebugRegion] = useState<DebugRegion>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const debug = searchParams.get("debug") as DebugRegion;
    setDebugRegion(debug);
  }, [searchParams]);

  // 只在开发环境显示
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  // 没有调试模式时不显示
  if (!debugRegion) {
    return null;
  }

  const regionInfo = {
    china: {
      label: "中国",
      emoji: "🇨🇳",
      color: "bg-red-500",
    },
    usa: {
      label: "美国",
      emoji: "🇺🇸",
      color: "bg-blue-500",
    },
    europe: {
      label: "欧洲",
      emoji: "🇪🇺",
      color: "bg-green-500",
    },
  };

  const currentRegion = regionInfo[debugRegion];

  const switchRegion = (newRegion: DebugRegion) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newRegion) {
      params.set("debug", newRegion);
    } else {
      params.delete("debug");
    }

    const newUrl = `${pathname}?${params.toString()}`;
    router.push(newUrl);
  };

  const exitDebugMode = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("debug");
    const newUrl = params.toString()
      ? `${pathname}?${params.toString()}`
      : pathname;
    router.push(newUrl);
  };

  return (
    <div className="fixed top-4 right-4 z-50">
      <div
        className={`${
          currentRegion.color
        } text-white rounded-lg shadow-lg transition-all duration-200 ${
          isExpanded ? "w-64" : "w-auto"
        }`}
      >
        {/* 主显示区域 */}
        <div
          className="flex items-center gap-2 px-4 py-2 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Settings
            className="w-4 h-4 animate-spin"
            style={{ animationDuration: "3s" }}
          />
          <span className="text-sm font-medium">
            {currentRegion.emoji} 调试模式: {currentRegion.label}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              exitDebugMode();
            }}
            className="ml-auto hover:bg-white/20 rounded p-1 transition-colors"
            title="退出调试模式"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 展开的区域切换面板 */}
        {isExpanded && (
          <div className="border-t border-white/20 p-3 space-y-2">
            <p className="text-xs opacity-80 mb-2">切换区域:</p>

            {Object.entries(regionInfo).map(([key, info]) => (
              <button
                key={key}
                onClick={() => switchRegion(key as DebugRegion)}
                className={`w-full text-left px-3 py-2 rounded transition-colors text-sm ${
                  debugRegion === key
                    ? "bg-white/30 font-semibold"
                    : "bg-white/10 hover:bg-white/20"
                }`}
              >
                {info.emoji} {info.label}
              </button>
            ))}

            <button
              onClick={exitDebugMode}
              className="w-full text-left px-3 py-2 rounded bg-white/10 hover:bg-white/20 transition-colors text-sm"
            >
              ❌ 退出调试模式
            </button>
          </div>
        )}
      </div>

      {/* 使用提示 */}
      {!isExpanded && (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-right">
          点击展开更多选项
        </div>
      )}
    </div>
  );
}
