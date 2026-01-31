"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import type { Language } from "@/lib/i18n";
import { isChinaDeployment } from "@/lib/config/deployment.config";

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
 * 3. 根据部署区域自动设置默认语言（中国区域=中文，国际区域=英文）
 * 4. 允许用户手动切换语言偏好
 * 5. 提供语言切换功能
 *
 * 优先级：
 * 1. localStorage 中的用户选择（最高优先级）
 * 2. 部署区域设置（DEPLOYMENT_REGION）
 * 3. 浏览器语言（备用方案）
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(isChinaDeployment() ? "zh" : "en");
  const [mounted, setMounted] = useState(false);

  // 初始化语言
  useEffect(() => {
    setMounted(true);

    // 优先级1: 根据部署区域推断默认语言
    // 使用 deployment.config.ts 中的 DEPLOYMENT_REGION 配置
    const isChinaRegion = isChinaDeployment();
    console.log("Deployment region - is China:", isChinaRegion);

    if (isChinaRegion) {
      // 中国区域：强制使用中文（忽略之前的英文设置）
      console.log("Setting language to zh (deployment region: CN)");
      setLanguageState("zh");
      localStorage.setItem(STORAGE_KEY, "zh");
      return;
    }

    // 国际区域：强制使用英文（忽略之前的中文设置）
    console.log("Setting language to en (deployment region: INTL)");
    setLanguageState("en");
    localStorage.setItem(STORAGE_KEY, "en");
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
          language: isChinaDeployment() ? "zh" : "en",
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
