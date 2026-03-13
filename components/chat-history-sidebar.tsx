"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  Plus,
  MessageSquare,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Star,
} from "lucide-react";
import { getClientAuthToken } from "@/lib/client-auth";
import { toast } from "sonner";
import {
  setPendingFavoriteScroll,
  useMessageFavorites,
} from "@/hooks/use-message-favorites";
import { useLanguage } from "@/components/language-provider";
import { interpolate, useTranslations } from "@/lib/i18n";

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatHistorySidebarProps {
  currentSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
  onNewChat: () => void;
  isWorkspaceProcessing?: boolean;
}

type SessionGroupKey = "today" | "yesterday" | "last7Days" | "last30Days" | "earlier";
type SessionGroups = Record<SessionGroupKey, ChatSession[]>;

const FAVORITES_INITIAL_VISIBLE = 8;
const SESSION_GROUP_ORDER: SessionGroupKey[] = [
  "today",
  "yesterday",
  "last7Days",
  "last30Days",
  "earlier",
];
const DEFAULT_EXPANDED_GROUPS: Record<SessionGroupKey, boolean> = {
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

export function ChatHistorySidebar({
  currentSessionId,
  onSessionSelect,
  onNewChat,
  isWorkspaceProcessing = false,
}: ChatHistorySidebarProps) {
  const { language } = useLanguage();
  const t = useTranslations(language);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showAllFavorites, setShowAllFavorites] = useState(false);
  const [favoritesExpanded, setFavoritesExpanded] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(DEFAULT_EXPANDED_GROUPS);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia("(max-width: 767px)").matches;
  });
  const [deleteTargetSessionId, setDeleteTargetSessionId] = useState<string | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const favorites = useMessageFavorites();
  const blockedMessage = t.history.sidebar.blockedMessage;

  const groupedSessions = useMemo(() => groupSessionsByTime(sessions), [sessions]);
  const visibleFavorites = useMemo(
    () =>
      showAllFavorites
        ? favorites.items
        : favorites.items.slice(0, FAVORITES_INITIAL_VISIBLE),
    [favorites.items, showAllFavorites]
  );

  const loadSessions = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

      const { token, error: authError } = await getClientAuthToken();
      if (authError || !token) {
        // 未登录/令牌过期属于预期状态，不应作为错误上报到控制台
        setSessions([]);
        return;
      }

      const res = await fetch("/api/chat/sessions", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to load sessions");
      }

      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (error) {
      console.error("加载对话历史失败:", error);
      toast.error(t.history.loadFailed);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [t.history.loadFailed]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!currentSessionId) {
      return;
    }

    const sessionExists = sessions.some((session) => session.id === currentSessionId);
    if (!sessionExists) {
      void loadSessions(false);
    }
  }, [currentSessionId, sessions, loadSessions]);

  useEffect(() => {
    if (favorites.items.length <= FAVORITES_INITIAL_VISIBLE && showAllFavorites) {
      setShowAllFavorites(false);
    }
  }, [favorites.items.length, showAllFavorites]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const handleViewportChange = () => {
      setIsMobileViewport(mediaQuery.matches);
    };

    setIsMobileViewport(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleViewportChange);
      return () => {
        mediaQuery.removeEventListener("change", handleViewportChange);
      };
    }

    if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(handleViewportChange);
    }

    return () => {
      if (typeof mediaQuery.addListener === "function") {
        mediaQuery.removeListener(handleViewportChange);
      }
    };
  }, []);

  const toggleGroup = useCallback((group: SessionGroupKey) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  }, []);

  const requestDelete = useCallback((sessionId: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setDeleteTargetSessionId(sessionId);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTargetSessionId) return;

    try {
      setIsDeleting(true);
      const { token, error: authError } = await getClientAuthToken();
      if (authError || !token) {
        toast.error(t.errors.loginRequired);
        return;
      }

      const res = await fetch(`/api/chat/sessions/${deleteTargetSessionId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const message =
          payload?.error ||
          (res.status === 404
            ? t.history.sidebar.notFoundOrNoAccess
            : res.status === 401
              ? t.history.sidebar.sessionExpired
              : t.history.deleteFailed);
        throw new Error(message);
      }

      toast.success(t.success.deleted);
      setDeleteTargetSessionId(null);
      await loadSessions();
    } catch (error) {
      console.error("删除失败:", error);
      toast.error(error instanceof Error ? error.message : t.history.deleteFailed);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTargetSessionId, loadSessions, t.errors.loginRequired, t.history.deleteFailed, t.history.sidebar.notFoundOrNoAccess, t.history.sidebar.sessionExpired, t.success.deleted]);

  const safeSessionSelect = useCallback(
    (sessionId: string) => {
      onSessionSelect(sessionId);
    },
    [onSessionSelect]
  );

  const safeNewChat = useCallback(() => {
    if (isWorkspaceProcessing) {
      toast.info(blockedMessage);
      return;
    }
    onNewChat();
  }, [blockedMessage, isWorkspaceProcessing, onNewChat]);

  const groupLabels: Record<SessionGroupKey, string> = {
    today: t.history.sidebar.groups.today,
    yesterday: t.history.sidebar.groups.yesterday,
    last7Days: t.history.sidebar.groups.last7Days,
    last30Days: t.history.sidebar.groups.last30Days,
    earlier: t.history.sidebar.groups.earlier,
  };

  return (
    <div
      className={`flex flex-col h-full border-r bg-white transition-all duration-300 ${
        isCollapsed ? "w-12" : "w-64"
      }`}
    >
      <div className="p-3 flex items-center justify-end">
        <Button
          onClick={() => setIsCollapsed((value) => !value)}
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          title={
            isCollapsed
              ? t.history.sidebar.expandSidebar
              : t.history.sidebar.collapseSidebar
          }
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className={isCollapsed ? "px-2 pb-3" : "px-3 pb-3"}>
        {isCollapsed ? (
          <Button
            onClick={safeNewChat}
            variant="default"
            size="sm"
            className="w-8 h-8 p-0"
            title={t.sidebar.newConversation}
          >
            <Plus className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={safeNewChat}
            className="w-full justify-start gap-2"
            variant="default"
            size="sm"
          >
            <Plus className="h-4 w-4" />
            {t.sidebar.newConversation}
          </Button>
        )}
      </div>

      {!isCollapsed && (
        <ScrollArea className="flex-1 px-2">
          {loading ? (
            <div className="text-center py-8 text-sm text-gray-500">
              {t.common.loading}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              {t.sidebar.noConversations}
            </div>
          ) : (
            <div className="space-y-2 pb-4 pr-2">
              <div>
                <button
                  onClick={() => setFavoritesExpanded((value) => !value)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <span className="min-w-0 truncate text-left">
                    {t.history.sidebar.favorites}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-400 tabular-nums">
                      {favorites.items.length}
                    </span>
                    {favoritesExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    )}
                  </div>
                </button>

                {favoritesExpanded &&
                  (favorites.items.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-400">
                      {t.history.sidebar.noFavorites}
                    </div>
                  ) : (
                    <div className="space-y-1 mb-2">
                      {visibleFavorites.map((fav) => {
                        const sessionTitle =
                          sessions.find((session) => session.id === fav.sessionId)?.title ||
                          t.sidebar.newConversation;

                        return (
                          <div
                            key={fav.id}
                            className="group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-all duration-150 hover:bg-blue-50 overflow-hidden"
                            onClick={() => {
                              if (!fav.sessionId) return;
                              setPendingFavoriteScroll(
                                fav.sessionId,
                                fav.anchorId,
                                fav.preview
                              );
                              safeSessionSelect(fav.sessionId);
                            }}
                            title={fav.preview}
                          >
                            <Star className="h-4 w-4 flex-shrink-0 text-blue-600" />
                            <div className="min-w-0 w-0 flex-1">
                              <div className="text-sm truncate text-gray-800">
                                {fav.preview || t.history.sidebar.emptyPreview}
                              </div>
                              <div className="text-[11px] truncate text-gray-500">
                                {sessionTitle}
                              </div>
                            </div>
                            <button
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-100 rounded flex-shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                favorites.remove(fav.id);
                              }}
                              title={t.history.sidebar.removeFavorite}
                            >
                              <Trash2 className="h-3 w-3 text-gray-500" />
                            </button>
                          </div>
                        );
                      })}
                      {favorites.items.length > FAVORITES_INITIAL_VISIBLE && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full h-7 text-xs text-gray-600 hover:text-gray-900"
                          onClick={() => setShowAllFavorites((value) => !value)}
                        >
                          {showAllFavorites
                            ? t.history.sidebar.collapseFavorites
                            : interpolate(t.history.sidebar.showMoreFavorites, {
                                count: favorites.items.length - FAVORITES_INITIAL_VISIBLE,
                              })}
                        </Button>
                      )}
                    </div>
                  ))}
              </div>

              {isMobileViewport ? (
                <div className="space-y-1 mt-1">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className={`group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-all duration-150 ${
                        currentSessionId === session.id
                          ? "bg-gray-100 border-l-3 border-gray-400"
                          : "hover:bg-gray-50 border-l-3 border-transparent"
                      }`}
                      onClick={() => safeSessionSelect(session.id)}
                    >
                      <MessageSquare
                        className={`h-4 w-4 flex-shrink-0 ${
                          currentSessionId === session.id
                            ? "text-gray-600"
                            : "text-gray-400"
                        }`}
                      />
                      <span
                        className={`flex-1 text-sm truncate min-w-0 ${
                          currentSessionId === session.id
                            ? "font-medium text-gray-900"
                            : "text-gray-700"
                        }`}
                      >
                        {session.title || t.sidebar.newConversation}
                      </span>
                      <button
                        className={`p-1 hover:bg-gray-200 rounded flex-shrink-0 transition-opacity ${
                          currentSessionId === session.id
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100"
                        }`}
                        onClick={(e) => requestDelete(session.id, e)}
                        title={t.history.deleteSession}
                      >
                        <Trash2 className="h-3 w-3 text-gray-500" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                SESSION_GROUP_ORDER.map((group) => {
                  const groupSessions = groupedSessions[group];
                  if (groupSessions.length === 0) return null;

                  const isExpanded = expandedGroups[group];

                  return (
                    <div key={group}>
                      <button
                        onClick={() => toggleGroup(group)}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        <span>{groupLabels[group]}</span>
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
                              className={`group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-all duration-150 ${
                                currentSessionId === session.id
                                  ? "bg-gray-100 border-l-3 border-gray-400"
                                  : "hover:bg-gray-50 border-l-3 border-transparent"
                              }`}
                              onClick={() => safeSessionSelect(session.id)}
                            >
                              <MessageSquare
                                className={`h-4 w-4 flex-shrink-0 ${
                                  currentSessionId === session.id
                                    ? "text-gray-600"
                                    : "text-gray-400"
                                }`}
                              />
                              <span
                                className={`flex-1 text-sm truncate min-w-0 ${
                                  currentSessionId === session.id
                                    ? "font-medium text-gray-900"
                                    : "text-gray-700"
                                }`}
                              >
                                {session.title || t.sidebar.newConversation}
                              </span>
                              <button
                                className={`p-1 hover:bg-gray-200 rounded flex-shrink-0 transition-opacity ${
                                  currentSessionId === session.id
                                    ? "opacity-100"
                                    : "opacity-0 group-hover:opacity-100"
                                }`}
                                onClick={(e) => requestDelete(session.id, e)}
                                title={t.history.deleteSession}
                              >
                                <Trash2 className="h-3 w-3 text-gray-500" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </ScrollArea>
      )}

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
            <AlertDialogTitle>{t.history.deleteSession}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.history.deleteSessionConfirm}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t.common.cancel}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting}>
              {isDeleting
                ? t.history.sidebar.deleteInProgress
                : t.history.sidebar.confirmDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
