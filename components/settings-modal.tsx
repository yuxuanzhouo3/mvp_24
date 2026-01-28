"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { language, setLanguage } = useLanguage();
  const [theme, setTheme] = useState<"light" | "dark" | "auto">("light");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">设置</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-6">
          {/* 外观设置 */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              🎨 外观
            </h3>
            <div className="flex gap-3">
              <button
                className={`flex-1 px-4 py-2 rounded-md border text-sm ${
                  theme === "light"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300"
                }`}
                onClick={() => setTheme("light")}
              >
                浅色
              </button>
              <button
                className={`flex-1 px-4 py-2 rounded-md border text-sm ${
                  theme === "dark"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300"
                }`}
                onClick={() => setTheme("dark")}
              >
                深色
              </button>
              <button
                className={`flex-1 px-4 py-2 rounded-md border text-sm ${
                  theme === "auto"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300"
                }`}
                onClick={() => setTheme("auto")}
              >
                自动
              </button>
            </div>
          </div>

          {/* 语言设置 */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              🌐 语言
            </h3>
            <select
              className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm"
              value={language}
              onChange={(e) => setLanguage(e.target.value as "zh" | "en")}
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </div>

          {/* 快捷键 */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              ⌨️ 快捷键
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">新对话</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded border border-gray-300">
                  Ctrl+N
                </kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">发送消息</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded border border-gray-300">
                  Enter
                </kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">换行</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded border border-gray-300">
                  Shift+Enter
                </kbd>
              </div>
            </div>
          </div>

          {/* 账号 */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              👤 账号
            </h3>
            <Button variant="outline" className="w-full" size="sm">
              退出登录
            </Button>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={onClose}>保存</Button>
        </div>
      </Card>
    </div>
  );
}
