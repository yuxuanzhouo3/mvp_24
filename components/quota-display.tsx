"use client";

import { useState, useEffect, useCallback } from "react";
import { Progress } from "@/components/ui/progress";
import { useUser } from "./user-context";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import { getClientAuthToken } from "@/lib/client-auth";
import { Zap } from "lucide-react";
import { detectPlatform } from "@/lib/platform-detection";

type UsagePayload = {
  used: number;
  limit: number;
  plan: string;
  multimodal?: {
    image: { used: number; limit: number; remaining: number };
    videoAudio: { used: number; limit: number; remaining: number };
  } | null;
};

export function QuotaDisplay() {
  const { user } = useUser();
  const { language } = useLanguage();
  const t = useTranslations(language);
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchUsage = useCallback(async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const { token } = await getClientAuthToken();
      if (!token) return;

      const response = await fetch("/api/user/usage", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) return;
      const data = (await response.json()) as UsagePayload;
      setUsage(data);
    } catch (error) {
      console.error("Failed to fetch usage:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUsage();
    
    // 监听消息发送成功的事件来刷新额度
    const handleMessageSent = () => {
      fetchUsage();
    };
    
    window.addEventListener("message-sent", handleMessageSent);
    return () => {
      window.removeEventListener("message-sent", handleMessageSent);
    };
  }, [fetchUsage]);

  if (!user) {
    return null;
  }
  if (loading && !usage) {
    return (
      <div className="text-xs text-muted-foreground">
        {language === "zh" ? "额度加载中..." : "Loading quota..."}
      </div>
    );
  }
  if (!usage) {
    return (
      <div className="text-xs text-muted-foreground">
        {language === "zh" ? "暂时无法加载额度信息" : "Unable to load quota right now"}
      </div>
    );
  }

  const showTextQuota = usage.limit > 0 && usage.limit < 999999;
  const multimodal = usage.multimodal || null;
  const showMultimodalQuota =
    !!multimodal &&
    (multimodal.image.limit > 0 || multimodal.videoAudio.limit > 0);

  if (!showTextQuota && !showMultimodalQuota) {
    return (
      <div className="text-xs text-muted-foreground">
        {language === "zh"
          ? "当前套餐文本额度无限制"
          : "Unlimited text quota for current plan"}
      </div>
    );
  }

  const percentage =
    usage.limit > 0 ? Math.min(100, (usage.used / usage.limit) * 100) : 0;
  const isLow = usage.limit - usage.used <= 10;
  const imagePercentage =
    multimodal && multimodal.image.limit > 0
      ? Math.min(100, (multimodal.image.used / multimodal.image.limit) * 100)
      : 0;
  const videoPercentage =
    multimodal && multimodal.videoAudio.limit > 0
      ? Math.min(
          100,
          (multimodal.videoAudio.used / multimodal.videoAudio.limit) * 100
        )
      : 0;

  return (
    <div className="space-y-3">
      {showTextQuota && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <Zap
                className={`w-3.5 h-3.5 ${
                  isLow ? "text-orange-500 animate-pulse" : "text-blue-500"
                }`}
              />
              <span className="font-medium text-muted-foreground uppercase tracking-wider">
                {t.workspace.quotaUsage}
              </span>
            </div>
            <span className={`font-bold ${isLow ? "text-orange-600" : "text-foreground"}`}>
              {usage.used}/{usage.limit}
            </span>
          </div>
          <Progress value={percentage} className="h-1.5 w-full" />
          {detectPlatform().type !== "ios-app" && (
            <p className="text-[10px] text-muted-foreground leading-tight">
              {language === "zh"
                ? "免费版每月限额 50 条。升级 Pro 解锁无限额度。"
                : "Free tier limited to 50/mo. Upgrade to Pro for unlimited."}
            </p>
          )}
        </div>
      )}

      {showMultimodalQuota && multimodal && (
        <div className="space-y-2 border-t border-border/60 pt-2">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            {language === "zh" ? "多模态额度" : "Multimodal Quota"}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span>{language === "zh" ? "图片" : "Images"}</span>
              <span>
                {multimodal.image.used}/{multimodal.image.limit}
              </span>
            </div>
            <Progress value={imagePercentage} className="h-1.5 w-full" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span>{language === "zh" ? "视频/音频" : "Video/Audio"}</span>
              <span>
                {multimodal.videoAudio.used}/{multimodal.videoAudio.limit}
              </span>
            </div>
            <Progress value={videoPercentage} className="h-1.5 w-full" />
          </div>
        </div>
      )}
    </div>
  );
}
