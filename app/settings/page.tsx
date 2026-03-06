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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
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
  Bot,
  Globe,
  Moon,
  Palette,
  RotateCcw,
  Settings,
  Sparkles,
  Sun,
} from "lucide-react";
import { Header } from "@/components/header";
import { useAppearance } from "@/components/appearance-provider";
import { useApp } from "@/components/app-context";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import {
  APPEARANCE_PRESETS,
  ASSISTANT_AVATAR_PRESETS,
  getAppearanceColors,
} from "@/lib/appearance";
import { useTheme } from "next-themes";

export default function SettingsPage() {
  const router = useRouter();
  const { activeView, setActiveView } = useApp();
  const { language, setLanguage } = useLanguage();
  const t = useTranslations(language);
  const { theme, resolvedTheme, setTheme } = useTheme();
  const {
    appearance,
    colors,
    assistantAvatarFallback,
    assistantAvatarSrc,
    setAppearance,
    resetAppearance,
  } = useAppearance();
  const currentTheme: "light" | "dark" | "system" =
    theme === "light" || theme === "dark" ? theme : "system";
  const isDark = resolvedTheme === "dark";
  const previewName =
    appearance.assistantName ||
    (language === "zh" ? "你的 AI 助手" : "Your AI Assistant");
  const customPreviewColors = getAppearanceColors({
    ...appearance,
    presetId: "custom",
  });
  const previewGradient = {
    backgroundImage: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.accent} 100%)`,
  };

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
                <Settings className="h-5 w-5" />
                <span>{t.settings.general}</span>
              </CardTitle>
              <CardDescription>{t.settings.customizeExperience}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center space-x-2">
                    <Globe className="h-4 w-4" />
                    <span>{t.settings.interfaceLanguage}</span>
                  </Label>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t.settings.selectPreferredLanguage}
                  </p>
                </div>
                <Select
                  value={language}
                  onValueChange={(value) => setLanguage(value as "zh" | "en")}
                >
                  <SelectTrigger className="w-full md:w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh">中文</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center space-x-2">
                    {isDark ? (
                      <Moon className="h-4 w-4" />
                    ) : (
                      <Sun className="h-4 w-4" />
                    )}
                    <span>{t.settings.darkMode}</span>
                  </Label>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t.settings.toggleTheme}
                  </p>
                </div>
                <Select
                  value={currentTheme}
                  onValueChange={(value) =>
                    setTheme(value as "light" | "dark" | "system")
                  }
                >
                  <SelectTrigger className="w-full md:w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">{t.settings.themeLight}</SelectItem>
                    <SelectItem value="dark">{t.settings.themeDark}</SelectItem>
                    <SelectItem value="system">{t.settings.themeSystem}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-3 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="flex items-center space-x-2">
                    <Palette className="h-5 w-5" />
                    <span>{t.settings.palettePresets}</span>
                  </CardTitle>
                  <CardDescription className="mt-2 text-sm leading-6">
                    {t.settings.paletteDescription}
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetAppearance}
                  className="h-9 shrink-0 px-3 md:hidden"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 md:space-y-6">
              <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-3">
                {APPEARANCE_PRESETS.map((preset) => {
                  const isSelected = appearance.presetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setAppearance({ presetId: preset.id })}
                      className={`min-w-[156px] snap-start rounded-xl border p-3 text-left transition-all md:min-w-0 md:rounded-2xl md:p-4 ${
                        isSelected
                          ? "border-primary ring-2 ring-primary/20"
                          : "border-border hover:border-primary/40 hover:bg-muted/40"
                      }`}
                    >
                      <div
                        className="mb-2.5 h-9 rounded-lg md:mb-3 md:h-12 md:rounded-xl"
                        style={{
                          backgroundImage: `linear-gradient(135deg, ${
                            preset.id === "custom"
                              ? customPreviewColors.primary
                              : preset.primary
                          } 0%, ${
                            preset.id === "custom"
                              ? customPreviewColors.accent
                              : preset.accent
                          } 100%)`,
                        }}
                      />
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium md:text-base">
                            {preset.label[language]}
                          </div>
                          <p className="mt-1 hidden text-xs text-muted-foreground md:block">
                            {preset.description[language]}
                          </p>
                        </div>
                        {isSelected && (
                          <span className="inline-flex h-6 items-center rounded-full bg-primary/10 px-2 text-xs font-medium text-primary md:px-2.5">
                            <span className="md:hidden">✓</span>
                            <span className="hidden md:inline">
                              {language === "zh" ? "当前" : "Active"}
                            </span>
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {appearance.presetId === "custom" && (
                <div className="rounded-xl border bg-background p-3 md:max-w-sm">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <Label className="text-xs text-muted-foreground md:text-sm">
                      {t.settings.customPrimary}
                    </Label>
                    <div className="mt-3 flex items-center gap-3">
                      <input
                        type="color"
                        value={appearance.customPrimary}
                        onChange={(event) =>
                          setAppearance({
                            presetId: "custom",
                            customPrimary: event.target.value,
                          })
                        }
                        className="h-10 w-10 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                      />
                      <span className="truncate text-xs font-medium uppercase text-muted-foreground md:text-sm">
                        {appearance.customPrimary}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    {t.settings.customColorHelp}
                  </p>
                  </div>
              )}

              <div className="hidden rounded-2xl border border-dashed p-4 md:flex md:flex-row md:items-center md:justify-between md:gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t.settings.resetAppearance}</p>
                  <p className="text-sm text-muted-foreground">
                    {language === "zh"
                      ? "一键恢复默认配色和 AI 形象"
                      : "Restore the default palette and assistant identity"}
                  </p>
                </div>
                <Button variant="outline" onClick={resetAppearance}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t.settings.resetAppearance}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Bot className="h-5 w-5" />
                <span>{t.settings.aiIdentity}</span>
              </CardTitle>
              <CardDescription>{t.settings.aiIdentityDescription}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="assistant-name">{t.settings.aiName}</Label>
                    <Input
                      id="assistant-name"
                      value={appearance.assistantName}
                      onChange={(event) =>
                        setAppearance({ assistantName: event.target.value })
                      }
                      maxLength={24}
                      placeholder={t.settings.aiNamePlaceholder}
                    />
                  </div>

                  <div className="space-y-3">
                    <Label>{t.settings.aiAvatar}</Label>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                      {ASSISTANT_AVATAR_PRESETS.map((avatar) => {
                        const isSelected = appearance.assistantAvatar === avatar;
                        return (
                          <button
                            key={avatar}
                            type="button"
                            onClick={() => setAppearance({ assistantAvatar: avatar })}
                            className={`flex h-12 items-center justify-center rounded-2xl border text-xl transition-all ${
                              isSelected
                                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                : "border-border hover:border-primary/40"
                            }`}
                          >
                            {avatar}
                          </button>
                        );
                      })}
                    </div>

                    <Input
                      value={appearance.assistantAvatar}
                      onChange={(event) =>
                        setAppearance({ assistantAvatar: event.target.value })
                      }
                      placeholder={t.settings.aiAvatarPlaceholder}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t.settings.aiAvatarHelp}
                    </p>
                  </div>
                </div>

                <div className="rounded-3xl border bg-background/60 p-5 shadow-sm backdrop-blur">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{t.settings.preview}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.settings.previewDescription}
                      </p>
                    </div>
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>

                  <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                    <div className="flex items-center justify-between border-b px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 rounded-xl ring-1 ring-border/60">
                          <AvatarImage src={assistantAvatarSrc} alt={previewName} />
                          <AvatarFallback
                            className="text-sm font-semibold text-white"
                            style={previewGradient}
                          >
                            {assistantAvatarFallback}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p
                            className="bg-clip-text text-sm font-semibold text-transparent"
                            style={previewGradient}
                          >
                            {previewName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {currentTheme === "system"
                              ? t.settings.themeSystem
                              : currentTheme === "dark"
                                ? t.settings.themeDark
                                : t.settings.themeLight}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                        {language === "zh" ? "在线" : "Online"}
                      </span>
                    </div>

                    <div className="space-y-4 p-4">
                      <div className="rounded-2xl bg-muted/70 p-3 text-sm text-muted-foreground">
                        {t.settings.previewGreeting}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-10 flex-1 rounded-xl border bg-background px-4 py-2 text-sm text-muted-foreground">
                          {language === "zh" ? "输入你的需求…" : "Type your request..."}
                        </div>
                        <Button size="sm">{language === "zh" ? "发送" : "Send"}</Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
