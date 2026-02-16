"use client";

import { useState, useEffect, useMemo, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Globe, 
  Check,
  WorkflowIcon as Workspace, 
  Library, 
  Download, 
  FileText, 
  CreditCard, 
  Menu, 
  Plus, 
  MessageSquare, 
  Trash2, 
  Star,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useRouter } from "next/navigation";
import { UserMenu } from "./user-menu";
import { QuotaDisplay } from "./quota-display";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getClientAuthToken } from "@/lib/client-auth";
import { toast } from "sonner";
import {
  setPendingFavoriteScroll,
  useMessageFavorites,
} from "@/hooks/use-message-favorites";
import { detectPlatform } from "@/lib/platform-detection";

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

type SessionGroupKey =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "earlier";
type SessionGroups = Record<SessionGroupKey, ChatSession[]>;

const SESSION_GROUP_ORDER: SessionGroupKey[] = [
  "today",
  "yesterday",
  "last7Days",
  "last30Days",
  "earlier",
];

const DEFAULT_MOBILE_EXPANDED_GROUPS: Record<SessionGroupKey, boolean> = {
  today: true,
  yesterday: true,
  last7Days: true,
  last30Days: false,
  earlier: false,
};

function createEmptySessionGroups(): SessionGroups {
  return {
    today: [],
    yesterday: [],
    last7Days: [],
    last30Days: [],
    earlier: [],
  };
}

function groupSessionsByTime(sessions: ChatSession[]): SessionGroups {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const groups = createEmptySessionGroups();

  for (const session of sessions) {
    const sessionDate = new Date(session.created_at);
    if (sessionDate >= today) {
      groups.today.push(session);
    } else if (sessionDate >= yesterday) {
      groups.yesterday.push(session);
    } else if (sessionDate >= sevenDaysAgo) {
      groups.last7Days.push(session);
    } else if (sessionDate >= thirtyDaysAgo) {
      groups.last30Days.push(session);
    } else {
      groups.earlier.push(session);
    }
  }

  return groups;
}

function getSessionGroupLabel(group: SessionGroupKey, language: "zh" | "en") {
  if (language === "zh") {
    switch (group) {
      case "today":
        return "今天";
      case "yesterday":
        return "昨天";
      case "last7Days":
        return "最近7天";
      case "last30Days":
        return "最近30天";
      case "earlier":
      default:
        return "更早";
    }
  }

  switch (group) {
    case "today":
      return "Today";
    case "yesterday":
      return "Yesterday";
    case "last7Days":
      return "Last 7 Days";
    case "last30Days":
      return "Last 30 Days";
    case "earlier":
    default:
      return "Earlier";
  }
}

interface HeaderProps {
  activeView: string;
  setActiveView: (view: string) => void;
  currentSessionId?: string | null;
  onSessionSelect?: (sessionId: string) => void;
  onNewChat?: () => void;
  isWorkspaceProcessing?: boolean;
}

