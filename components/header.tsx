"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Globe, WorkflowIcon as Workspace, Library, Download, Settings, User } from "lucide-react"

interface HeaderProps {
  language: string
  setLanguage: (lang: string) => void
  activeView: string
  setActiveView: (view: string) => void
}

export function Header({ language, setLanguage, activeView, setActiveView }: HeaderProps) {
  const t = {
    zh: {
      title: "多AI协作平台",
      workspace: "工作空间",
      library: "AI库",
      export: "导出",
      settings: "设置",
    },
    en: {
      title: "Multi-GPT Platform",
      workspace: "Workspace",
      library: "AI Library",
      export: "Export",
      settings: "Settings",
    },
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">AI</span>
          </div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            {t[language].title}
          </h1>
        </div>

        <Badge variant="secondary" className="bg-green-100 text-green-800">
          {language === "zh" ? "在线" : "Online"}
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
          <span>{t[language].workspace}</span>
        </Button>

        <Button
          variant={activeView === "library" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveView("library")}
          className="flex items-center space-x-2"
        >
          <Library className="w-4 h-4" />
          <span>{t[language].library}</span>
        </Button>

        <Button
          variant={activeView === "export" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveView("export")}
          className="flex items-center space-x-2"
        >
          <Download className="w-4 h-4" />
          <span>{t[language].export}</span>
        </Button>
      </nav>

      <div className="flex items-center space-x-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
          className="flex items-center space-x-1"
        >
          <Globe className="w-4 h-4" />
          <span>{language === "zh" ? "EN" : "中文"}</span>
        </Button>

        <Button variant="ghost" size="sm">
          <Settings className="w-4 h-4" />
        </Button>

        <Button variant="ghost" size="sm">
          <User className="w-4 h-4" />
        </Button>
      </div>
    </header>
  )
}
