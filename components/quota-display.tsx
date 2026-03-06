"use client";

import { useState, useEffect, useCallback } from "react";
import { Progress } from "@/components/ui/progress";
import { useUser } from "./user-context";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import { getClientAuthToken } from "@/lib/client-auth";
import { Zap } from "lucide-react";

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
        cache: "no-store",
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

  const showConversationQuota = usage.limit > 0;
  const multimodal = usage.multimodal || null;
  const showImageQuota = !!multimodal && multimodal.image.limit > 0;
  const showVideoAudioQuota =
    !!multimodal && multimodal.videoAudio.limit > 0;
  const showMultimodalQuota = showImageQuota || showVideoAudioQuota;

  if (!showConversationQuota && !showImageQuota && !showVideoAudioQuota) {
    return (
      <div className="text-xs text-muted-foreground">
        {language === "zh"
          ? "当前套餐文本额度无限制"
          : "Unlimited text quota for current plan"}
      </div>
    );
  }

  const isConversationUnlimited = usage.limit >= 999999;
  const conversationPercentage = isConversationUnlimited
    ? 100
    : usage.limit > 0
      ? Math.min(100, (usage.used / usage.limit) * 100)
      : 0;
  const isConversationLow =
    !isConversationUnlimited && usage.limit - usage.used <= 10;
  const imagePercentage =
    multimodal && showImageQuota
      ? Math.min(100, (multimodal.image.used / multimodal.image.limit) * 100)
      : 0;
  const videoPercentage =
    multimodal && showVideoAudioQuota
      ? Math.min(
          100,
          (multimodal.videoAudio.used / multimodal.videoAudio.limit) * 100
        )
      : 0;
  const isImageLow = !!multimodal && showImageQuota && multimodal.image.remaining <= 3;
  const isVideoAudioLow =
    !!multimodal &&
    showVideoAudioQuota &&
    multimodal.videoAudio.remaining <= 1;
  const isMultimodalLow = isImageLow || isVideoAudioLow;

  const multimodalRiskHint = (() => {
    if (!multimodal || !isMultimodalLow) return "";
    const items: string[] = [];
    if (isImageLow && showImageQuota) {
      items.push(
        language === "zh"
          ? `图片剩余 ${multimodal.image.remaining}`
          : `images remaining ${multimodal.image.remaining}`
      );
    }
    if (isVideoAudioLow && showVideoAudioQuota) {
      items.push(
        language === "zh"
          ? `视频/音频剩余 ${multimodal.videoAudio.remaining}`
          : `video/audio remaining ${multimodal.videoAudio.remaining}`
      );
    }
    if (language === "zh") {
      return `风险提示：${items.join("，")}，请及时补充额度。`;
    }
    return `Risk alert: ${items.join(", ")}. Please top up in time.`;
  })();

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <Zap
              className={`w-3.5 h-3.5 ${
                isConversationLow ? "text-orange-500 animate-pulse" : "text-blue-500"
              }`}
            />
            <span className="font-medium text-muted-foreground uppercase tracking-wider">
              {t.workspace.quotaUsage}
            </span>
          </div>
        </div>

        {showConversationQuota && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span>{language === "zh" ? "对话" : "Conversation"}</span>
              <span
                className={`font-semibold ${
                  isConversationLow ? "text-orange-600" : "text-foreground"
                }`}
              >
                {usage.used}/{isConversationUnlimited ? "∞" : usage.limit}
              </span>
            </div>
            <Progress value={conversationPercentage} className="h-1.5 w-full" />
          </div>
        )}

        {showImageQuota && multimodal && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span>{language === "zh" ? "图片" : "Images"}</span>
              <span className={isImageLow ? "font-semibold text-orange-600" : "font-semibold"}>
                {multimodal.image.used}/{multimodal.image.limit}
              </span>
            </div>
            <Progress value={imagePercentage} className="h-1.5 w-full" />
          </div>
        )}

        {showVideoAudioQuota && multimodal && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span>{language === "zh" ? "视频/音频" : "Video/Audio"}</span>
              <span
                className={isVideoAudioLow ? "font-semibold text-orange-600" : "font-semibold"}
              >
                {multimodal.videoAudio.used}/{multimodal.videoAudio.limit}
              </span>
            </div>
            <Progress value={videoPercentage} className="h-1.5 w-full" />
          </div>
        )}

        {showMultimodalQuota && multimodalRiskHint && (
          <p className="text-[10px] text-orange-600 leading-tight font-medium">
            {multimodalRiskHint}
          </p>
        )}
      </div>
    </div>
  );
}