export function Header({
  activeView,
  setActiveView,
  currentSessionId,
  onSessionSelect,
  onNewChat,
  isWorkspaceProcessing = false,
}: HeaderProps) {
  const FAVORITES_INITIAL_VISIBLE = 8;
  const router = useRouter();
  const { language, setLanguage } = useLanguage();
  const t = useTranslations(language);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showAllFavoritesMobile, setShowAllFavoritesMobile] = useState(false);
  const [favoritesExpandedMobile, setFavoritesExpandedMobile] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTargetSessionId, setDeleteTargetSessionId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [mobileExpandedGroups, setMobileExpandedGroups] = useState(
    DEFAULT_MOBILE_EXPANDED_GROUPS
  );
  const favorites = useMessageFavorites();
  const blockedMessage =
    language === "zh"
      ? "当前对话生成中，请先停止再切换会话"
      : "A response is in progress. Stop it before switching chats.";
  const visibleFavoritesMobile = showAllFavoritesMobile
    ? favorites.items
    : favorites.items.slice(0, FAVORITES_INITIAL_VISIBLE);
  const groupedSessions = useMemo(() => groupSessionsByTime(sessions), [sessions]);

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

  // 加载会话列表
  const loadSessions = async () => {
    try {
      setLoading(true);
      const { token, error: authError } = await getClientAuthToken();
      if (authError || !token) {
        console.error("未登录:", authError);
        setLoading(false);
        return;
      }

      const response = await fetch("/api/chat/sessions", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error("加载会话失败:", error);
    } finally {
      setLoading(false);
    }
  };

  // 打开菜单时加载会话
  useEffect(() => {
    if (mobileMenuOpen) {
      loadSessions();
    }
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (
      favorites.items.length <= FAVORITES_INITIAL_VISIBLE &&
      showAllFavoritesMobile
    ) {
      setShowAllFavoritesMobile(false);
    }
  }, [favorites.items.length, showAllFavoritesMobile]);

  // 删除会话
  const requestDelete = (sessionId: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setDeleteTargetSessionId(sessionId);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTargetSessionId) return;
    try {
      setIsDeleting(true);
      const { token, error: authError } = await getClientAuthToken();
      if (authError || !token) {
        toast.error(language === "zh" ? "请先登录" : "Please sign in first");
        return;
      }

      const res = await fetch(`/api/chat/sessions/${deleteTargetSessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const message =
          payload?.error ||
          (res.status === 404
            ? language === "zh"
              ? "对话不存在或无权限"
              : "Chat not found or no permission"
            : res.status === 401
              ? language === "zh"
                ? "登录状态已过期，请重新登录"
                : "Session expired, please sign in again"
              : language === "zh"
                ? "删除失败"
                : "Delete failed");
        throw new Error(message);
      }

      toast.success(language === "zh" ? "删除成功" : "Deleted");
      setDeleteTargetSessionId(null);
      loadSessions();
    } catch (error) {
      console.error("删除失败:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : language === "zh"
            ? "删除失败"
            : "Delete failed"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // 处理会话选择
  const handleSessionClick = (sessionId: string) => {
    if (onSessionSelect) {
      onSessionSelect(sessionId);
    }
    setMobileMenuOpen(false);
  };

  // 处理新建对话
  const handleNewChatClick = () => {
    if (isWorkspaceProcessing) {
      toast.info(blockedMessage);
      return;
    }
    if (onNewChat) {
      onNewChat();
    }
    setMobileMenuOpen(false);
  };

  return (
    <header className="relative h-16 bg-white border-b border-gray-200 flex items-center justify-between px-2 sm:px-4 lg:px-6">
      <div className="relative z-10 flex items-center gap-2 sm:gap-4 shrink-0">
        {/* 移动端历史记录按钮 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMobileMenuOpen(true)}
          className="sm:hidden p-2"
          title="History"
        >
          <Menu className="w-5 h-5" />
        </Button>

        <div className="flex items-center gap-1 sm:gap-2">
          <div className="hidden sm:flex w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs sm:text-sm">AI</span>
          </div>
          {/* 标题和徽章 - 移动端隐藏 */}
          <h1 className="hidden sm:block text-base sm:text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent truncate">
            {t.header.title}
          </h1>
        </div>

        <Badge
          variant="secondary"
          className="bg-green-100 text-green-800 text-xs sm:text-sm whitespace-nowrap hidden sm:inline-block"
        >
          {t.header.online}
        </Badge>
      </div>

      <nav className="absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 sm:static sm:z-auto sm:translate-x-0 sm:translate-y-0">
        <Button
          variant={activeView === "workspace" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveView("workspace")}
          className="h-9 w-9 justify-center p-0 text-xs sm:h-8 sm:w-auto sm:p-2 sm:px-3 sm:text-sm"
          title={t.header.workspace}
        >
          <Workspace className="w-4 h-4 flex-shrink-0" />
          <span className="hidden md:inline">{t.header.workspace}</span>
        </Button>

        <Button
          variant={activeView === "library" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveView("library")}
          className="h-9 w-9 justify-center p-0 text-xs sm:h-8 sm:w-auto sm:p-2 sm:px-3 sm:text-sm"
          title={t.header.library}
        >
          <Library className="w-4 h-4 flex-shrink-0" />
          <span className="hidden md:inline">{t.header.library}</span>
        </Button>

        <Button
          variant={activeView === "export" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveView("export")}
          className="h-9 w-9 justify-center p-0 text-xs sm:h-8 sm:w-auto sm:p-2 sm:px-3 sm:text-sm"
          title={t.header.export}
        >
          <FileText className="w-4 h-4 flex-shrink-0" />
          <span className="hidden lg:inline">{t.header.export}</span>
        </Button>

        {detectPlatform().type !== 'ios-app' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(buildUrl("/payment"))}
            className="h-9 w-9 justify-center p-0 text-xs sm:h-8 sm:w-auto sm:p-2 sm:px-3 sm:text-sm"
            title={t.header.payment}
          >
            <CreditCard className="w-4 h-4 flex-shrink-0" />
            <span className="hidden lg:inline">{t.header.payment}</span>
          </Button>
        )}
      </nav>

      <div className="relative z-10 flex items-center gap-1 sm:gap-3 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              title={language === "zh" ? "切换语言" : "Switch language"}
              aria-label={language === "zh" ? "切换语言" : "Switch language"}
            >
              <Globe className="w-4 h-4 flex-shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem
              onClick={() => setLanguage("zh")}
              className="flex items-center justify-between"
            >
              <span>中文</span>
              {language === "zh" && <Check className="h-4 w-4 text-blue-600" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setLanguage("en")}
              className="flex items-center justify-between"
            >
              <span>English</span>
              {language === "en" && <Check className="h-4 w-4 text-blue-600" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {detectPlatform().type !== 'ios-app' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(buildUrl("/download"))}
            title="Download"
          >
            <Download className="w-4 h-4" />
          </Button>
        )}
        <UserMenu />
      </div>

      {/* 移动端聊天历史 */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          <SheetHeader className="p-4 border-b">
            <SheetTitle>
              {language === "zh" ? "对话历史" : "Chat History"}
            </SheetTitle>
          </SheetHeader>

          {/* 新建对话按钮 */}
          <div className="p-3 border-b">
            <Button
              onClick={handleNewChatClick}
              className="w-full justify-start gap-2"
              variant="default"
              size="sm"
            >
              <Plus className="h-4 w-4" />
              {language === "zh" ? "新对话" : "New Chat"}
            </Button>
          </div>

          {/* 对话列表 */}
          <ScrollArea className="flex-1 px-2">
            {loading ? (
              <div className="text-center py-8 text-sm text-gray-500">
                {language === "zh" ? "加载中..." : "Loading..."}
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">
                {language === "zh" ? "暂无对话历史" : "No chat history"}
              </div>
            ) : (
              <div className="space-y-1 py-2 pr-2">
                {/* 收藏对话（单条消息收藏） */}
                <div className="pb-1">
                  <button
                    onClick={() => setFavoritesExpandedMobile((v) => !v)}
                    className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <span className="min-w-0 truncate text-left">
                      {language === "zh" ? "收藏对话" : "Favorites"}
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400 tabular-nums">
                        {favorites.items.length}
                      </span>
                      {favoritesExpandedMobile ? (
                        <ChevronUp className="h-4 w-4 text-gray-500 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
                      )}
                    </div>
                  </button>

                  {favoritesExpandedMobile &&
                    (favorites.items.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-400">
                        {language === "zh" ? "暂无收藏" : "No favorites"}
                      </div>
                    ) : (
                      <div className="space-y-1 mb-2">
                        {visibleFavoritesMobile.map((fav) => {
                          const sessionTitle =
                            sessions.find((s) => s.id === fav.sessionId)?.title ||
                            (language === "zh" ? "新对话" : "New Chat");
                          return (
                            <div
                              key={fav.id}
                              className={`group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-gray-100 transition-colors ${
                                currentSessionId === fav.sessionId ? "bg-blue-50" : ""
                              }`}
                              onClick={() => {
                                if (!fav.sessionId) return;
                                setPendingFavoriteScroll(
                                  fav.sessionId,
                                  fav.anchorId,
                                  fav.preview
                                );
                                handleSessionClick(fav.sessionId);
                              }}
                              title={`${sessionTitle} · ${fav.preview || "(empty)"}`}
                            >
                              <Star className="h-4 w-4 flex-shrink-0 text-gray-400" />
                              <span
                                className={`flex-1 text-sm truncate ${
                                  currentSessionId === fav.sessionId
                                    ? "font-medium text-gray-900"
                                    : ""
                                }`}
                              >
                                {fav.preview || "(空)"}
                              </span>
                              <button
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded flex-shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  favorites.remove(fav.id);
                                }}
                                title={
                                  language === "zh"
                                    ? "取消收藏"
                                    : "Remove favorite"
                                }
                              >
                                <Trash2 className="h-3 w-3 text-gray-400" />
                              </button>
                            </div>
                          );
                        })}
                        {favorites.items.length > FAVORITES_INITIAL_VISIBLE && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full h-7 text-xs text-gray-600 hover:text-gray-900"
                            onClick={() => setShowAllFavoritesMobile((v) => !v)}
                          >
                            {showAllFavoritesMobile
                              ? language === "zh"
                                ? "收起收藏"
                                : "Collapse"
                              : language === "zh"
                                ? `显示更多（+${favorites.items.length - FAVORITES_INITIAL_VISIBLE}）`
                                : `Show more (+${favorites.items.length - FAVORITES_INITIAL_VISIBLE})`}
                          </Button>
                        )}
                      </div>
                    ))}
                </div>

                {SESSION_GROUP_ORDER.map((group) => {
                  const groupSessions = groupedSessions[group];
                  if (groupSessions.length === 0) return null;
                  const isExpanded = mobileExpandedGroups[group];

                  return (
                    <div key={group}>
                      <button
                        onClick={() =>
                          setMobileExpandedGroups((prev) => ({
                            ...prev,
                            [group]: !prev[group],
                          }))
                        }
                        className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        <span>{getSessionGroupLabel(group, language)}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">
                            {groupSessions.length}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-gray-500 flex-shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="space-y-1 mt-1">
                          {groupSessions.map((session) => (
                            <div
                              key={session.id}
                              className={`group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-gray-100 transition-colors ${
                                currentSessionId === session.id ? "bg-blue-50" : ""
                              }`}
                              onClick={() => handleSessionClick(session.id)}
                            >
                              <MessageSquare className="h-4 w-4 flex-shrink-0 text-gray-400" />
                              <span className="flex-1 text-sm truncate">
                                {session.title ||
                                  (language === "zh" ? "新对话" : "New Chat")}
                              </span>
                              <button
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded flex-shrink-0"
                                onClick={(e) => requestDelete(session.id, e)}
                                title={language === "zh" ? "删除对话" : "Delete"}
                              >
                                <Trash2 className="h-3 w-3 text-gray-400" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(deleteTargetSessionId)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeleteTargetSessionId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "zh" ? "删除对话" : "Delete chat"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "zh"
                ? "删除后无法恢复，是否确认删除这个对话？"
                : "This action cannot be undone. Delete this chat?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {language === "zh" ? "取消" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting}>
              {isDeleting
                ? language === "zh"
                  ? "删除中..."
                  : "Deleting..."
                : language === "zh"
                  ? "确认删除"
                  : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
