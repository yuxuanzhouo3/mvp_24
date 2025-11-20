"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Globe,
  WorkflowIcon as Workspace,
  Library,
  Download,
  CreditCard,
  Menu,
  Plus,
  MessageSquare,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { UserMenu } from "./user-menu";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getClientAuthToken } from "@/lib/client-auth";
import { isInApp } from "@/lib/platform-detection";
import { toast } from "sonner";

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface HeaderProps {
  activeView: string;
  setActiveView: (view: string) => void;
  currentSessionId?: string | null;
  onSessionSelect?: (sessionId: string) => void;
  onNewChat?: () => void;
}

export function Header({
  activeView,
  setActiveView,
  currentSessionId,
  onSessionSelect,
  onNewChat,
}: HeaderProps) {
  const router = useRouter();
  const { language, toggleLanguage } = useLanguage();
  const t = useTranslations(language);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [inApp, setInApp] = useState(false);

  // 检测是否在 App 中
  useEffect(() => {
    setInApp(isInApp());
  }, []);

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

  // 删除会话
  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("确定要删除这个对话吗?")) return;

    try {
      const { token, error: authError } = await getClientAuthToken();
      if (authError || !token) return;

      await fetch(`/api/chat/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      loadSessions();
    } catch (error) {
      console.error("删除失败:", error);
      toast.error("删除失败");
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
    if (onNewChat) {
      onNewChat();
    }
    setMobileMenuOpen(false);
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-2 sm:px-4 lg:px-6">
      <div className="flex items-center gap-2 sm:gap-4">
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
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs sm:text-sm">AI</span>
          </div>
          {/* 标题和徽章 - 移动端隐藏 */}
          <h1 className="hidden sm:block text-base sm:text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent truncate">
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

      <nav className="flex items-center gap-1">
        <Button
          variant={activeView === "workspace" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveView("workspace")}
          className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:px-3"
          title={t.header.workspace}
        >
          <Workspace className="w-4 h-4 flex-shrink-0" />
          <span className="hidden md:inline">{t.header.workspace}</span>
        </Button>

        <Button
          variant={activeView === "library" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveView("library")}
          className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:px-3"
          title={t.header.library}
        >
          <Library className="w-4 h-4 flex-shrink-0" />
          <span className="hidden md:inline">{t.header.library}</span>
        </Button>

        <Button
          variant={activeView === "export" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveView("export")}
          className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:px-3"
          title={t.header.export}
        >
          <Download className="w-4 h-4 flex-shrink-0" />
          <span className="hidden lg:inline">{t.header.export}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(buildUrl("/payment"))}
          className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:px-3"
          title={t.header.payment}
        >
          <CreditCard className="w-4 h-4 flex-shrink-0" />
          <span className="hidden lg:inline">{t.header.payment}</span>
        </Button>
      </nav>

      <div className="flex items-center gap-1 sm:gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            console.log("Language toggle clicked, current:", language);
            toggleLanguage();
          }}
          className="flex items-center gap-1 text-xs sm:text-sm"
          title={language === "zh" ? "English" : "中文"}
        >
          <Globe className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">
            {language === "zh" ? "EN" : "中文"}
          </span>
        </Button>

        {!inApp && (
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
              <div className="space-y-1 py-2">
                {sessions.map((session) => (
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
                      onClick={(e) => handleDelete(session.id, e)}
                      title={language === "zh" ? "删除对话" : "Delete"}
                    >
                      <Trash2 className="h-3 w-3 text-gray-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </header>
  );
}
