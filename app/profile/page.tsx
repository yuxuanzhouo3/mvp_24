"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getAuthClient } from "@/lib/auth/client";
// import { getDatabase } from "@/lib/database/adapter";
import { ArrowLeft, Save, User, Mail, Crown } from "lucide-react";
import { Header } from "@/components/header";
import { useApp } from "@/components/app-context";
import { useUser } from "@/components/user-context";
import { useTranslations } from "@/lib/i18n";

const authClient = getAuthClient();

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { language, activeView, setActiveView } = useApp();
  const { user: currentUser, loading: userLoading } = useUser();
  const t = useTranslations(language);

  const userInitial = useMemo(() => {
    const takeInitial = (value?: string | null) => {
      if (!value) return "";
      const trimmed = value.trim();
      return trimmed ? trimmed.charAt(0).toUpperCase() : "";
    };
    if (!user) return "U";
    return takeInitial(user.name) || takeInitial(user.email) || "U";
  }, [user]);

  const router = useRouter();
  const currentDebugParam =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("debug")
      : null;
  const buildUrl = (path: string) =>
    currentDebugParam ? `${path}?debug=${currentDebugParam}` : path;

  useEffect(() => {
    const initializeProfile = async () => {
      try {
        setLoading(true);

        // 检查用户是否已登录
        if (!currentUser) {
          router.push(buildUrl("/auth"));
          return;
        }

        // 从 API 获取用户资料
        const { tokenManager } = await import("@/lib/frontend-token-manager");
        const headers = await tokenManager.getAuthHeaderAsync();
        if (!headers) {
          router.push(buildUrl("/auth"));
          return;
        }

        const response = await fetch("/api/profile", { headers });
        if (!response.ok) {
          if (response.status === 401) {
            // 未登录，重定向到登录页面
            router.push(buildUrl("/auth"));
            return;
          }
          throw new Error("获取用户资料失败");
        }
        const profile = await response.json();

        // 规范化数据结构，确保 avatar 字段存在
        const normalizedProfile = {
          ...profile,
          avatar: profile.avatar || "",
        };

        setUser(normalizedProfile);
      } catch (error) {
        console.error("加载用户资料失败:", error);
        setError(t.profile.loadFailed);
      } finally {
        setLoading(false);
      }
    };

    if (!userLoading) {
      initializeProfile();
    }
  }, [currentUser, userLoading, router]);

  const handleSave = async () => {
    if (!user) return;
    console.log("💾 开始保存个人资料...");
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updates = {
        id: user.id,
        email: user.email,
        name: user.name?.trim() || "",
        avatar: user.avatar?.trim() || "",
        subscription_plan: user.subscription_plan,
        subscription_status: user.subscription_status,
      };

      console.log("📤 发送更新数据:", updates);

      const { tokenManager } = await import("@/lib/frontend-token-manager");
      const headers = await tokenManager.getAuthHeaderAsync();
      if (!headers) {
        throw new Error(t.profile.loadFailed);
      }

      // 添加 Content-Type 头
      headers["Content-Type"] = "application/json";
      console.log("🔑 包含认证头");

      const response = await fetch("/api/profile", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: updates.name,
          avatar: updates.avatar,
        }),
      });

      console.log("📡 API 响应状态:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.log("❌ API 错误响应:", errorText);
        throw new Error(`保存失败 (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      console.log("✅ 保存成功:", result);
      setUser(result);
      setSuccess(t.profile.saved);

      // 更新缓存和认证状态中的用户信息
      if (typeof window !== "undefined") {
        try {
          const { isChinaRegion } = await import("@/lib/config/region");

          if (isChinaRegion()) {
            // 中国版：使用本地认证状态管理器
            const { getStoredAuthState, saveAuthState } = await import(
              "@/lib/auth-state-manager"
            );
            const authState = getStoredAuthState();

            if (authState) {
              // 更新用户信息
              const updatedUser = {
                ...authState.user,
                name: result.name,
                avatar: result.avatar,
                email: result.email,
                id: result.id,
                subscription_plan: result.subscription_plan,
                subscription_status: result.subscription_status,
                subscription_expires_at: result.subscription_expires_at,
                membership_expires_at: result.membership_expires_at,
              };

              // 重新保存认证状态
              saveAuthState(
                authState.accessToken,
                authState.refreshToken,
                updatedUser,
                authState.tokenMeta
              );

              console.log("✅ [CN] 已更新认证状态中的用户信息");
            } else {
              // 如果没有找到认证状态，尝试更新旧的localStorage键作为后备
              const cachedUser = localStorage.getItem("auth-user");
              if (cachedUser) {
                const userData = JSON.parse(cachedUser);
                userData.name = result.name;
                userData.avatar = result.avatar;
                userData.email = result.email;
                userData.id = result.id;
                userData.subscription_plan = result.subscription_plan;
                userData.subscription_status = result.subscription_status;
                userData.subscription_expires_at =
                  result.subscription_expires_at;
                userData.membership_expires_at = result.membership_expires_at;
                localStorage.setItem("auth-user", JSON.stringify(userData));
                console.log("✅ [CN] 已更新旧localStorage中的用户信息作为后备");
              }
            }
          } else {
            // 国际版：使用 Supabase 缓存管理器
            const { saveSupabaseUserCache } = await import(
              "@/lib/auth-state-manager-intl"
            );
            saveSupabaseUserCache(result);
            console.log("✅ [INTL] 已更新国际版用户缓存，支持跨标签页同步");
          }
        } catch (e) {
          console.error("❌ 更新缓存失败:", e);
        }
      }
    } catch (err) {
      console.error("❌ 保存失败:", err);
      setError(t.profile.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setUser((prev: any) => ({ ...prev, [field]: value }));
  };

  if (loading || userLoading)
    return (
      <div className="min-h-screen bg-gray-50">
        <Header activeView={activeView} setActiveView={setActiveView} />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">{t.profile.loading}</p>
          </div>
        </div>
      </div>
    );
  if (!currentUser)
    return (
      <div className="min-h-screen bg-gray-50">
        <Header activeView={activeView} setActiveView={setActiveView} />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <p className="text-gray-600">{t.profile.loginRequired}</p>
            <Button
              onClick={() => router.push(buildUrl("/auth"))}
              className="mt-4"
            >
              {t.auth.signInButton}
            </Button>
          </div>
        </div>
      </div>
    );
  if (!user)
    return (
      <div className="min-h-screen bg-gray-50">
        <Header activeView={activeView} setActiveView={setActiveView} />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">{t.profile.loading}</p>
          </div>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50">
      <Header activeView={activeView} setActiveView={setActiveView} />
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.profile.back}</span>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="w-5 h-5" />
              <span>{t.profile.title}</span>
            </CardTitle>
            <CardDescription>{t.profile.subtitle}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center space-x-4">
              <Avatar className="w-20 h-20">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="text-lg">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">{user.name}</h3>
                <div className="flex items-center space-x-2 text-gray-600">
                  <Mail className="w-4 h-4" />
                  <span>{user.email}</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name">{t.profile.fullName}</Label>
                <Input
                  id="name"
                  value={user.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder={t.profile.fullNamePlaceholder}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t.profile.email}</Label>
                <Input id="email" type="email" value={user.email} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="avatar">{t.profile.avatarUrl}</Label>
                <Input
                  id="avatar"
                  value={user.avatar || ""}
                  onChange={(e) => handleInputChange("avatar", e.target.value)}
                  placeholder={t.profile.avatarUrlPlaceholder}
                />
              </div>
              <div className="space-y-2">
                <Label>{t.profile.membershipExpires}</Label>
                <div className="flex items-center space-x-2">
                  <span className="text-sm">
                    {user.membership_expires_at
                      ? new Date(user.membership_expires_at).toLocaleDateString(
                          language === "zh" ? "zh-CN" : "en-US",
                          { year: "numeric", month: "long", day: "numeric" }
                        )
                      : t.profile.noMembership}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(buildUrl("/payment"))}
                  >
                    {user.membership_expires_at
                      ? t.profile.renew
                      : t.profile.activateMembership}
                  </Button>
                </div>
              </div>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert>
                <AlertDescription className="text-green-600">
                  {success}
                </AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {t.profile.saving}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {t.profile.saveChanges}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
