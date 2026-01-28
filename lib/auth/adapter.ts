/**
 * 认证服务适配器
 *
 * 根据 DEPLOY_REGION 环境变量选择使用哪个认证服务提供商：
 * - CN（中国）：使用腾讯云 CloudBase + 微信登录
 * - INTL（国际）：使用 Supabase Auth + OAuth
 */

import { isChinaRegion, RegionConfig } from "@/lib/config/region";

/**
 * 用户接口（统一数据结构）
 */
export interface User {
  id: string;
  email?: string;
  name?: string;
  avatar?: string;
  phone?: string;
  createdAt?: Date;
  metadata?: Record<string, any>;
}

/**
 * 认证响应接口
 */
export interface AuthResponse {
  user: User | null;
  session?: any;
  error?: Error | null;
}

/**
 * 认证适配器接口
 */
export interface AuthAdapter {
  /**
   * 邮箱密码登录（仅国际版支持）
   */
  signInWithEmail?(email: string, password: string): Promise<AuthResponse>;

  /**
   * 邮箱密码注册（仅国际版支持）
   */
  signUpWithEmail?(email: string, password: string): Promise<AuthResponse>;

  /**
   * 微信登录（使用授权码，仅中国版支持）
   */
  signInWithWechat?(code: string): Promise<AuthResponse>;

  /**
   * 跳转到腾讯云默认登录页面（仅中国版支持）
   */
  toDefaultLoginPage?(redirectUrl?: string): Promise<void>;

  /**
   * OAuth 登录（仅国际版支持）
   */
  signInWithOAuth?(provider: "google" | "github" | "apple"): Promise<void>;

  /**
   * 登出
   */
  signOut(): Promise<void>;

  /**
   * 获取当前用户
   */
  getCurrentUser(): Promise<User | null>;

  /**
   * 检查是否已登录
   */
  isAuthenticated(): Promise<boolean>;
}

/**
 * Supabase 认证适配器（国际版）
 */
class SupabaseAuthAdapter implements AuthAdapter {
  private supabase: any;

  constructor() {
    // 动态导入 Supabase 客户端
    import("@/lib/supabase").then(({ supabase }) => {
      this.supabase = supabase;
    });
  }

  async signInWithEmail(
    email: string,
    password: string
  ): Promise<AuthResponse> {
    if (!this.supabase) {
      throw new Error("Supabase 客户端未初始化");
    }

    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { user: null, error };
    }

    return {
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name,
        avatar: data.user.user_metadata?.avatar_url,
        createdAt: new Date(data.user.created_at),
        metadata: data.user.user_metadata,
      },
      session: data.session,
    };
  }

  async signUpWithEmail(
    email: string,
    password: string
  ): Promise<AuthResponse> {
    if (!this.supabase) {
      throw new Error("Supabase 客户端未初始化");
    }

    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      return { user: null, error };
    }

    return {
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.name,
            avatar: data.user.user_metadata?.avatar_url,
            createdAt: new Date(data.user.created_at),
            metadata: data.user.user_metadata,
          }
        : null,
      session: data.session,
    };
  }

  async signInWithOAuth(
    provider: "google" | "github" | "apple"
  ): Promise<void> {
    if (!this.supabase) {
      throw new Error("Supabase 客户端未初始化");
    }

    await this.supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  async signOut(): Promise<void> {
    if (!this.supabase) {
      throw new Error("Supabase 客户端未初始化");
    }

    await this.supabase.auth.signOut();
  }

  async getCurrentUser(): Promise<User | null> {
    if (!this.supabase) {
      return null;
    }

    const {
      data: { user },
    } = await this.supabase.auth.getUser();

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name,
      avatar: user.user_metadata?.avatar_url,
      createdAt: new Date(user.created_at),
      metadata: user.user_metadata,
    };
  }

  async isAuthenticated(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return user !== null;
  }
}

/**
 * 创建认证适配器
 */
function createAuthAdapter(): AuthAdapter {
  if (isChinaRegion()) {
    console.log("🔐 使用 CloudBase 认证（中国版）");
    return new CloudBaseAuthAdapter();
  } else {
    console.log("🔐 使用 Supabase 认证（国际版）");
    return new SupabaseAuthAdapter();
  }
}

/**
 * 全局认证实例（单例模式）
 */
let authInstance: AuthAdapter | null = null;

/**
 * 获取认证实例
 */
export function getAuth(): AuthAdapter {
  if (!authInstance) {
    authInstance = createAuthAdapter();
  }
  return authInstance;
}

/**
 * 检查当前区域是否支持某个认证功能
 */
export function isAuthFeatureSupported(
  feature: keyof typeof RegionConfig.auth.features
): boolean {
  return RegionConfig.auth.features[feature] || false;
}

/**
 * CloudBase 认证适配器（中国版）
 */
class CloudBaseAuthAdapter implements AuthAdapter {
  constructor() {
    console.log("🔐 CloudBase 认证适配器（国内版）已初始化");
  }

