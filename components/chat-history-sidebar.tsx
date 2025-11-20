"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare, Trash2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { getClientAuthToken } from "@/lib/client-auth";
import { toast } from "sonner";

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

export function ChatHistorySidebar({
  currentSessionId,
  onSessionSelect,
  onNewChat,
}: ChatHistorySidebarProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    今天: true,
    昨天: true,
    最近7天: true,
    最近30天: false,
    更早: false,
  });

  // 加载会话列表
  const loadSessions = async (showLoading = true) => {
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
  };

  useEffect(() => {
    loadSessions();
  }, []);

  // 当 currentSessionId 变化时,检查是否是新会话
  useEffect(() => {
    if (currentSessionId) {
      // 只有当这个 sessionId 不在现有列表中时,才刷新(说明是新创建的会话)
      const sessionExists = sessions.some(s => s.id === currentSessionId);
      if (!sessionExists) {
        loadSessions(false); // 静默刷新,不显示加载中
      }
    }
  }, [currentSessionId]);

  // 按时间分组
  const groupSessionsByTime = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const groups: Record<string, ChatSession[]> = {
      今天: [],
      昨天: [],
      最近7天: [],
      最近30天: [],
      更早: [],
    };

    sessions.forEach((session) => {
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
    });

    return groups;
  };

  const groupedSessions = groupSessionsByTime();

  // 切换分组展开/折叠
  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  };

  // 删除对话
  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("确定要删除这个对话吗?")) return;

    try {
      const { token, error: authError } = await getClientAuthToken();
      if (authError || !token) {
        toast.error("请先登录");
        return;
      }

      const res = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error("删除失败");

      toast.success("删除成功");
      loadSessions();
    } catch (error) {
      console.error("删除失败:", error);
      toast.error("删除失败");
    }
  };

  return (
    <div
      className={`flex flex-col h-full border-r bg-white transition-all duration-300 ${
        isCollapsed ? "w-12" : "w-64"
      }`}
    >
      {/* 头部 - 折叠按钮 */}
      <div className="p-3 flex items-center justify-end">
        <Button
          onClick={() => setIsCollapsed(!isCollapsed)}
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

      {/* 新对话按钮 */}
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

      {/* 对话列表 */}
      {!isCollapsed && (
        <ScrollArea className="flex-1 px-2">
          {loading ? (
            <div className="text-center py-8 text-sm text-gray-500">加载中...</div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              暂无对话历史
            </div>
          ) : (
            <div className="space-y-2 pb-4">
              {Object.entries(groupedSessions).map(([group, groupSessions]) => {
                if (groupSessions.length === 0) return null;

                const isExpanded = expandedGroups[group];

                return (
                  <div key={group}>
                    {/* 分组标题 - 可点击折叠/展开 */}
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

                    {/* 对话列表 */}
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
                            <MessageSquare className={`h-4 w-4 flex-shrink-0 ${
                              currentSessionId === session.id
                                ? "text-gray-600"
                                : "text-gray-400"
                            }`} />
                            <span className={`flex-1 text-sm truncate min-w-0 ${
                              currentSessionId === session.id
                                ? "font-medium text-gray-900"
                                : "text-gray-700"
                            }`}>
                              {session.title || "新对话"}
                            </span>
                            <button
                              className={`p-1 hover:bg-gray-200 rounded flex-shrink-0 transition-opacity ${
                                currentSessionId === session.id
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-100"
                              }`}
                              onClick={(e) => handleDelete(session.id, e)}
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
    </div>
  );
}
