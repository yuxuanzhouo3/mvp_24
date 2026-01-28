"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Download,
  Monitor,
  Smartphone,
  Apple,
  Laptop,
  ChevronRight,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import {
  detectUserPlatform,
  type PlatformType,
} from "@/lib/config/download.config";
import { isChinaRegion } from "@/lib/config/region";
import Link from "next/link";
import { cn } from "@/lib/utils";

const PLATFORMS: PlatformType[] = ["android", "ios", "windows", "macos"];

type DownloadRelease = {
  platform: PlatformType;
  version: string;
  cloudbase_file_id?: string | null;
  download_filename?: string | null;
  file_url?: string | null;
  file_size?: number | null;
};

export default function DownloadPage() {
  const { language } = useLanguage();
  const t = useTranslations(language);
  const [isChina, setIsChina] = useState(false);
  const [userPlatform, setUserPlatform] = useState<PlatformType | null>(null);
  const [releaseMetadata, setReleaseMetadata] = useState<Record<PlatformType, DownloadRelease | null>>(
    () => ({
      android: null,
      ios: null,
      windows: null,
      macos: null,
      linux: null,
    })
  );
  const [releaseLoadError, setReleaseLoadError] = useState<string | null>(null);

  useEffect(() => {
    setIsChina(isChinaRegion());
    setUserPlatform(detectUserPlatform());
    let isMounted = true;
    (async () => {
      try {
        const res = await fetch("/api/releases/active");
        const data = await res.json();
        if (!isMounted) return;
        if (data.success) {
          const normalized: Record<PlatformType, DownloadRelease | null> = {
            android: null,
            ios: null,
            windows: null,
            macos: null,
            linux: null,
          };
          (data.releases || []).forEach((item: DownloadRelease) => {
            if (item.platform && normalized[item.platform] !== undefined) {
              normalized[item.platform] = item;
            }
          });
          setReleaseMetadata(normalized);
        } else {
          setReleaseLoadError(data.error || "下载信息加载失败");
        }
      } catch (error) {
        console.error("加载下载版本失败", error);
        if (isMounted) {
          setReleaseLoadError("下载信息加载失败");
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const releaseHintText =
    language === "zh" ? "版本信息正在同步" : "Version info syncing";

  const getPlatformIcon = (platform: PlatformType, className = "w-6 h-6") => {
    switch (platform) {
      case "android":
      case "ios":
        return <Smartphone className={className} />;
      case "macos":
        return <Apple className={className} />;
      case "windows":
        return <Monitor className={className} />;
      case "linux":
        return <Laptop className={className} />;
      default:
        return <Download className={className} />;
    }
  };

  const formatLogDate = (date: Date) =>
    new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).format(date);

  // 模拟日志
  const updateLogs = [
    {
      text: `${language === "zh" ? "最新版本发布" : "Latest Version Released"}`,
      date: formatLogDate(new Date()),
    },
    {
      text: `${
        language === "zh" ? "性能优化与Bug修复" : "Performance & Bug Fixes"
      }`,
      date: formatLogDate(new Date(Date.now() - 86400000 * 3)),
    },
  ];

  return (
    <div className="min-h-screen w-full flex flex-col items-center relative overflow-hidden bg-white text-slate-900 font-sans selection:bg-blue-100">
      {/* 顶部返回按钮 */}
      <div className="absolute top-6 left-6 z-20">
        <Link href="/">
          <Button
            variant="ghost"
            className="text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            {t.common.back}
          </Button>
        </Link>
      </div>

      {/* 核心内容区 */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-5xl px-4 py-12">
        {/* 1. Logo 和 标题 */}
        <div className="text-center mb-12 md:mb-20 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="w-20 h-20 mx-auto bg-blue-50 rounded-[20px] flex items-center justify-center mb-6 shadow-sm">
            <Download className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
            {t.download.title}
          </h1>
        </div>

        {/* 2. 日志列表 (灰色调) */}
        <div className="w-full max-w-lg mb-16 md:mb-24">
          {/* 分割线 - 灰色渐变 */}
          <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent mb-6" />

          <div className="space-y-3 text-sm md:text-base text-slate-500">
            {updateLogs.map((log, i) => (
              <div key={i} className="flex justify-between items-center px-4">
                <span className="font-medium text-slate-700">{log.text}</span>
                <span className="opacity-60 text-xs md:text-sm font-mono bg-slate-50 px-2 py-0.5 rounded text-slate-400">
                  {log.date}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center px-4 pt-2 cursor-pointer hover:text-blue-600 transition-colors group">
              <span className="flex items-center gap-1 text-sm">
                {language === "zh" ? "查看更多日志" : "View More Logs"}
                <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </div>
          </div>
        </div>

        {/* 3. 底部横排图标 (白底适配版) */}
        <div className="w-full flex flex-wrap justify-center gap-8 md:gap-16 pb-10">
          {PLATFORMS.map((platform) => {
            const isCurrent = userPlatform === platform;
            const release = releaseMetadata[platform];
            const platformLabel =
              t.download.platform[platform as keyof typeof t.download.platform];

            // CN 用 CloudBase，INTL 用 Supabase URL
            const hasDownloadUrl = isChina
              ? release?.cloudbase_file_id
              : release?.file_url;

            const downloadUrl = hasDownloadUrl
              ? `/api/downloads?platform=${platform}&region=${isChina ? "CN" : "INTL"}${
                  platform === "macos" ? "&arch=apple-silicon" : ""
                }`
              : "#";

            const versionLabel = release?.version
              ? language === "zh"
                ? `版本 ${release.version}`
                : `Version ${release.version}`
              : releaseLoadError
              ? releaseLoadError
              : releaseHintText;

            const isDisabled = !hasDownloadUrl;

            return (
              <a
                key={platform}
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={isDisabled}
                className={cn(
                  "group flex flex-col items-center gap-4 transition-all duration-300",
                  isDisabled ? "pointer-events-none opacity-60" : "hover:-translate-y-2"
                )}
              >
                {/* 圆形图标容器 */}
                <div
                  className={cn(
                    "w-16 h-16 md:w-[72px] md:h-[72px] rounded-full flex items-center justify-center transition-all duration-300",
                    "bg-slate-50 border border-slate-200 text-slate-600",
                    "group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:border-blue-200 group-hover:shadow-lg group-hover:shadow-blue-500/10",
                    isCurrent &&
                      "ring-2 ring-blue-500 ring-offset-2 ring-offset-white border-blue-200 bg-blue-50 text-blue-600"
                  )}
                >
                  {getPlatformIcon(
                    platform,
                    "w-8 h-8 md:w-9 md:h-9 transition-transform duration-300 group-hover:scale-110"
                  )}
                </div>

                {/* 文字标签 */}
                <div className="text-center">
                  <span
                    className={cn(
                      "text-sm font-medium tracking-wide transition-colors",
                      "text-slate-500 group-hover:text-blue-600",
                      isCurrent && "text-blue-600 font-semibold"
                    )}
                  >
                    {platformLabel}
                  </span>
                  <p className="text-xs text-slate-400 mt-1">{versionLabel}</p>
                </div>
              </a>
            );
          })}
        </div>
      </div>

      {/* 底部版权 */}
      <footer className="absolute bottom-4 text-[10px] text-slate-300">
        Copyright © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