  async signInWithWechat(code: string): Promise<AuthResponse> {
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login_wechat", code }),
      });
      const data = await response.json();
      return data.success
        ? { user: data.user }
        : { user: null, error: new Error(data.message) };
    } catch (error) {
      return { user: null, error: error as Error };
    }
  }

  async signInWithEmail(
    email: string,
    password: string
  ): Promise<AuthResponse> {
    try {
      // 通过 API 端点进行认证，而不是直接调用 Node.js 函数
      if (typeof window === "undefined") {
        // 服务器端：直接调用 cloudbase-auth 函数
        const { cloudbaseSignInWithEmail } = await import(
          "@/lib/auth/cloudbase-auth"
        );
        const result = await cloudbaseSignInWithEmail(email, password);
        if (result.success && result.user) {
          return {
            user: {
              id: result.user._id || "",
              email: result.user.email,
              name: result.user.name,
              avatar: undefined,
              phone: undefined,
              createdAt: result.user.createdAt
                ? new Date(result.user.createdAt)
                : undefined,
              metadata: { pro: result.user.pro, region: result.user.region },
            },
            session: result.token ? { access_token: result.token } : undefined,
          };
        }
        return { user: null, error: new Error(result.message) };
      } else {
        // 客户端：通过 fetch 调用 API 端点
        const response = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "login", email, password }),
        });
        const data = await response.json();
        if (data.success && data.user) {
          return {
            user: {
              id: data.user.id || data.user.userId || "",
              email: data.user.email,
              name: data.user.name,
              avatar: data.user.avatar,
              phone: undefined,
              createdAt: data.user.createdAt
                ? new Date(data.user.createdAt)
                : undefined,
              metadata: { pro: data.user.pro, region: data.user.region },
            },
            session: data.token ? { access_token: data.token } : undefined,
          };
        }
        return { user: null, error: new Error(data.message) };
      }
    } catch (error) {
      return { user: null, error: error as Error };
    }
  }

  async signUpWithEmail(
    email: string,
    password: string
  ): Promise<AuthResponse> {
    try {
      // 通过 API 端点进行认证，而不是直接调用 Node.js 函数
      if (typeof window === "undefined") {
        // 服务器端：直接调用 cloudbase-auth 函数
        const { cloudbaseSignUpWithEmail } = await import(
          "@/lib/auth/cloudbase-auth"
        );
        const result = await cloudbaseSignUpWithEmail(email, password);
        if (result.success && result.user) {
          return {
            user: {
              id: result.user._id || "",
              email: result.user.email,
              name: result.user.name,
              avatar: undefined,
              phone: undefined,
              createdAt: result.user.createdAt
                ? new Date(result.user.createdAt)
                : undefined,
              metadata: { pro: result.user.pro, region: result.user.region },
            },
            session: result.token ? { access_token: result.token } : undefined,
          };
        }
        return { user: null, error: new Error(result.message) };
      } else {
        // 客户端：通过 fetch 调用 API 端点
        const response = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "signup", email, password }),
        });
        const data = await response.json();
        if (data.success && data.user) {
          return {
            user: {
              id: data.user.id || data.user.userId || "",
              email: data.user.email,
              name: data.user.name,
              avatar: data.user.avatar,
              phone: undefined,
              createdAt: data.user.createdAt
                ? new Date(data.user.createdAt)
                : undefined,
              metadata: { pro: data.user.pro, region: data.user.region },
            },
            session: data.token ? { access_token: data.token } : undefined,
          };
        }
        return { user: null, error: new Error(data.message) };
      }
    } catch (error) {
      return { user: null, error: error as Error };
    }
  }

  async toDefaultLoginPage(redirectUrl?: string): Promise<void> {
    throw new Error("Not implemented");
  }

  async signOut(): Promise<void> {
    console.log("✅ 登出");
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth-token");
      localStorage.removeItem("auth-user");
      localStorage.removeItem("auth-logged-in");
    }
  }

  async getCurrentUser(): Promise<User | null> {
    // 尝试从 localStorage 获取用户信息（客户端）
    if (typeof window !== "undefined") {
      const userJson = localStorage.getItem("auth-user");
      const token = localStorage.getItem("auth-token");

      if (userJson && token) {
        try {
          const user = JSON.parse(userJson);
          return {
            id: user.id || user.userId || "",
            email: user.email,
            name: user.name,
            avatar: user.avatar,
            phone: undefined,
            createdAt: user.createdAt ? new Date(user.createdAt) : undefined,
            metadata: { pro: user.pro, region: user.region },
          };
        } catch (e) {
          console.error("Failed to parse user from localStorage:", e);
        }
      }
    }

    // 尝试从服务器获取用户信息
    try {
      const response = await fetch("/api/auth/me");
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          return {
            id: data.user.id || data.user.userId || "",
            email: data.user.email,
            name: data.user.name,
            avatar: data.user.avatar,
            phone: undefined,
            createdAt: data.user.createdAt
              ? new Date(data.user.createdAt)
              : undefined,
            metadata: { pro: data.user.pro, region: data.user.region },
          };
        }
      }
    } catch (error) {
      console.error("Failed to fetch current user:", error);
    }

    return null;
  }

  async isAuthenticated(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return user !== null;
  }
}
