"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUser } from "./user-context";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import { getClientAuthToken } from "@/lib/client-auth";
import { Zap } from "lucide-react";
import { detectPlatform } from "@/lib/platform-detection";

export function QuotaDisplay() {
  const { user } = useUser();
  const { language } = useLanguage();
  const t = useTranslations(language);
  const [usage, setUsage] = useState<{ used: number; limit: number; plan: string } | null>(null);
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

      if (response.ok) {
        const data = await response.json();
        setUsage(data);
      }
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

  if (!user || !usage || usage.plan === "pro") {
    return null;
  }

  const percentage = Math.min(100, (usage.used / usage.limit) * 100);
  const isLow = usage.limit - usage.used <= 10;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <Zap className={`w-3.5 h-3.5 ${isLow ? "text-orange-500 animate-pulse" : "text-blue-500"}`} />
          <span className="font-medium text-muted-foreground uppercase tracking-wider">
            {t.workspace.quotaUsage}
          </span>
        </div>
        <span className={`font-bold ${isLow ? "text-orange-600" : "text-foreground"}`}>
          {usage.used}/{usage.limit}
        </span>
      </div>
      <Progress value={percentage} className="h-1.5 w-full" />
      {detectPlatform().type !== 'ios-app' && (
        <p className="text-[10px] text-muted-foreground leading-tight">
          {language === 'zh'
            ? "免费版每月限额 50 条。升级 Pro 解锁无限额度。"
            : "Free tier limited to 50/mo. Upgrade to Pro for unlimited."}
        </p>
      )}
    </div>
  );
}
