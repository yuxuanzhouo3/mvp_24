"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  User,
  Settings,
  CreditCard,
  LogOut,
  LogIn,
  UserPlus,
  Crown,
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useUser } from "./user-context";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";

export function UserMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, refreshUser, signOut } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const { language } = useLanguage();
  const t = useTranslations(language);

  // 获取当前URL的debug参数
  const currentDebugParam =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("debug")
      : null;

  // 辅助函数：构建包含debug参数的URL
  const buildUrl = (path: string) => {
    if (currentDebugParam) {
      return `${path}?debug=${currentDebugParam}`;
    }
    return path;
  };

  // 获取用户名首字母
  const userInitial = (() => {
    if (user?.full_name) {
      const trimmed = user.full_name.trim();
      if (trimmed) {
        return trimmed.charAt(0).toUpperCase();
      }
    }

    if (user?.email) {
      const trimmed = user.email.trim();
      if (trimmed) {
        return trimmed.charAt(0).toUpperCase();
      }
    }

    return "U";
  })();

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await signOut();
      router.replace(buildUrl("/auth"));
    } catch (error) {
      console.error(`${t.user.logoutFailed}:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = () => {
    router.push(buildUrl("/auth"));
  };

  const handleSignUp = () => {
    router.push(buildUrl("/auth?mode=signup"));
  };

  const getPlanBadge = (plan: string) => {
    const planColors = {
      free: "bg-gray-100 text-gray-800",
      pro: "bg-blue-100 text-blue-800",
      enterprise: "bg-purple-100 text-purple-800",
    };

    const planIcons = {
      free: null,
      pro: <Crown className="w-3 h-3" />,
      enterprise: <Crown className="w-3 h-3" />,
    };

    return (
      <Badge
        variant="secondary"
        className={`text-xs ${
          planColors[plan as keyof typeof planColors] || planColors.free
        }`}
      >
        {planIcons[plan as keyof typeof planIcons]}
        <span className="ml-1">
          {(t.payment?.plans as any)?.[plan]?.name || plan}
        </span>
      </Badge>
    );
  };

  // 如果正在加载且没有用户，显示加载状态
  if (loading && !user) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <User className="w-4 h-4" />
      </Button>
    );
  }

  // 如果没有用户（未登录状态），显示登录菜单
  if (!user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center space-x-2"
          >
            <User className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onSelect={handleSignIn}
            className="flex items-center space-x-2"
          >
            <LogIn className="w-4 h-4" />
            <span>{t.user.login}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={handleSignUp}
            className="flex items-center space-x-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>{t.user.register}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // 已登录状态
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center space-x-2"
        >
          <Avatar className="w-6 h-6">
            <AvatarImage src={user.avatar_url} alt={user.full_name} />
            <AvatarFallback className="text-xs">{userInitial}</AvatarFallback>
          </Avatar>
          <span className="hidden md:inline text-sm">{user.full_name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center space-x-3 p-3">
          <Avatar className="w-10 h-10">
            <AvatarImage src={user.avatar_url} alt={user.full_name} />
            <AvatarFallback>{userInitial}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{user.full_name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
            {user.membership_expires_at ? (
              <p className="text-xs text-gray-600">
                {t.user.expiresAt}:{" "}
                {new Date(user.membership_expires_at).toLocaleDateString(
                  language === "zh" ? "zh-CN" : "en-US",
                  { year: "numeric", month: "long", day: "numeric" }
                )}
              </p>
            ) : (
              <p className="text-xs text-gray-500">{t.user.noMembership}</p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => router.push(buildUrl("/profile"))}
          className="flex items-center space-x-2"
        >
          <User className="w-4 h-4" />
          <span>{t.user.profile}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => router.push(buildUrl("/settings"))}
          className="flex items-center space-x-2"
        >
          <Settings className="w-4 h-4" />
          <span>{t.user.settings}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => router.push(buildUrl("/payment"))}
          className="flex items-center space-x-2"
        >
          <CreditCard className="w-4 h-4" />
          <span>{t.user.billing}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={handleSignOut}
          className="flex items-center space-x-2 text-red-600 focus:text-red-600"
        >
          <LogOut className="w-4 h-4" />
          <span>{t.user.logout}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
