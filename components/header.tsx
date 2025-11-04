"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Globe,
  WorkflowIcon as Workspace,
  Library,
  Download,
  Settings,
  User,
  CreditCard,
  History,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { UserMenu } from "./user-menu";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";

interface HeaderProps {
  activeView: string;
  setActiveView: (view: string) => void;
}

export function Header({ activeView, setActiveView }: HeaderProps) {
  const router = useRouter();
  const { language, toggleLanguage } = useLanguage();
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

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">AI</span>
          </div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            {t.header.title}
          </h1>
        </div>

        <Badge variant="secondary" className="bg-green-100 text-green-800">
          {t.header.online}
        </Badge>
      </div>

      <nav className="flex items-center space-x-2">
        <Button
          variant={activeView === "workspace" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveView("workspace")}
          className="flex items-center space-x-2"
        >
          <Workspace className="w-4 h-4" />
          <span>{t.header.workspace}</span>
        </Button>

        <Button
          variant={activeView === "library" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveView("library")}
          className="flex items-center space-x-2"
        >
          <Library className="w-4 h-4" />
          <span>{t.header.library}</span>
        </Button>

        <Button
          variant={activeView === "export" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveView("export")}
          className="flex items-center space-x-2"
        >
          <Download className="w-4 h-4" />
          <span>{t.header.export}</span>
        </Button>

        <Button
          variant={activeView === "history" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveView("history")}
          className="flex items-center space-x-2"
        >
          <History className="w-4 h-4" />
          <span>{t.header.history}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(buildUrl("/payment"))}
          className="flex items-center space-x-2"
        >
          <CreditCard className="w-4 h-4" />
          <span>{t.header.payment}</span>
        </Button>
      </nav>

      <div className="flex items-center space-x-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            console.log("Language toggle clicked, current:", language);
            toggleLanguage();
          }}
          className="flex items-center space-x-1"
        >
          <Globe className="w-4 h-4" />
          <span>{language === "zh" ? "EN" : "中文"}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(buildUrl("/settings"))}
        >
          <Settings className="w-4 h-4" />
        </Button>
        <UserMenu />
      </div>
    </header>
  );
}
