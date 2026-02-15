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
}

type SessionGroupName = "今天" | "昨天" | "最近7天" | "最近30天" | "更早";
type SessionGroups = Record<SessionGroupName, ChatSession[]>;

const FAVORITES_INITIAL_VISIBLE = 8;
const SESSION_GROUP_ORDER: SessionGroupName[] = [
  "今天",
  "昨天",
  "最近7天",
  "最近30天",
  "更早",
];
const DEFAULT_EXPANDED_GROUPS: Record<SessionGroupName, boolean> = {
  今天: true,
  昨天: true,
  最近7天: true,
  最近30天: false,
  更早: false,
};

function createEmptySessionGroups(): SessionGroups {
  return {
    今天: [],
    昨天: [],
    最近7天: [],
    最近30天: [],
    更早: [],
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
      groups["今天"].push(session);
    } else if (sessionDate >= yesterday) {
      groups["昨天"].push(session);
    } else if (sessionDate >= sevenDaysAgo) {
      groups["最近7天"].push(session);
    } else if (sessionDate >= thirtyDaysAgo) {
      groups["最近30天"].push(session);
    } else {
      groups["更早"].push(session);
    }
  }

  return groups;
}

export function ChatHistorySidebar({
  currentSessionId,
  onSessionSelect,
  onNewChat,
}: ChatHistorySidebarProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showAllFavorites, setShowAllFavorites] = useState(false);
  const [favoritesExpanded, setFavoritesExpanded] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(DEFAULT_EXPANDED_GROUPS);
  const [deleteTargetSessionId, setDeleteTargetSessionId] = useState<string | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const favorites = useMessageFavorites();

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
        console.error("未登录:", authError);
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
      toast.error("加载对话历史失败");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

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

  const toggleGroup = useCallback((group: SessionGroupName) => {
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
        toast.error("请先登录");
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
            ? "对话不存在或无权限"
            : res.status === 401
              ? "登录状态已过期，请重新登录"
              : "删除失败");
        throw new Error(message);
      }

      toast.success("删除成功");
      setDeleteTargetSessionId(null);
      await loadSessions();
    } catch (error) {
      console.error("删除失败:", error);
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTargetSessionId, loadSessions]);

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
          title={isCollapsed ? "展开侧边栏" : "折叠侧边栏"}
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
            onClick={onNewChat}
            variant="default"
            size="sm"
            className="w-8 h-8 p-0"
            title="新对话"
          >
            <Plus className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={onNewChat}
            className="w-full justify-start gap-2"
            variant="default"
            size="sm"
          >
            <Plus className="h-4 w-4" />
            新对话
          </Button>
        )}
      </div>

      {!isCollapsed && (
        <ScrollArea className="flex-1 px-2">
          {loading ? (
            <div className="text-center py-8 text-sm text-gray-500">加载中...</div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              暂无对话历史
            </div>
          ) : (
            <div className="space-y-2 pb-4 pr-2">
              <div>
                <button
                  onClick={() => setFavoritesExpanded((value) => !value)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <span className="min-w-0 truncate text-left">收藏对话</span>
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
                    <div className="px-3 py-2 text-xs text-gray-400">暂无收藏</div>
                  ) : (
                    <div className="space-y-1 mb-2">
                      {visibleFavorites.map((fav) => {
                        const sessionTitle =
                          sessions.find((session) => session.id === fav.sessionId)?.title ||
                          "新对话";

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
                              onSessionSelect(fav.sessionId);
                            }}
                            title={fav.preview}
                          >
                            <Star className="h-4 w-4 flex-shrink-0 text-blue-600" />
                            <div className="min-w-0 w-0 flex-1">
                              <div className="text-sm truncate text-gray-800">
                                {fav.preview || "(空)"}
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
                              title="取消收藏"
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
                            ? "收起收藏"
                            : `显示更多（+${
                                favorites.items.length - FAVORITES_INITIAL_VISIBLE
                              }）`}
                        </Button>
                      )}
                    </div>
                  ))}
              </div>

              {SESSION_GROUP_ORDER.map((group) => {
                const groupSessions = groupedSessions[group];
                if (groupSessions.length === 0) return null;

                const isExpanded = expandedGroups[group];

                return (
                  <div key={group}>
                    <button
                      onClick={() => toggleGroup(group)}
                      className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      <span>{group}</span>
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
                            onClick={() => onSessionSelect(session.id)}
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
                              {session.title || "新对话"}
                            </span>
                            <button
                              className={`p-1 hover:bg-gray-200 rounded flex-shrink-0 transition-opacity ${
                                currentSessionId === session.id
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-100"
                              }`}
                              onClick={(e) => requestDelete(session.id, e)}
                              title="删除对话"
                            >
                              <Trash2 className="h-3 w-3 text-gray-500" />
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
            <AlertDialogTitle>删除对话</AlertDialogTitle>
            <AlertDialogDescription>
              删除后无法恢复，是否确认删除这个对话？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting}>
              {isDeleting ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
