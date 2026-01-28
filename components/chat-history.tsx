"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  History,
  MessageSquare,
  Calendar,
  Trash2,
  Edit3,
  Search,
  Bot,
  User,
  Clock,
  ArrowLeft,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import { getAuthClient } from "@/lib/auth/client";

interface ChatSession {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
  last_message?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  tokens?: number;
  cost?: number;
}

export function ChatHistory() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(
    null
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingSession, setEditingSession] = useState<ChatSession | null>(
    null
  );
  const [editTitle, setEditTitle] = useState("");
  const { language } = useLanguage();
  const t = useTranslations(language);

  // 加载会话列表
  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      console.log("[ChatHistory] 开始加载会话列表");

      // 获取认证 token - 根据区域使用正确的认证客户端
      const authClient = getAuthClient();
      console.log("[ChatHistory] 获取认证客户端:", authClient.constructor.name);

      const { data: sessionData, error: sessionError } =
        await authClient.getSession();
      console.log("[ChatHistory] 会话数据:", {
        hasSession: !!sessionData.session,
        error: sessionError,
      });

      if (sessionError || !sessionData.session) {
        console.error("获取会话失败:", sessionError);
        toast.error("请先登录");
        setSessions([]);
        return;
      }

      const accessToken = sessionData.session.access_token;
      console.log("[ChatHistory] 访问令牌存在:", !!accessToken);

      if (!accessToken) {
        console.error("没有访问令牌");
        toast.error("请先登录");
        setSessions([]);
        return;
      }

      console.log("[ChatHistory] 发送 API 请求到 /api/chat/sessions");

      // 调用真实 API
      const response = await fetch("/api/chat/sessions", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      console.log("[ChatHistory] API 响应状态:", response.status);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("[ChatHistory] API 返回数据:", {
        sessionsCount: data.sessions?.length || 0,
        firstSession: data.sessions?.[0]
          ? {
              id: data.sessions[0].id,
              _id: data.sessions[0]._id,
              title: data.sessions[0].title,
              hasId: !!data.sessions[0].id,
              hasUnderscoreId: !!data.sessions[0]._id,
            }
          : null,
      });

      // 使用 API 返回的 message_count（从 messages 数组长度计算）
      const processedSessions = (data.sessions || []).map((s: any) => ({
        ...s,
        message_count: s.message_count || 0,
      }));

      console.log("[ChatHistory] 处理后的会话数量:", processedSessions.length);
      console.log("[ChatHistory] 第一个会话的ID:", processedSessions[0]?.id);
      setSessions(processedSessions);
    } catch (error) {
      console.error("Failed to load sessions:", error);
      toast.error(t.history.loadFailed);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSessionMessages = async (sessionId: string) => {
    console.log(
      "[ChatHistory] loadSessionMessages 被调用，sessionId:",
      sessionId,
      "类型:",
      typeof sessionId
    );

    try {
      setLoadingMessages(true);

      // 获取认证 token - 根据区域使用正确的认证客户端
      const authClient = getAuthClient();
      const { data: sessionData, error: sessionError } =
        await authClient.getSession();

      if (sessionError || !sessionData.session) {
        console.error("获取会话失败:", sessionError);
        toast.error("请先登录");
        return;
      }

      const accessToken = sessionData.session.access_token;
      if (!accessToken) {
        console.error("没有访问令牌");
        toast.error("请先登录");
        return;
      }

      // 调用真实 API 获取消息
      const response = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // 处理消息数据，确保包含所需字段
      const processedMessages = (data.messages || []).map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        created_at: msg.created_at,
        tokens: msg.tokens_used || 0,
        cost: msg.cost_usd || 0,
      }));

      setMessages(processedMessages);
    } catch (error) {
      console.error("Failed to load messages:", error);
      toast.error(t.history.loadMessagesFailed);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      // 获取认证 token - 根据区域使用正确的认证客户端
      const authClient = getAuthClient();
      const { data: sessionData, error: sessionError } =
        await authClient.getSession();

      if (sessionError || !sessionData.session) {
        console.error("获取会话失败:", sessionError);
        toast.error("请先登录");
        return;
      }

      const accessToken = sessionData.session.access_token;
      if (!accessToken) {
        console.error("没有访问令牌");
        toast.error("请先登录");
        return;
      }

      // 调用 API 删除会话
      const response = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setSessions(sessions.filter((s) => s.id !== sessionId));
      if (selectedSession?.id === sessionId) {
        setSelectedSession(null);
        setMessages([]);
      }
      toast.success(t.history.sessionDeleted);
    } catch (error) {
      console.error("Failed to delete session:", error);
      toast.error(t.history.deleteFailed);
    }
  };

  const updateSessionTitle = async (sessionId: string, newTitle: string) => {
    try {
      // 获取认证 token - 根据区域使用正确的认证客户端
      const authClient = getAuthClient();
      const { data: sessionData, error: sessionError } =
        await authClient.getSession();

      if (sessionError || !sessionData.session) {
        console.error("获取会话失败:", sessionError);
        toast.error("请先登录");
        return;
      }

      const accessToken = sessionData.session.access_token;
      if (!accessToken) {
        console.error("没有访问令牌");
        toast.error("请先登录");
        return;
      }

      // 调用 API 更新标题
      const response = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ title: newTitle }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setSessions(
        sessions.map((s) =>
          s.id === sessionId ? { ...s, title: newTitle } : s
        )
      );
      if (selectedSession?.id === sessionId) {
        setSelectedSession({ ...selectedSession, title: newTitle });
      }
      toast.success(t.history.titleUpdated);
    } catch (error) {
      console.error("Failed to update session title:", error);
      toast.error(t.history.updateFailed);
    }
  };

  const clearSessionMessages = async (sessionId: string) => {
    try {
      // 获取认证 token - 根据区域使用正确的认证客户端
      const authClient = getAuthClient();
      const { data: sessionData, error: sessionError } =
        await authClient.getSession();

      if (sessionError || !sessionData.session) {
        console.error("获取会话失败:", sessionError);
        toast.error("请先登录");
        return;
      }

      const accessToken = sessionData.session.access_token;
      if (!accessToken) {
        console.error("没有访问令牌");
        toast.error("请先登录");
        return;
      }

      // 调用 API 清空消息
      const response = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setMessages([]);
      toast.success(t.history.messagesCleared);
    } catch (error) {
      console.error("Failed to clear messages:", error);
      toast.error(t.history.clearFailed);
    }
  };

  const filteredSessions = sessions.filter((session) =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(language === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t.common.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* 会话列表 */}
      <div className="w-80 bg-white border-r border-gray-200 p-4 overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center space-x-2">
              <History className="w-5 h-5" />
              <span>{t.history.title}</span>
            </h2>
            <Badge variant="secondary">{sessions.length}</Badge>
          </div>

          {/* 搜索框 */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <Input
              placeholder={t.history.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* 会话列表 */}
          <div className="space-y-2">
            {filteredSessions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <History className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{t.history.noSessions}</p>
              </div>
            ) : (
              filteredSessions.map((session) => (
                <Card
                  key={session.id}
                  className={`p-3 cursor-pointer transition-colors ${
                    selectedSession?.id === session.id
                      ? "bg-blue-50 border-blue-200"
                      : "hover:bg-gray-50"
                  }`}
                  onClick={() => {
                    setSelectedSession(session);
                    loadSessionMessages(session.id);
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate">
                        {session.title}
                      </h3>
                      <div className="flex items-center space-x-2 mt-1 text-xs text-gray-500">
                        <Calendar className="w-3 h-3" />
                        <span>{formatDate(session.created_at)}</span>
                      </div>
                      <div className="flex items-center space-x-2 mt-1 text-xs text-gray-500">
                        <MessageSquare className="w-3 h-3" />
                        <span>
                          {session.message_count || 0} {t.history.messages}
                        </span>
                      </div>
                    </div>

                    <div className="flex space-x-1 ml-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSession(session);
                              setEditTitle(session.title);
                            }}
                          >
                            <Edit3 className="w-3 h-3" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{t.history.editTitle}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <Input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              placeholder={t.history.enterNewTitle}
                            />
                            <div className="flex justify-end space-x-2">
                              <Button
                                variant="outline"
                                onClick={() => setEditingSession(null)}
                              >
                                {t.common.cancel}
                              </Button>
                              <Button
                                onClick={() => {
                                  if (editingSession) {
                                    updateSessionTitle(
                                      editingSession.id,
                                      editTitle
                                    );
                                    setEditingSession(null);
                                  }
                                }}
                              >
                                {t.common.save}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t.history.deleteSession}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t.history.deleteSessionConfirm}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>
                              {t.common.cancel}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteSession(session.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              {t.common.delete}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 消息详情 */}
      <div className="flex-1 p-4 overflow-y-auto">
        {selectedSession ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedSession(null);
                    setMessages([]);
                  }}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {t.history.back}
                </Button>
                <div>
                  <h1 className="text-xl font-semibold">
                    {selectedSession.title}
                  </h1>
                  <p className="text-sm text-gray-500">
                    {formatDate(selectedSession.created_at)}
                  </p>
                </div>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t.history.clearMessages}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t.history.clearMessages}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t.history.clearMessagesConfirm}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => clearSessionMessages(selectedSession.id)}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {t.history.clear}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {loadingMessages ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{t.history.noMessages}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <Card key={message.id} className="p-4">
                    <div className="flex items-start space-x-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          message.role === "user"
                            ? "bg-blue-500"
                            : "bg-green-500"
                        }`}
                      >
                        {message.role === "user" ? (
                          <User className="w-4 h-4 text-white" />
                        ) : (
                          <Bot className="w-4 h-4 text-white" />
                        )}
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="font-medium text-sm">
                            {message.role === "user"
                              ? t.history.user
                              : t.history.aiAssistant}
                          </span>
                          <div className="flex items-center space-x-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            <span>{formatDate(message.created_at)}</span>
                          </div>
                        </div>

                        <div className="text-sm whitespace-pre-wrap break-words">
                          {message.content}
                        </div>

                        {message.tokens && (
                          <div className="flex items-center space-x-3 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                            <div className="flex items-center space-x-1">
                              <span>{message.tokens} tokens</span>
                            </div>
                            {message.cost && (
                              <Badge variant="secondary" className="text-xs">
                                ${message.cost.toFixed(6)}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <History className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">
                {t.history.selectSession}
              </h3>
              <p className="text-sm">{t.history.selectSessionDesc}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
