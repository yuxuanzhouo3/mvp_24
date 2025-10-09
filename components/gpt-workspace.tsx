"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Send, Bot, User, ArrowRight, Loader2, CheckCircle } from "lucide-react"
import { AICollaborationPanel } from "@/components/ai-collaboration-panel"

interface GPTWorkspaceProps {
  selectedGPTs: any[]
  collaborationMode: string
  language: string
}

export function GPTWorkspace({ selectedGPTs, collaborationMode, language }: GPTWorkspaceProps) {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)

  const t = {
    zh: {
      placeholder: "输入您的问题或任务...",
      send: "发送",
      noAI: "请先选择AI助手",
      processing: "处理中...",
      consensus: "共识视图",
      conflict: "冲突解决",
      example: "示例：评估特斯拉在中国市场的潜力",
    },
    en: {
      placeholder: "Enter your question or task...",
      send: "Send",
      noAI: "Please select AI assistants first",
      processing: "Processing...",
      consensus: "Consensus View",
      conflict: "Conflict Resolution",
      example: "Example: Evaluate Tesla's China market potential",
    },
  }

  const handleSend = async () => {
    if (!input.trim() || selectedGPTs.length === 0) return

    setIsProcessing(true)

    // Simulate AI processing
    const newMessage = {
      id: Date.now(),
      input: input,
      responses: selectedGPTs.map((gpt) => ({
        gpt: gpt,
        response: `${gpt.name} 的回应：这是一个模拟的AI回应，展示了${gpt.role}的专业观点。`,
        status: "completed",
        tokens: Math.floor(Math.random() * 500) + 100,
      })),
    }

    setTimeout(() => {
      setMessages([...messages, newMessage])
      setInput("")
      setIsProcessing(false)
    }, 2000)
  }

  if (selectedGPTs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Bot className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{t[language].noAI}</h3>
          <p className="text-gray-500">
            {language === "zh"
              ? "从AI库中选择助手开始协作"
              : "Select assistants from the AI library to start collaborating"}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Input Area - Moved to top for convenience */}
      <div className="border-b border-gray-200 p-4 bg-white">
        <div className="flex space-x-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t[language].placeholder}
            className="flex-1 min-h-[80px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <div className="flex flex-col space-y-2">
            <Button
              onClick={handleSend}
              disabled={!input.trim() || selectedGPTs.length === 0 || isProcessing}
              className="px-6 h-12"
            >
              <Send className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="text-xs bg-transparent">
              {language === "zh" ? "模板" : "Templates"}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
          <span>
            {language === "zh"
              ? `已选择 ${selectedGPTs.length} 个AI助手`
              : `${selectedGPTs.length} AI assistants selected`}
          </span>
          <span>{language === "zh" ? "按Enter发送，Shift+Enter换行" : "Enter to send, Shift+Enter for new line"}</span>
        </div>
      </div>

      {/* AI Collaboration Panel */}
      {selectedGPTs.length > 0 && (
        <div className="p-4 border-b border-gray-100">
          <AICollaborationPanel selectedGPTs={selectedGPTs} language={language} isProcessing={isProcessing} />
        </div>
      )}

      {/* Chat Area - Now below input */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-500 mb-4">
              {language === "zh" ? "开始与AI团队协作" : "Start collaborating with your AI team"}
            </div>
            <div className="text-sm text-gray-400">{t[language].example}</div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className="space-y-4">
            {/* User Input */}
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <Card className="p-4">
                  <p className="text-gray-900">{message.input}</p>
                </Card>
              </div>
            </div>

            {/* AI Responses */}
            <div className="ml-11 space-y-3">
              {collaborationMode === "sequential" ? (
                <div className="space-y-3">
                  {message.responses.map((response, index) => (
                    <div key={index} className="flex items-start space-x-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${response.gpt.color}`}
                      >
                        {response.gpt.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="font-medium text-sm">{response.gpt.name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {response.gpt.role}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {response.tokens} tokens
                          </Badge>
                          {index < message.responses.length - 1 && <ArrowRight className="w-4 h-4 text-gray-400" />}
                        </div>
                        <Card className="p-4">
                          <p className="text-gray-700">{response.response}</p>
                        </Card>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {message.responses.map((response, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${response.gpt.color}`}
                        >
                          {response.gpt.name.charAt(0)}
                        </div>
                        <span className="font-medium text-sm">{response.gpt.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {response.gpt.role}
                        </Badge>
                      </div>
                      <Card className="p-4">
                        <p className="text-gray-700 text-sm">{response.response}</p>
                        <div className="mt-2 text-xs text-gray-500">{response.tokens} tokens</div>
                      </Card>
                    </div>
                  ))}
                </div>
              )}

              {/* Consensus View */}
              <Card className="p-4 bg-green-50 border-green-200">
                <div className="flex items-center space-x-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="font-medium text-green-800">{t[language].consensus}</span>
                </div>
                <p className="text-green-700 text-sm">
                  {language === "zh"
                    ? "基于所有AI的分析，综合建议是..."
                    : "Based on all AI analyses, the consensus recommendation is..."}
                </p>
              </Card>
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center space-x-3 text-blue-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{t[language].processing}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
