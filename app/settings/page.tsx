"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowLeft,
  Settings,
  Moon,
  Sun,
  Globe,
  Bell,
  Shield,
} from "lucide-react";
import { Header } from "@/components/header";
import { useApp } from "@/components/app-context";
import { useUser } from "@/components/user-context";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";

export default function SettingsPage() {
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [emailUpdates, setEmailUpdates] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const { activeView, setActiveView } = useApp();
  const { user } = useUser(); // 移除 refreshUser，因为不再需要
  const { language, setLanguage } = useLanguage();
  const t = useTranslations(language);

  const router = useRouter();

  // 移除不必要的用户状态刷新，user-context.tsx 已经处理了初始化
  // useEffect(() => {
  //   const checkUserState = async () => {
  //     await refreshUser();
  //   };
  //   checkUserState();
  // }, [refreshUser]);

  const handleSave = async () => {
    setSaving(true);
    setSuccess("");

    // 这里可以保存设置到后端
    // 暂时只是模拟保存过程
    setTimeout(() => {
      setSuccess(t.settings.saved);
      setSaving(false);
    }, 1000);
  };

  const handleViewChange = (view: string) => {
    setActiveView(view);
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-gray-50">
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
              {/* 语言设置 */}
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
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh">中文</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 深色模式 */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center space-x-2">
                    {darkMode ? (
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
                <Switch checked={darkMode} onCheckedChange={setDarkMode} />
              </div>

              {/* 自动保存 */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t.settings.autoSave}</Label>
                  <p className="text-sm text-gray-600">
                    {t.settings.autoSaveDesc}
                  </p>
                </div>
                <Switch checked={autoSave} onCheckedChange={setAutoSave} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Bell className="w-5 h-5" />
                <span>{t.settings.notifications}</span>
              </CardTitle>
              <CardDescription>
                {t.settings.manageNotificationPreferences}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 推送通知 */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t.settings.pushNotifications}</Label>
                  <p className="text-sm text-gray-600">
                    {t.settings.receivePushNotifications}
                  </p>
                </div>
                <Switch
                  checked={notifications}
                  onCheckedChange={setNotifications}
                />
              </div>

              {/* 邮件更新 */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t.settings.emailUpdates}</Label>
                  <p className="text-sm text-gray-600">
                    {t.settings.receiveProductUpdates}
                  </p>
                </div>
                <Switch
                  checked={emailUpdates}
                  onCheckedChange={setEmailUpdates}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="w-5 h-5" />
                <span>{t.settings.privacySecurity}</span>
              </CardTitle>
              <CardDescription>
                {t.settings.managePrivacySettings}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button variant="outline" className="justify-start">
                  {t.settings.changePassword}
                </Button>
                <Button variant="outline" className="justify-start">
                  {t.settings.twoFactorAuth}
                </Button>
                <Button variant="outline" className="justify-start">
                  {t.settings.downloadData}
                </Button>
                <Button
                  variant="outline"
                  className="justify-start text-red-600 hover:text-red-700"
                >
                  {t.settings.deleteAccount}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 保存按钮 */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {t.settings.saving}
                </>
              ) : (
                <>
                  <Settings className="w-4 h-4 mr-2" />
                  {t.settings.save}
                </>
              )}
            </Button>
          </div>

          {/* 成功消息 */}
          {success && (
            <Alert>
              <AlertDescription className="text-green-600">
                {success}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
