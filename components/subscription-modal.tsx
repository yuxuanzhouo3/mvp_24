"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, Zap, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import { useRouter } from "next/navigation";

export function SubscriptionModal() {
  const [isOpen, setIsOpen] = useState(false);
  const { language } = useLanguage();
  const t = useTranslations(language);
  const router = useRouter();

  useEffect(() => {
    const handleShowModal = () => {
      setIsOpen(true);
    };

    window.addEventListener("show-subscription-modal", handleShowModal);
    return () => {
      window.removeEventListener("show-subscription-modal", handleShowModal);
    };
  }, []);

  const handleUpgrade = () => {
    setIsOpen(false);
    router.push("/payment");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden border-none shadow-2xl">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white relative overflow-hidden">
          {/* 背景装饰 */}
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-blue-400/20 rounded-full blur-3xl" />
          
          <div className="relative z-10 flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-inner">
              <Crown className="w-10 h-10 text-yellow-300 drop-shadow-sm" />
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-bold text-white">
                {language === 'zh' ? "额度已用完" : "Quota Exhausted"}
              </DialogTitle>
              <DialogDescription className="text-blue-100 text-base">
                {language === 'zh' 
                  ? "升级 Pro 会员，解锁无限对话额度" 
                  : "Upgrade to Pro for unlimited conversations"}
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="p-6 bg-white space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 bg-green-100 p-1 rounded-full">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  {language === 'zh' ? "无限对话次数" : "Unlimited Messages"}
                </p>
                <p className="text-sm text-gray-500">
                  {language === 'zh' ? "不再受每月 50 条的限制" : "No more 50/mo limits"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 bg-blue-100 p-1 rounded-full">
                <Zap className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  {language === 'zh' ? "更快的响应速度" : "Faster Response"}
                </p>
                <p className="text-sm text-gray-500">
                  {language === 'zh' ? "优先处理您的请求" : "Priority processing for your requests"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 bg-purple-100 p-1 rounded-full">
                <Crown className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  {language === 'zh' ? "解锁高级模型" : "Access Premium Models"}
                </p>
                <p className="text-sm text-gray-500">
                  {language === 'zh' ? "体验最强大的 AI 能力" : "Experience the most powerful AI capabilities"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button 
              onClick={handleUpgrade}
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-xl shadow-lg shadow-blue-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              {language === 'zh' ? "立即升级" : "Upgrade Now"}
            </Button>
            <Button 
              variant="ghost" 
              onClick={() => setIsOpen(false)}
              className="w-full text-gray-500 hover:text-gray-700"
            >
              {language === 'zh' ? "稍后再说" : "Maybe Later"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
