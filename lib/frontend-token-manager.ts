/**
 * 前端 Token 管理器
 * 统一管理 CloudBase 和 Supabase 的 Token 存储和获取
 * 现已集成 P0 的 auth-state-manager，支持 P1 的自动刷新
 */

import {
  getValidAccessToken,
  getStoredAuthState,
  clearAuthState,
} from "@/lib/auth-state-manager";
import { isChinaRegion } from "@/lib/config/region";
import { supabase } from "@/lib/supabase";

class TokenManager {
  private static instance: TokenManager;
  private refreshTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.setupAutoRefresh();
  }

  static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  /**
   * 保存 Token（已废弃，由 saveAuthState() 替代）
   * 保留此方法用于向后兼容
   */
  saveToken(token: string, expiresIn: number = 3600000): void {
    console.warn(
      "⚠️  [TokenManager] saveToken() 已废弃，应使用 saveAuthState() 代替"
    );
  }

  /**
   * 获取有效的 Token（自动检查过期和区域匹配）
   * 现在直接从 auth-state-manager.ts 获取
   * 支持 P1 的自动刷新机制
   * @returns Token 字符串，或 null 如果无效/过期
   */
  async getValidToken(): Promise<string | null> {
    try {
      if (typeof window === "undefined") {
        return null;
      }

      // 根据区域选择不同的token获取方式
      if (isChinaRegion()) {
        // CN：从 CloudBase 的 auth-state-manager 获取
        const token = await getValidAccessToken();
        if (!token) {
          console.warn("⚠️  [TokenManager] 无法获取有效的 Token");
          return null;
        }
        return token;
      } else {
        // INTL：从 Supabase session 获取
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.warn("⚠️  [TokenManager] Supabase getSession 失败:", error);
          return null;
        }

        const token = data?.session?.access_token;
        if (!token) {
          console.warn("⚠️  [TokenManager] 无法从 Supabase 获取 Token");
          return null;
        }

        return token;
      }
    } catch (error) {
      console.error("❌ [TokenManager] 获取 Token 失败:", error);
      return null;
    }
  }

  /**
   * 获取 Token 的有效时间（毫秒）
   */
  getTokenRemainingTime(): number {
    try {
      if (typeof window === "undefined") {
        return 0;
      }

      if (isChinaRegion()) {
        // CN：从 CloudBase 的 auth-state-manager 读取
        const authState = getStoredAuthState();
        if (!authState) {
          return 0;
        }

        const expiresAt =
          authState.savedAt + authState.tokenMeta.accessTokenExpiresIn * 1000;
        const remaining = expiresAt - Date.now();
        return Math.max(0, remaining);
      } else {
        // INTL：从 Supabase 的 localStorage 读取
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!supabaseUrl) return 0;

        const projectId = supabaseUrl.split("//")[1]?.split(".")[0];
        if (!projectId) return 0;

        const authKey = `sb-${projectId}-auth-token`;
        const stored = localStorage.getItem(authKey);
        if (!stored) return 0;

        try {
          const authData = JSON.parse(stored);
          const session = authData?.session;
          if (!session?.expires_at) return 0;

          const expiresAt = session.expires_at * 1000; // 转换为毫秒
          const remaining = expiresAt - Date.now();
          return Math.max(0, remaining);
        } catch (e) {
          return 0;
        }
      }
    } catch (error) {
      return 0;
    }
  }

  /**
   * 获取认证 Header（异步版本）
   * @returns { Authorization: 'Bearer xxx' } 或 null
   */
  async getAuthHeaderAsync(): Promise<Record<string, string> | null> {
    const token = await this.getValidToken();
    if (!token) return null;
    return { Authorization: `Bearer ${token}` };
  }

  /**
   * 获取认证 Header（同步版本）
   * 注：仅从 localStorage 读取，不触发刷新
   * @returns { Authorization: 'Bearer xxx' } 或 null
   */
  getAuthHeader(): Record<string, string> | null {
    if (typeof window === "undefined") return null;

    try {
      if (isChinaRegion()) {
        // CN：从 CloudBase 的 auth-state-manager 读取
        const authState = getStoredAuthState();
        if (!authState?.accessToken) {
          return null;
        }
        return { Authorization: `Bearer ${authState.accessToken}` };
      } else {
        // INTL：从 Supabase 的 localStorage 读取
        // Supabase 使用 sb-<project>-auth-token 作为键
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!supabaseUrl) return null;

        // 提取项目ID从URL (例如 https://xxx.supabase.co -> xxx)
        const projectId = supabaseUrl.split("//")[1]?.split(".")[0];
        if (!projectId) return null;

        const authKey = `sb-${projectId}-auth-token`;
        const stored = localStorage.getItem(authKey);
        if (!stored) return null;

        try {
          const authData = JSON.parse(stored);
          const token = authData?.session?.access_token;
          if (!token) return null;

          return { Authorization: `Bearer ${token}` };
        } catch (e) {
          return null;
        }
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * 检查 Token 是否有效（同步检查）
   */
  isTokenValid(): boolean {
    if (typeof window === "undefined") return false;

    try {
      if (isChinaRegion()) {
        // CN：从 CloudBase 的 auth-state-manager 检查
        const authState = getStoredAuthState();
        if (!authState) return false;

        const expiresAt =
          authState.savedAt + authState.tokenMeta.accessTokenExpiresIn * 1000;
        return Date.now() < expiresAt;
      } else {
        // INTL：从 Supabase 的 localStorage 检查
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!supabaseUrl) return false;

        const projectId = supabaseUrl.split("//")[1]?.split(".")[0];
        if (!projectId) return false;

        const authKey = `sb-${projectId}-auth-token`;
        const stored = localStorage.getItem(authKey);
        if (!stored) return false;

        try {
          const authData = JSON.parse(stored);
          const session = authData?.session;
          if (!session?.access_token) return false;

          // 检查 token 是否过期
          if (session.expires_at) {
            const expiresAt = session.expires_at * 1000; // 转换为毫秒
            return Date.now() < expiresAt;
          }

          return true;
        } catch (e) {
          return false;
        }
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * 清除 Token
   */
  clearToken(): void {
    try {
      if (typeof window !== "undefined") {
        if (isChinaRegion()) {
          // CN：清除 CloudBase 的 auth-state
          clearAuthState();
        } else {
          // INTL：清除 Supabase 的 auth token
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          if (supabaseUrl) {
            const projectId = supabaseUrl.split("//")[1]?.split(".")[0];
            if (projectId) {
              const authKey = `sb-${projectId}-auth-token`;
              localStorage.removeItem(authKey);
            }
          }
        }
        console.log("🗑️  [TokenManager] Token 已清除");
      }
    } catch (error) {
      console.error("❌ [TokenManager] 清除 Token 失败:", error);
    }
  }

  /**
   * 设置自动刷新（在 Token 即将过期时）
   * 仅用于调试/监控，实际刷新由 P2 的 TokenPreloader 处理
   */
  private setupAutoRefresh(): void {
    if (typeof window === "undefined") return;

    // 每 30 秒检查一次 Token 状态
    this.refreshTimer = setInterval(() => {
      try {
        let expiresAt: number = 0;

        if (isChinaRegion()) {
          // CN：从 CloudBase 的 auth-state-manager 检查
          const authState = getStoredAuthState();
          if (!authState) return;
          expiresAt =
            authState.savedAt + authState.tokenMeta.accessTokenExpiresIn * 1000;
        } else {
          // INTL：从 Supabase 的 localStorage 检查
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          if (!supabaseUrl) return;

          const projectId = supabaseUrl.split("//")[1]?.split(".")[0];
          if (!projectId) return;

          const authKey = `sb-${projectId}-auth-token`;
          const stored = localStorage.getItem(authKey);
          if (!stored) return;

          try {
            const authData = JSON.parse(stored);
            const session = authData?.session;
            if (!session?.expires_at) return;

            expiresAt = session.expires_at * 1000; // 转换为毫秒
          } catch (e) {
            return;
          }
        }

        const remainingTime = expiresAt - Date.now();

        // 如果少于 5 分钟，发出警告事件
        if (remainingTime < 300000 && remainingTime > 0) {
          const event = new CustomEvent("token-expiring-soon", {
            detail: { remainingTime },
          });
          window.dispatchEvent(event);
        }

        // 如果过期，清除
        if (remainingTime <= 0) {
          this.clearToken();
          const event = new CustomEvent("token-expired");
          window.dispatchEvent(event);
        }
      } catch (error) {
        // 忽略错误
      }
    }, 30000); // 30 秒检查一次
  }

  /**
   * 销毁管理器（清除定时器）
   */
  destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * 获取存储的认证状态（用于调试）
   */
  getStoredAuthState() {
    try {
      if (typeof window === "undefined") return null;
      return getStoredAuthState();
    } catch {
      return null;
    }
  }
}

export const tokenManager = TokenManager.getInstance();

/**
 * 监听 Token 过期事件（组件可以订阅）
 */
export function onTokenExpiringsSoon(
  callback: (remainingTime: number) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = (e: Event) => {
    if (e instanceof CustomEvent) {
      callback(e.detail.remainingTime);
    }
  };

  window.addEventListener("token-expiring-soon", handler);

  return () => {
    window.removeEventListener("token-expiring-soon", handler);
  };
}

export function onTokenExpired(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => {
    callback();
  };

  window.addEventListener("token-expired", handler);

  return () => {
    window.removeEventListener("token-expired", handler);
  };
}
