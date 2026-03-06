"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE_SETTINGS,
  buildAppearanceCssVars,
  getAppearanceColors,
  getAssistantAvatarFallback,
  isLikelyImageUrl,
  sanitizeAppearanceSettings,
  type AppearanceSettings,
} from "@/lib/appearance";

type AppearanceUpdater =
  | Partial<AppearanceSettings>
  | ((
      prev: AppearanceSettings
    ) => Partial<AppearanceSettings> | AppearanceSettings);

interface AppearanceContextValue {
  appearance: AppearanceSettings;
  colors: { primary: string; accent: string };
  assistantAvatarFallback: string;
  assistantAvatarSrc: string;
  mounted: boolean;
  setAppearance: (updater: AppearanceUpdater) => void;
  resetAppearance: () => void;
}

const AppearanceContext = createContext<AppearanceContextValue | undefined>(
  undefined
);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<AppearanceSettings>(
    DEFAULT_APPEARANCE_SETTINGS
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    try {
      const stored = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<AppearanceSettings>;
      setAppearanceState(sanitizeAppearanceSettings(parsed));
    } catch (error) {
      console.warn("Failed to load appearance settings:", error);
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    const cssVars = buildAppearanceCssVars(appearance);
    for (const [key, value] of Object.entries(cssVars)) {
      root.style.setProperty(key, value);
    }
    root.dataset.appearancePreset = appearance.presetId;

    if (!mounted) {
      return;
    }

    try {
      window.localStorage.setItem(
        APPEARANCE_STORAGE_KEY,
        JSON.stringify(appearance)
      );
    } catch (error) {
      console.warn("Failed to save appearance settings:", error);
    }
  }, [appearance, mounted]);

  const setAppearance = useCallback((updater: AppearanceUpdater) => {
    setAppearanceState((prev) => {
      const nextValue =
        typeof updater === "function" ? updater(prev) : updater;
      return sanitizeAppearanceSettings({
        ...prev,
        ...nextValue,
      });
    });
  }, []);

  const resetAppearance = useCallback(() => {
    setAppearanceState(DEFAULT_APPEARANCE_SETTINGS);
  }, []);

  const colors = useMemo(
    () => getAppearanceColors(appearance),
    [appearance]
  );

  const assistantAvatarFallback = useMemo(
    () => getAssistantAvatarFallback(appearance),
    [appearance]
  );

  const assistantAvatarSrc = useMemo(() => {
    const avatar = appearance.assistantAvatar.trim();
    return isLikelyImageUrl(avatar) ? avatar : "";
  }, [appearance.assistantAvatar]);

  const value = useMemo(
    () => ({
      appearance,
      colors,
      assistantAvatarFallback,
      assistantAvatarSrc,
      mounted,
      setAppearance,
      resetAppearance,
    }),
    [
      appearance,
      colors,
      assistantAvatarFallback,
      assistantAvatarSrc,
      mounted,
      setAppearance,
      resetAppearance,
    ]
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error("useAppearance must be used within AppearanceProvider");
  }
  return context;
}
