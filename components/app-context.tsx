"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface AppContextType {
  language: string;
  setLanguage: (lang: string) => void;
  activeView: string;
  setActiveView: (view: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState("zh");
  const [activeView, setActiveView] = useState("workspace");

  return (
    <AppContext.Provider
      value={{
        language,
        setLanguage,
        activeView,
        setActiveView,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
