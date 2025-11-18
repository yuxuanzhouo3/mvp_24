"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { GPTWorkspace } from "@/components/gpt-workspace";
import { GPTLibrary } from "@/components/gpt-library";
import { Header } from "@/components/header";
import { ExportPanel } from "@/components/export-panel";
import { ChatHistory } from "@/components/chat-history";
import { useApp } from "@/components/app-context";
import { useUser } from "@/components/user-context";
import { WorkspaceMessagesProvider } from "@/components/workspace-messages-context";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export default function MultiGPTPlatform() {
  const [selectedGPTs, setSelectedGPTs] = useState<any[]>([]);
  const { activeView, setActiveView } = useApp();
  const { user, loading } = useUser();
  const router = useRouter();
  const [collaborationMode, setCollaborationMode] = useState<
    "parallel" | "sequential"
  >("parallel");

  // 移除强制认证 - 允许游客访问，具体功能内部根据需要检查登录状态

  // 🚨 调试模式已被完全移除

  // 只在初始化时显示加载状态，允许未登录用户访问
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceMessagesProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <Header activeView={activeView} setActiveView={setActiveView} />

        {/* 🚨 调试模式UI已被完全移除 */}

        <div className="flex flex-col lg:flex-row h-[calc(100vh-64px)]">
          <Sidebar
            selectedGPTs={selectedGPTs}
            setSelectedGPTs={setSelectedGPTs}
            collaborationMode={collaborationMode}
            setCollaborationMode={(mode) =>
              setCollaborationMode(mode as "parallel" | "sequential")
            }
          />

          <main className="flex-1 overflow-auto w-full">
            {activeView === "workspace" && (
              <GPTWorkspace
                selectedGPTs={selectedGPTs}
                collaborationMode={collaborationMode}
              />
            )}
            {activeView === "library" && (
              <GPTLibrary
                selectedGPTs={selectedGPTs}
                setSelectedGPTs={setSelectedGPTs}
                collaborationMode={collaborationMode}
                setCollaborationMode={(mode) =>
                  setCollaborationMode(mode as "parallel" | "sequential")
                }
              />
            )}
            {activeView === "export" && (
              <ExportPanel selectedGPTs={selectedGPTs} />
            )}
            {activeView === "history" && <ChatHistory />}
          </main>
        </div>
      </div>
    </WorkspaceMessagesProvider>
  );
}
