"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Download, Share2, FileText, Mail, MessageCircle, Webhook, Settings, CheckCircle } from "lucide-react"

interface ExportPanelProps {
  selectedGPTs: any[]
  language: string
}

export function ExportPanel({ selectedGPTs, language }: ExportPanelProps) {
  const [exportFormat, setExportFormat] = useState("pdf")
  const [shareTarget, setShareTarget] = useState("wechat")

  const t = {
    zh: {
      title: "导出与分享",
      subtitle: "将AI协作结果导出为文档或分享到社交平台",
      exportFormats: "导出格式",
      shareOptions: "分享选项",
      apiIntegration: "API集成",
      export: "导出",
      share: "分享",
      configure: "配置",
      noContent: "暂无内容可导出",
      selectAI: "请先选择AI助手并开始对话",
      pdf: "PDF文档",
      docx: "Word文档",
      markdown: "Markdown",
      wechat: "微信",
      dingtalk: "钉钉",
      email: "邮件",
      webhook: "Webhook",
      success: "导出成功",
    },
    en: {
      title: "Export & Share",
      subtitle: "Export AI collaboration results as documents or share to social platforms",
      exportFormats: "Export Formats",
      shareOptions: "Share Options",
      apiIntegration: "API Integration",
      export: "Export",
      share: "Share",
      configure: "Configure",
      noContent: "No content to export",
      selectAI: "Please select AI assistants and start a conversation first",
      pdf: "PDF Document",
      docx: "Word Document",
      markdown: "Markdown",
      wechat: "WeChat",
      dingtalk: "DingTalk",
      email: "Email",
      webhook: "Webhook",
      success: "Export successful",
    },
  }

  const exportFormats = [
    {
      id: "pdf",
      name: t[language].pdf,
      icon: FileText,
      description: language === "zh" ? "生成专业的PDF报告" : "Generate professional PDF reports",
    },
    {
      id: "docx",
      name: t[language].docx,
      icon: FileText,
      description: language === "zh" ? "可编辑的Word文档" : "Editable Word documents",
    },
    {
      id: "markdown",
      name: t[language].markdown,
      icon: FileText,
      description: language === "zh" ? "轻量级标记语言格式" : "Lightweight markup language format",
    },
  ]

  const shareOptions = [
    {
      id: "wechat",
      name: t[language].wechat,
      icon: MessageCircle,
      color: "bg-green-500",
      description: language === "zh" ? "分享到微信好友或群聊" : "Share to WeChat friends or groups",
    },
    {
      id: "dingtalk",
      name: t[language].dingtalk,
      icon: MessageCircle,
      color: "bg-blue-500",
      description: language === "zh" ? "分享到钉钉工作群" : "Share to DingTalk work groups",
    },
    {
      id: "email",
      name: t[language].email,
      icon: Mail,
      color: "bg-red-500",
      description: language === "zh" ? "通过邮件发送报告" : "Send reports via email",
    },
  ]

  const handleExport = () => {
    // Simulate export process
    setTimeout(() => {
      alert(t[language].success)
    }, 1000)
  }

  const handleShare = () => {
    // Simulate share process
    setTimeout(() => {
      alert(t[language].success)
    }, 1000)
  }

  if (selectedGPTs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Download className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{t[language].noContent}</h3>
          <p className="text-gray-500">{t[language].selectAI}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t[language].title}</h2>
          <p className="text-gray-600">{t[language].subtitle}</p>
        </div>

        {/* Current Session Info */}
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">{language === "zh" ? "当前会话" : "Current Session"}</h3>
          <div className="flex items-center space-x-4 mb-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">{language === "zh" ? "参与AI：" : "Participating AIs:"}</span>
              {selectedGPTs.map((gpt, index) => (
                <Badge key={index} variant="secondary" className="flex items-center space-x-1">
                  <div className={`w-3 h-3 rounded-full ${gpt.color}`}></div>
                  <span>{gpt.name}</span>
                </Badge>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-gray-500">{language === "zh" ? "消息数量" : "Messages"}</div>
              <div className="font-semibold">12</div>
            </div>
            <div>
              <div className="text-gray-500">{language === "zh" ? "总Token" : "Total Tokens"}</div>
              <div className="font-semibold">2,847</div>
            </div>
            <div>
              <div className="text-gray-500">{language === "zh" ? "协作时长" : "Duration"}</div>
              <div className="font-semibold">15 {language === "zh" ? "分钟" : "min"}</div>
            </div>
          </div>
        </Card>

        {/* Export Formats */}
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">{t[language].exportFormats}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {exportFormats.map((format) => {
              const Icon = format.icon
              return (
                <div
                  key={format.id}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    exportFormat === format.id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setExportFormat(format.id)}
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <Icon className="w-5 h-5 text-gray-600" />
                    <span className="font-medium">{format.name}</span>
                  </div>
                  <p className="text-sm text-gray-500">{format.description}</p>
                </div>
              )
            })}
          </div>
          <Button onClick={handleExport} className="w-full">
            <Download className="w-4 h-4 mr-2" />
            {t[language].export}
          </Button>
        </Card>

        {/* Share Options */}
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">{t[language].shareOptions}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {shareOptions.map((option) => {
              const Icon = option.icon
              return (
                <div
                  key={option.id}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    shareTarget === option.id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setShareTarget(option.id)}
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <div className={`w-8 h-8 rounded-full ${option.color} flex items-center justify-center`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-medium">{option.name}</span>
                  </div>
                  <p className="text-sm text-gray-500">{option.description}</p>
                </div>
              )
            })}
          </div>
          <Button onClick={handleShare} className="w-full">
            <Share2 className="w-4 h-4 mr-2" />
            {t[language].share}
          </Button>
        </Card>

        {/* API Integration */}
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">{t[language].apiIntegration}</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <Webhook className="w-5 h-5 text-gray-600" />
                <div>
                  <div className="font-medium">{t[language].webhook}</div>
                  <div className="text-sm text-gray-500">
                    {language === "zh" ? "自动发送结果到指定URL" : "Automatically send results to specified URL"}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                {t[language].configure}
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <div className="font-medium">{language === "zh" ? "自动保存" : "Auto Save"}</div>
                  <div className="text-sm text-gray-500">
                    {language === "zh" ? "对话内容自动保存到云端" : "Conversation content automatically saved to cloud"}
                  </div>
                </div>
              </div>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {language === "zh" ? "已启用" : "Enabled"}
              </Badge>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
