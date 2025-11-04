"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  subscription_plan: string;
  subscription_status: string;
  subscription_expires_at?: string;
  membership_expires_at?: string;
}

interface UserContextType {
  user: UserProfile | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  refreshUserWithoutLoading: () => Promise<void>;
  signOut: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef<UserProfile | null>(null);
  const lastRefreshTime = useRef<number>(0);
  const isRefreshing = useRef<boolean>(false);
  const lastProcessedUserRef = useRef<string | null>(null);

  const signOut = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error signing out:", error);
    }
    // The onAuthStateChange listener will handle setting user to null.
    // We can also set it here for a faster UI response.
    setUser(null);
    setLoading(false);
  }, []);

  const refreshUser = useCallback(async () => {
    // 防止并发调用：如果已经有正在进行的刷新，跳过
    if (isRefreshing.current) {
      console.log("跳过并发刷新");
      return;
    }
    isRefreshing.current = true;

    let timeoutId: NodeJS.Timeout | null = null;

    try {
      setLoading(true);

      // 创建超时Promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("用户加载超时"));
        }, 10000);
      });

      // 创建实际的用户加载Promise
      const userLoadPromise = async () => {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        if (!authUser) {
          setUser(null);
          return;
        }

        // 优先尝试读取已经保存的用户资料，避免覆盖用户自定义信息
        const { data: existingProfile, error: fetchError } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("id", authUser.id)
          .maybeSingle();

        if (fetchError && fetchError.code !== "PGRST116") {
          console.error("获取用户资料失败:", fetchError);
          // 即使失败也创建基本用户对象，避免一直加载
          const basicProfile: UserProfile = {
            id: authUser.id,
            email: authUser.email || "",
            full_name:
              authUser.user_metadata?.full_name ||
              authUser.email?.split("@")[0] ||
              "用户",
            avatar_url: authUser.user_metadata?.avatar_url || "",
            subscription_plan: "free",
            subscription_status: "active",
          };
          setUser(basicProfile);
          return;
        }

        if (existingProfile) {
          setUser(existingProfile as UserProfile);
          return;
        }

        const defaultProfile = {
          id: authUser.id,
          email: authUser.email || "",
          full_name:
            authUser.user_metadata?.full_name ||
            authUser.email?.split("@")[0] ||
            "用户",
          avatar_url: authUser.user_metadata?.avatar_url || "",
          subscription_plan: "free",
          subscription_status: "active",
        } satisfies UserProfile;

        const { data: newProfile, error: insertError } = await supabase
          .from("user_profiles")
          .upsert(defaultProfile, { onConflict: "id" })
          .select()
          .single();

        if (insertError) {
          console.error("创建用户资料失败:", insertError);
          // 即使数据库插入失败，也使用默认资料，避免一直加载
          setUser(defaultProfile);
          return;
        }

        setUser(newProfile as UserProfile);
      };

      // 使用 Promise.race 来处理超时
      await Promise.race([userLoadPromise(), timeoutPromise]);
    } catch (error) {
      // 统一处理所有错误，包括超时
      console.error("刷新用户信息失败:", error);
      setUser(null);
    } finally {
      // 清理超时定时器
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      // 确保loading状态总是被重置
      setLoading(false);
      isRefreshing.current = false;
    }
  }, []);

  const refreshUserWithoutLoading = useCallback(async () => {
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        setUser(null);
        return;
      }

      // 优先尝试读取已经保存的用户资料，避免覆盖用户自定义信息
      const { data: existingProfile, error: fetchError } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();

      if (fetchError && fetchError.code !== "PGRST116") {
        console.error("获取用户资料失败:", fetchError);
        setUser(null);
        return;
      }

      if (existingProfile) {
        setUser(existingProfile as UserProfile);
        return;
      }

      const defaultProfile = {
        id: authUser.id,
        email: authUser.email || "",
        full_name:
          authUser.user_metadata?.full_name ||
          authUser.email?.split("@")[0] ||
          "用户",
        avatar_url: authUser.user_metadata?.avatar_url || "",
        subscription_plan: "free",
        subscription_status: "active",
      } satisfies UserProfile;

      const { data: newProfile, error: insertError } = await supabase
        .from("user_profiles")
        .upsert(defaultProfile, { onConflict: "id" })
        .select()
        .single();

      if (insertError) {
        console.error("创建用户资料失败:", insertError);
        setUser(null);
        return;
      }

      setUser(newProfile as UserProfile);
    } catch (error) {
      console.error("刷新用户信息失败:", error);
      setUser(null);
    }
  }, [setUser]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    let mounted = true;

    // 立即检查用户状态
    const initializeUser = async () => {
      try {
        console.log("开始初始化用户状态...");

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("获取session失败:", sessionError);
          if (mounted) setLoading(false);
          return;
        }

        if (session?.user) {
          const authUser = session.user;
          // 先设置基本用户信息，立即结束loading
          if (mounted) {
            setUser({
              id: authUser.id,
              email: authUser.email || "",
              full_name:
                (authUser.user_metadata as any)?.full_name ||
                authUser.email?.split("@")[0] ||
                "用户",
              avatar_url: (authUser.user_metadata as any)?.avatar_url || "",
              subscription_plan: "free",
              subscription_status: "active",
            });
            setLoading(false);
          }
          // 后台静默刷新完善资料
          refreshUserWithoutLoading();
        } else {
          console.log("没有找到有效session，用户未登录");
          if (mounted) setLoading(false);
        }
      } catch (error) {
        console.error("初始化用户状态失败:", error);
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
      }
    };

    // 执行初始化
    initializeUser();

    // 监听认证状态变化
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state change:", event);

      if (!mounted) return;

      if (event === "SIGNED_IN" && session?.user) {
        const userId = session.user.id;

        // 防止重复处理同一个用户的登录事件
        if (lastProcessedUserRef.current === userId && isRefreshing.current) {
          console.log("跳过重复的登录事件:", userId);
          return;
        }

        lastProcessedUserRef.current = userId;
        console.log("用户登录，设置基本信息");

        setUser({
          id: session.user.id,
          email: session.user.email || "",
          full_name:
            (session.user.user_metadata as any)?.full_name ||
            session.user.email?.split("@")[0] ||
            "用户",
          avatar_url: (session.user.user_metadata as any)?.avatar_url || "",
          subscription_plan: "free",
          subscription_status: "active",
        });
        setLoading(false);

        // 后台静默刷新
        refreshUserWithoutLoading();
      } else if (event === "SIGNED_OUT") {
        console.log("用户登出");
        lastProcessedUserRef.current = null;
        setUser(null);
        setLoading(false);
      } else if (event === "TOKEN_REFRESHED" && session) {
        console.log("Token已刷新");
        refreshUserWithoutLoading();
      } else if (event === "USER_UPDATED" && session) {
        console.log("用户信息已更新");
        refreshUserWithoutLoading();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refreshUserWithoutLoading]);

  const contextValue = useMemo(
    () => ({ user, loading, refreshUser, refreshUserWithoutLoading, signOut }),
    [user, loading, refreshUser, refreshUserWithoutLoading, signOut]
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
