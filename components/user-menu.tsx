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
  Trash2,
  RefreshCw,
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useUser } from "./user-context";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import { QuotaDisplay } from "./quota-display";
import {
  getSavedAccounts,
  saveAuthState,
  removeSavedAccount,
} from "@/lib/auth-state-manager";

export function UserMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, refreshUser, signOut } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { language } = useLanguage();
  const t = useTranslations(language);
  const [savedAccounts, setSavedAccounts] = useState<any[]>([]);

  // 监听认证状态变化，同步更新已保存账号列表
  useEffect(() => {
    setSavedAccounts(getSavedAccounts());

    const handleAuthChange = () => {
      setSavedAccounts(getSavedAccounts());
    };

    window.addEventListener("auth-state-changed", handleAuthChange);
    return () => window.removeEventListener("auth-state-changed", handleAuthChange);
  }, []);

  // 当菜单打开时刷新用户数据
  const handleMenuOpenChange = async (open: boolean) => {
    setIsMenuOpen(open);
    if (open && user) {
      try {
        await refreshUser();
      } catch (error) {
        console.error("Failed to refresh user data:", error);
      }
    }
  };

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

  // 辅助函数：获取用户显示名称
  const getDisplayName = (userObj: any) => {
    if (userObj?.name && userObj.name.trim()) {
      return userObj.name.trim();
    }

    if (userObj?.email) {
      // 检查是否为微信用户（以@local.wechat结尾）
      if (userObj.email.endsWith("@local.wechat")) {
        return "微信用户";
      }
      // 从邮箱中提取用户名部分（@前面的部分）
      const emailParts = userObj.email.split("@");
      if (emailParts[0]) {
        return emailParts[0];
      }
    }

    return "User";
  };

  // 获取显示名称：优先使用 name，如果为空则使用 email 的用户名部分
  const displayName = getDisplayName(user);

  // 获取用户名首字母
  const userInitial = (() => {
    const name = displayName;
    if (name) {
      return name.charAt(0).toUpperCase();
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
        <DropdownMenuContent align="end" className="w-64">
          {savedAccounts.length > 0 && (
            <>
              <DropdownMenuLabel className="text-xs text-gray-500 font-normal px-3 py-2">
                {language === "zh" ? "快速登录" : "Quick Login"}
              </DropdownMenuLabel>
              {savedAccounts.map((account) => (
                <div key={account.user.id} className="flex items-center group px-1">
                  <DropdownMenuItem
                    className="flex-1 flex items-center space-x-3 cursor-pointer rounded-md"
                    onSelect={() => {
                      saveAuthState(
                        account.accessToken,
                        account.refreshToken,
                        account.user,
                        account.tokenMeta
                      );
                      refreshUser();
                    }}
                  >
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={account.user.avatar} />
                      <AvatarFallback>
                        {account.user.name?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">
                        {getDisplayName(account.user)}
                      </span>
                      <span className="text-[10px] text-gray-500 truncate">
                        {account.user.email}
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity mr-1 text-gray-400 hover:text-red-500 hover:bg-red-50"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeSavedAccount(account.user.id);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
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
    <DropdownMenu open={isMenuOpen} onOpenChange={handleMenuOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center space-x-2"
        >
          <Avatar className="w-6 h-6">
            <AvatarImage src={user.avatar} alt={displayName} />
            <AvatarFallback className="text-xs">{userInitial}</AvatarFallback>
          </Avatar>
          <span className="hidden md:inline text-sm">{displayName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center space-x-3 p-3">
          <Avatar className="w-10 h-10">
            <AvatarImage src={user.avatar} alt={displayName} />
            <AvatarFallback>{userInitial}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{displayName}</p>
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
        <div className="px-3 py-2">
          <QuotaDisplay />
        </div>
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
        {/* 快速切换账号 */}
        {savedAccounts.filter(a => a.user.id !== user.id).length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-gray-500 font-normal px-3 py-1.5 flex items-center space-x-1">
              <RefreshCw className="w-3 h-3" />
              <span>{language === "zh" ? "切换账号" : "Switch Account"}</span>
            </DropdownMenuLabel>
            {savedAccounts
              .filter(a => a.user.id !== user.id)
              .map((account) => (
                <div key={account.user.id} className="flex items-center group px-1">
                  <DropdownMenuItem
                    className="flex-1 flex items-center space-x-2 cursor-pointer rounded-md py-1.5"
                    onSelect={() => {
                      saveAuthState(
                        account.accessToken,
                        account.refreshToken,
                        account.user,
                        account.tokenMeta
                      );
                      refreshUser();
                    }}
                  >
                    <Avatar className="w-6 h-6">
                      <AvatarImage src={account.user.avatar} />
                      <AvatarFallback className="text-[10px]">
                        {account.user.name?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium truncate">
                        {getDisplayName(account.user)}
                      </span>
                      <span className="text-[10px] text-gray-500 truncate">
                        {account.user.email}
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity mr-1 text-gray-400 hover:text-red-500 hover:bg-red-50"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeSavedAccount(account.user.id);
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            <DropdownMenuSeparator />
          </>
        )}
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
