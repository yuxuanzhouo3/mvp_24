"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import type { Language } from "@/lib/i18n";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined
);

const STORAGE_KEY = "preferred-language";

/**
 * 语言提供者组件
 * Language Provider Component
 *
 * 功能：
 * 1. 管理全局语言状态
 * 2. 持久化到 localStorage
 * 3. 自动检测用户语言偏好（地理位置、浏览器语言）
 * 4. 提供语言切换功能
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("zh");
  const [mounted, setMounted] = useState(false);

  // 初始化语言
  useEffect(() => {
    setMounted(true);

    // 优先级1: 从 localStorage 读取用户选择
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
    console.log("=== LanguageProvider Init ===");
    console.log("Saved language from localStorage:", saved);

    if (saved && (saved === "zh" || saved === "en")) {
      console.log("Using saved language:", saved);
      setLanguageState(saved);
      return;
    }

    // 优先级2: 从地理位置推断（middleware 设置的 header 或 cookie）
    const regionCookie = document.cookie
      .split("; ")
      .find((row) => row.startsWith("X-User-Region="))
      ?.split("=")[1];

    // 也检查 document.referrer 中的区域信息（从middleware传递）
    const regionFromMeta = document
      .querySelector('meta[name="x-user-region"]')
      ?.getAttribute("content");

    const userRegion = regionCookie || regionFromMeta;

    if (userRegion === "CHINA") {
      setLanguageState("zh");
      localStorage.setItem(STORAGE_KEY, "zh");
      return;
    }

    // 优先级3: 从浏览器语言检测
    const browserLang = navigator.language.toLowerCase();
    console.log("Browser language:", browserLang);

    if (browserLang.startsWith("zh")) {
      console.log("Setting language to zh (browser)");
      setLanguageState("zh");
      localStorage.setItem(STORAGE_KEY, "zh");
    } else {
      console.log("Setting language to en (browser)");
      setLanguageState("en");
      localStorage.setItem(STORAGE_KEY, "en");
    }
  }, []);

  // 设置语言（带持久化）
  const setLanguage = (lang: Language) => {
    console.log("setLanguage called with:", lang);
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  };

  // 切换语言（中英文互换）
  const toggleLanguage = () => {
    const newLang: Language = language === "zh" ? "en" : "zh";
    setLanguage(newLang);
    console.log("Toggle language to:", newLang);
  };

  // 避免服务端渲染不匹配
  if (!mounted) {
    return (
      <LanguageContext.Provider
        value={{
          language: "zh",
          setLanguage: () => {},
          toggleLanguage: () => {},
        }}
      >
        {children}
      </LanguageContext.Provider>
    );
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * 使用语言的 Hook
 * Use Language Hook
 */
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
