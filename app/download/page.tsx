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
  Loader2,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import {
  getDownloadConfig,
  detectUserPlatform,
  type PlatformType,
} from "@/lib/config/download.config";
import { isChinaRegion } from "@/lib/config/region";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function DownloadPage() {
  const { language } = useLanguage();
  const t = useTranslations(language);
  const [isChina, setIsChina] = useState(false);
  const [userPlatform, setUserPlatform] = useState<PlatformType | null>(null);
  const [downloadingPlatform, setDownloadingPlatform] = useState<string | null>(null);
  const [downloadingArch, setDownloadingArch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsChina(isChinaRegion());
    setUserPlatform(detectUserPlatform());
  }, []);

  const config = getDownloadConfig(isChina);

  /**
   * 处理下载逻辑
   * - 国内版：调用 /api/downloads 端点从 CloudBase 下载
   * - 国际版：直接重定向到 URL
   */
  const handleDownload = async (platform: PlatformType, arch?: string) => {
    try {
      setError(null);
      setDownloadingPlatform(platform);
      setDownloadingArch(arch || null);

      if (isChina) {
        // 国内版：通过 API 端点下载
        console.log('[Download] 国内版下载，平台:', platform, '架构:', arch);
        const archParam = arch ? `&arch=${arch}` : '';
        const response = await fetch(`/api/downloads?platform=${platform}&region=CN${archParam}`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || '下载失败');
        }

        const data = await response.json();

        if (data.success && data.downloadUrl) {
          // 创建临时链接并触发下载
          const link = document.createElement('a');
          link.href = data.downloadUrl;
          link.download = data.fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          console.log('[Download] 下载完成:', data.fileName);
        } else {
          throw new Error('无法获取下载链接');
        }
      } else {
        // 国际版：获取下载 URL 并用 window.open() 打开（避免 CORS 问题）
        console.log('[Download] 国际版下载，平台:', platform, '架构:', arch);
        const archParam = arch ? `&arch=${arch}` : '';
        const response = await fetch(`/api/downloads?platform=${platform}&region=INTL${archParam}`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || '获取下载链接失败');
        }

        const data = await response.json();

        if (data.success && data.downloadUrl) {
          // 用 window.open() 打开下载链接（不受 CORS 限制）
          window.open(data.downloadUrl, '_blank');
          console.log('[Download] 已打开下载链接:', data.downloadUrl);
        } else {
          throw new Error('无法获取下载链接');
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '下载失败，请稍后重试';
      console.error('[Download] 错误:', errorMessage);
      setError(errorMessage);
      // 3 秒后清除错误信息
      setTimeout(() => setError(null), 3000);
    } finally {
      setDownloadingPlatform(null);
    }
  };

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

  // 模拟日志
  const updateLogs = [
    {
      text: `${language === "zh" ? "最新版本发布" : "Latest Version Released"}`,
      date: new Date().toLocaleDateString(),
    },
    {
      text: `${
        language === "zh" ? "性能优化与Bug修复" : "Performance & Bug Fixes"
      }`,
      date: new Date(Date.now() - 86400000 * 3).toLocaleDateString(),
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

        {/* 错误提示 */}
        {error && (
          <div className="w-full max-w-lg mb-8 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* 3. 底部横排图标 (白底适配版) */}
        <div className="w-full flex flex-wrap justify-center gap-8 md:gap-16 pb-10">
          {config.downloads.map((download) => {
            // 创建唯一的按钮 key，对于 macOS，包含架构信息
            const buttonKey = download.arch
              ? `${download.platform}-${download.arch}`
              : download.platform;
            const isCurrent = userPlatform === download.platform;
            const isDownloading =
              downloadingPlatform === download.platform &&
              (download.arch ? downloadingArch === download.arch : !downloadingArch);

            // 根据语言动态获取平台标签
            let platformLabel = t.download.platform[download.platform as keyof typeof t.download.platform] as string;

            // 对于 macOS，在标签后面添加架构信息
            if (download.arch && download.platform === 'macos') {
              const archLabel =
                download.arch === 'intel'
                  ? 'Intel'
                  : 'Apple Silicon';
              platformLabel = `${platformLabel} (${archLabel})`;
            }

            return (
              <button
                key={buttonKey}
                onClick={() => handleDownload(download.platform, download.arch)}
                disabled={isDownloading}
                className="group flex flex-col items-center gap-4 transition-all duration-300 hover:-translate-y-2 bg-none border-none cursor-pointer"
              >
                {/* 圆形图标容器 */}
                <div
                  className={cn(
                    "w-16 h-16 md:w-[72px] md:h-[72px] rounded-full flex items-center justify-center transition-all duration-300",
                    // 默认样式：淡灰背景，深灰图标，细微边框
                    "bg-slate-50 border border-slate-200 text-slate-600",

                    // Hover样式：淡蓝背景，蓝色图标，蓝色边框
                    "group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:border-blue-200 group-hover:shadow-lg group-hover:shadow-blue-500/10",

                    // 当前设备：强调边框
                    isCurrent &&
                      "ring-2 ring-blue-500 ring-offset-2 ring-offset-white border-blue-200 bg-blue-50 text-blue-600",

                    // 下载中的状态
                    isDownloading && "opacity-70"
                  )}
                >
                  {isDownloading ? (
                    <Loader2 className="w-8 h-8 md:w-9 md:h-9 animate-spin" />
                  ) : (
                    getPlatformIcon(
                      download.platform,
                      "w-8 h-8 md:w-9 md:h-9 transition-transform duration-300 group-hover:scale-110"
                    )
                  )}
                </div>

                {/* 文字标签 */}
                <span
                  className={cn(
                    "text-sm font-medium tracking-wide transition-colors text-center",
                    "text-slate-500 group-hover:text-blue-600",
                    isCurrent && "text-blue-600 font-semibold"
                  )}
                >
                  {isDownloading ? (language === "zh" ? "下载中..." : "Downloading...") : platformLabel}
                </span>
              </button>
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
