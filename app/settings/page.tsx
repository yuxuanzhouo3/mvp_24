"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Globe,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import { Header } from "@/components/header";
import { useApp } from "@/components/app-context";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import { useTheme } from "next-themes";

export default function SettingsPage() {
  const router = useRouter();
  const { activeView, setActiveView } = useApp();
  const { language, setLanguage } = useLanguage();
  const t = useTranslations(language);
  const { theme, resolvedTheme, setTheme } = useTheme();
  const currentTheme: "light" | "dark" | "system" =
    theme === "light" || theme === "dark" ? theme : "system";
  const isDark = resolvedTheme === "dark";

  const handleViewChange = (view: string) => {
    setActiveView(view);
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0b0d12]">
      <Header activeView={activeView} setActiveView={handleViewChange} />

      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.common.back}</span>
          </Button>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="w-5 h-5" />
                <span>{t.settings.general}</span>
              </CardTitle>
              <CardDescription>
                {t.settings.customizeExperience}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center space-x-2">
                    <Globe className="w-4 h-4" />
                    <span>{t.settings.interfaceLanguage}</span>
                  </Label>
                  <p className="text-sm text-gray-600">
                    {t.settings.selectPreferredLanguage}
                  </p>
                </div>
                <Select
                  value={language}
                  onValueChange={(value) => setLanguage(value as "zh" | "en")}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh">中文</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center space-x-2">
                    {isDark ? (
                      <Moon className="w-4 h-4" />
                    ) : (
                      <Sun className="w-4 h-4" />
                    )}
                    <span>{t.settings.darkMode}</span>
                  </Label>
                  <p className="text-sm text-gray-600">
                    {t.settings.toggleTheme}
                  </p>
                </div>
                <Select
                  value={currentTheme}
                  onValueChange={(value) =>
                    setTheme(value as "light" | "dark" | "system")
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">
                      {(t.settings as any)?.themeLight || "Light"}
                    </SelectItem>
                    <SelectItem value="dark">
                      {(t.settings as any)?.themeDark || "Dark"}
                    </SelectItem>
                    <SelectItem value="system">
                      {(t.settings as any)?.themeSystem || "System"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {language === "zh"
                  ? "以上设置会立即生效"
                  : "Settings above take effect immediately"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
