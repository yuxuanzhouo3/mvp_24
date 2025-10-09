"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { GPTWorkspace } from "@/components/gpt-workspace"
import { GPTLibrary } from "@/components/gpt-library"
import { Header } from "@/components/header"
import { ExportPanel } from "@/components/export-panel"

export default function MultiGPTPlatform() {
  const [selectedGPTs, setSelectedGPTs] = useState([])
  const [activeView, setActiveView] = useState("workspace")
  const [language, setLanguage] = useState("zh")
  const [collaborationMode, setCollaborationMode] = useState("parallel")

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <Header language={language} setLanguage={setLanguage} activeView={activeView} setActiveView={setActiveView} />

      <div className="flex h-[calc(100vh-64px)]">
        <Sidebar
          selectedGPTs={selectedGPTs}
          setSelectedGPTs={setSelectedGPTs}
          collaborationMode={collaborationMode}
          setCollaborationMode={setCollaborationMode}
          language={language}
        />

        <main className="flex-1 overflow-hidden">
          {activeView === "workspace" && (
            <GPTWorkspace selectedGPTs={selectedGPTs} collaborationMode={collaborationMode} language={language} />
          )}
          {activeView === "library" && (
            <GPTLibrary selectedGPTs={selectedGPTs} setSelectedGPTs={setSelectedGPTs} language={language} />
          )}
          {activeView === "export" && <ExportPanel selectedGPTs={selectedGPTs} language={language} />}
        </main>
      </div>
    </div>
  )
}
