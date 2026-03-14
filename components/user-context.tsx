"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import {
  getStoredAuthState,
  clearAuthState,
  initializeTokenPreloader,
  initAuthStateManager,
} from "@/lib/auth-state-manager";
import { getAuthClient } from "@/lib/auth/client";
import { isChinaRegion } from "@/lib/config/region";
import { clearUserUsageCache } from "@/lib/usage/client-cache";

const authClient = getAuthClient();
let supabaseClientPromise: Promise<any> | null = null;

async function loadSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = import("@/lib/supabase").then(
      (module) => module.supabase
    );
  }

  return supabaseClientPromise;
}

function pickFirstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  subscription_plan?: string;
  subscription_status?: string;
  subscription_expires_at?: string;
  membership_expires_at?: string;
  subscription_tier?: string;
  plan_exp?: string | null;
  isPaid?: boolean;
  hasActiveSubscription?: boolean;
  hide_ads?: boolean;
}

interface UserContextType {
  user: UserProfile | null;
  loading: boolean;
  isAuthInitialized: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);

  const mapSupabaseUserToProfile = useCallback((supabaseUser: any): UserProfile => {
    const metadata = supabaseUser?.user_metadata || {};
    return {
      id: supabaseUser.id,
      email: supabaseUser.email || "",
      name: pickFirstString(
        metadata.displayName,
        metadata.full_name,
        metadata.name
      ),
      avatar: pickFirstString(
        metadata.avatar,
        metadata.avatar_url,
        metadata.picture,
        metadata.photo_url
      ),
    };
  }, []);

  const readSupabaseSessionUser = useCallback(async (): Promise<UserProfile | null | undefined> => {
    const supabase = await loadSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      // undefined 表示“临时读取失败”，调用方应保留当前用户，避免误登出
      console.warn("⚠️ [Auth INTL] Supabase getSession 临时失败:", error);
      return undefined;
    }
    if (!data?.session?.user) {
      return null;
    }
    return mapSupabaseUserToProfile(data.session.user);
  }, [mapSupabaseUserToProfile]);

  const signOut = useCallback(async () => {
    try {
      setLoading(true);
      const { error } = await authClient.signOut();
      if (error) {
        console.error("❌ [Auth] 登出失败:", error);
      }
      clearAuthState();
      clearUserUsageCache();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 刷新用户信息
  const refreshUser = useCallback(async () => {
    try {
      console.log("🔄 [Auth] 刷新用户信息...");
      const { tokenManager } = await import("@/lib/frontend-token-manager");
      const headers = await tokenManager.getAuthHeaderAsync();
      if (!headers) {
        console.warn("⚠️ [Auth] 无法获取认证信息");
        return;
      }

      const response = await fetch("/api/profile", { headers });
      if (!response.ok) {
        throw new Error(`刷新用户信息失败: ${response.status}`);
      }

      const updatedUser = await response.json();
      setUser(updatedUser as UserProfile);

      // ✅ 国际版：同时保存到缓存，确保其他标签页也能同步
      if (!isChinaRegion()) {
        try {
          const { saveSupabaseUserCache } = await import(
            "@/lib/auth-state-manager-intl"
          );
          saveSupabaseUserCache(updatedUser);
          console.log("✅ [Auth INTL] 用户信息已缓存");
        } catch (cacheError) {
          console.warn(
            "⚠️ [Auth INTL] 缓存保存失败，但用户信息已更新:",
            cacheError
          );
        }
      }

      console.log("✅ [Auth] 用户信息已刷新");
    } catch (error) {
      console.error("❌ [Auth] 刷新用户信息失败:", error);
    }
  }, []);

  // P0：同步初始化认证状态（从 localStorage 同步读取）
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        console.log("📝 [Auth] 同步初始化认证状态...");

        // 0. 初始化认证管理器（清除旧键，仅用于CN）
        if (isChinaRegion()) {
          initAuthStateManager();
        }

        // 1. 根据区域读取认证状态
        let authState = null;

        if (isChinaRegion()) {
          // CN：从 CloudBase 的 app-auth-state 读取
          authState = getStoredAuthState();
        } else {
          // ✅ INTL：优先从缓存读取,缓存miss再从Supabase读取
          console.log("🌍 [Auth] INTL 模式，检查缓存...");
          const { getSupabaseUserCache } = await import(
            "@/lib/auth-state-manager-intl"
          );
          const cachedUser = getSupabaseUserCache();

          if (cachedUser) {
            console.log(`📦 [Auth] 从缓存恢复用户: ${cachedUser.email}`);
            authState = { user: cachedUser };
          } else {
            // 缓存miss，从 Supabase 读取
            console.log("🔍 [Auth] 缓存未命中，从 Supabase 读取 session...");
            const sessionUser = await readSupabaseSessionUser();
            if (sessionUser === undefined) {
              console.warn("⚠️ [Auth] 初始化阶段读取会话失败，保留当前状态");
            } else if (sessionUser) {
              console.log(
                `✅ [Auth] 从 Supabase 恢复用户: ${sessionUser.email}`
              );
              authState = { user: sessionUser };
            } else {
              clearUserUsageCache();
            }
          }
        }

        if (authState && authState.user) {
          // 2. 立即设置用户信息（同步操作）
          setUser(authState.user as UserProfile);
          console.log(`✅ [Auth] 恢复用户: ${authState.user.email}`);
        } else {
          clearUserUsageCache();
          setUser(null);
          console.log("❌ [Auth] 无有效认证状态");
        }

        // 3. 标记初始化完成（重要：阻止闪烁）
        setIsAuthInitialized(true);
        setLoading(false);

        // P2-2: 初始化 token 预加载器（仅用于 CN）
        if (isChinaRegion()) {
          initializeTokenPreloader();
        }
      } catch (error) {
        console.error("❌ [Auth] 初始化失败:", error);
        clearUserUsageCache();
        setUser(null);
        setIsAuthInitialized(true);
        setLoading(false);
      }
    };

    // 异步执行初始化
    initializeAuth();
  }, [readSupabaseSessionUser]);

  // P1：多标签页同步（监听 storage 事件）
  useEffect(() => {
    const syncFromSupabaseSession = async (source: string) => {
      const sessionUser = await readSupabaseSessionUser();
      if (sessionUser === undefined) {
        console.warn(`⚠️ [Auth INTL] ${source} 会话校验失败，保留当前登录状态`);
        return;
      }
      if (!sessionUser) {
        clearUserUsageCache();
      }
      setUser(sessionUser);
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (isChinaRegion()) {
        // 国内版：监听 app-auth-state
        if (event.key === "app-auth-state") {
          console.log("📡 [Auth CN] 检测到其他标签页的认证变化");
          if (!event.newValue) {
            clearUserUsageCache();
            setUser(null);
          } else {
            try {
              const authState = JSON.parse(event.newValue);
              if (authState.user) {
                setUser(authState.user as UserProfile);
              }
            } catch (error) {
              console.error("❌ [Auth CN] 解析跨标签页数据失败:", error);
              clearUserUsageCache();
              setUser(null);
            }
          }
        }
      } else {
        // ✅ 国际版：监听 supabase-user-cache
        if (event.key === "supabase-user-cache") {
          console.log("📡 [Auth INTL] 检测到其他标签页的用户信息变化");
          if (!event.newValue) {
            void syncFromSupabaseSession("storage:cache-cleared");
          } else {
            try {
              const cache = JSON.parse(event.newValue);
              if (cache.user) {
                setUser(cache.user as UserProfile);
                console.log("✅ [Auth INTL] 从其他标签页同步用户信息");
              } else {
                void syncFromSupabaseSession("storage:cache-missing-user");
              }
            } catch (error) {
              console.error("❌ [Auth INTL] 解析跨标签页数据失败:", error);
              void syncFromSupabaseSession("storage:cache-parse-error");
            }
          }
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [readSupabaseSessionUser]);

  // P1：自定义事件监听（同标签页内 auth 状态变化）
  useEffect(() => {
    const syncFromSupabaseSession = async (source: string) => {
      const sessionUser = await readSupabaseSessionUser();
      if (sessionUser === undefined) {
        console.warn(`⚠️ [Auth INTL] ${source} 会话校验失败，保留当前登录状态`);
        return;
      }
      if (!sessionUser) {
        clearUserUsageCache();
      }
      setUser(sessionUser);
    };

    const handleAuthStateChanged = async () => {
      console.log("🔔 [Auth] 检测到认证状态变化");

      if (isChinaRegion()) {
        // CN：从 CloudBase 读取
        const authState = getStoredAuthState();
        if (authState?.user) {
          setUser(authState.user as UserProfile);
        } else {
          clearUserUsageCache();
          setUser(null);
        }
      } else {
        await syncFromSupabaseSession("auth-state-changed");
      }
    };

    // ✅ 国际版：监听 supabase-user-changed 自定义事件（同标签页内）
    const handleSupabaseUserChanged = (event: CustomEvent) => {
      console.log("🔔 [Auth INTL] 检测到同标签页内用户信息变化");
      if (event.detail) {
        setUser(event.detail as UserProfile);
      } else {
        void syncFromSupabaseSession("supabase-user-changed");
      }
    };

    window.addEventListener("auth-state-changed", handleAuthStateChanged);

    if (!isChinaRegion()) {
      window.addEventListener(
        "supabase-user-changed",
        handleSupabaseUserChanged as EventListener
      );
    }

    return () => {
      window.removeEventListener("auth-state-changed", handleAuthStateChanged);
      if (!isChinaRegion()) {
        window.removeEventListener(
          "supabase-user-changed",
          handleSupabaseUserChanged as EventListener
        );
      }
    };
  }, [readSupabaseSessionUser]);

  // INTL：Supabase 认证状态变化监听器
  useEffect(() => {
    if (!isChinaRegion()) {
      console.log("🌍 [Auth] 设置 Supabase auth 状态变化监听器...");
      let isCancelled = false;
      let unsubscribe: (() => void) | undefined;

      void (async () => {
        const supabase = await loadSupabaseClient();
        if (isCancelled) {
          return;
        }

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(
          async (event: string, session: { user?: any } | null) => {
            console.log(`🔔 [Auth] Supabase 认证事件: ${event}`);

            if (session?.user) {
              console.log(`✅ [Auth] Supabase 用户登录: ${session.user.email}`);
              setUser(mapSupabaseUserToProfile(session.user));
              return;
            }

            if (event === "SIGNED_OUT" || event === "USER_DELETED") {
              console.log("❌ [Auth] Supabase 用户登出");
              clearUserUsageCache();
              setUser(null);
              return;
            }

            const sessionUser = await readSupabaseSessionUser();
            if (sessionUser === undefined) {
              console.warn(`⚠️ [Auth INTL] 事件 ${event} 会话读取失败，保留当前登录状态`);
              return;
            }

            if (!sessionUser) {
              clearUserUsageCache();
            }
            setUser(sessionUser);
          }
        );

        unsubscribe = () => subscription?.unsubscribe();
      })();

      return () => {
        isCancelled = true;
        unsubscribe?.();
      };
    }
  }, [mapSupabaseUserToProfile, readSupabaseSessionUser]);

  const contextValue = useMemo(
    () => ({ user, loading, isAuthInitialized, signOut, refreshUser }),
    [user, loading, isAuthInitialized, signOut, refreshUser]
  );

  return (
    <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
