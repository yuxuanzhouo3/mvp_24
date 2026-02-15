/**
 * 前端认证客户端
 *
 * 根据 DEPLOY_REGION 环境变量提供统一的认证接口
 * 这个文件应该被前端组件使用，而不是直接使用 supabase 客户端
 */

import { isChinaRegion } from "@/lib/config/region";
import { getAuth } from "@/lib/auth/adapter";

/**
 * 统一的用户类型
 */
export interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, any>;
}

/**
 * 统一的会话类型
 */
export interface AuthSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: AuthUser;
}

/**
 * 统一的认证响应类型
 */
export interface AuthResponse {
  data: {
    user: AuthUser | null;
    session: AuthSession | null;
  };
  error: Error | null;
}

/**
 * 统一的认证客户端接口
 */
export interface AuthClient {
  /**
   * 邮箱密码登录
   */
  signInWithPassword(params: {
    email: string;
    password: string;
  }): Promise<AuthResponse>;

  /**
   * 邮箱密码注册
   */
  signUp(params: { email: string; password: string }): Promise<AuthResponse>;

  /**
   * OAuth 登录
   */
  signInWithOAuth(params: {
    provider: string;
    options?: any;
  }): Promise<{ data: any; error: Error | null }>;

  /**
   * 跳转到腾讯云默认登录页面（仅中国版支持）
   */
  toDefaultLoginPage?(redirectUrl?: string): Promise<void>;

  /**
   * 更新用户信息
   */
  updateUser(params: {
    password?: string;
    email?: string;
    data?: Record<string, any>;
  }): Promise<{ data: { user: AuthUser | null }; error: Error | null }>;

  /**
   * 发送 OTP
   */
  signInWithOtp(params: {
    email: string;
    options?: any;
  }): Promise<{ error: Error | null }>;

  /**
   * 验证 OTP
   */
  verifyOtp(params: {
    email: string;
    token: string;
    type: string;
  }): Promise<AuthResponse>;

  /**
   * 登出
   */
  signOut(): Promise<{ error: Error | null }>;

  /**
   * 获取当前用户
   */
  getUser(): Promise<{ data: { user: AuthUser | null }; error: Error | null }>;

  /**
   * 获取当前会话
   */
  getSession(): Promise<{
    data: { session: AuthSession | null };
    error: Error | null;
  }>;

  /**
   * 监听认证状态变化
   */
  onAuthStateChange(
    callback: (event: string, session: AuthSession | null) => void
  ): { data: { subscription: { unsubscribe: () => void } } };
}

/**
 * Supabase 认证客户端（国际版）
 */
class SupabaseAuthClient implements AuthClient {
  private supabase: any;
  private supabasePromise: Promise<any> | null = null;

  constructor() {
    // 立即导入并缓存Promise，避免多次导入
    this.supabasePromise = import("@/lib/supabase").then(({ supabase }) => {
      this.supabase = supabase;
      return supabase;
    });
  }

  private async ensureSupabase() {
    if (this.supabase) {
      return this.supabase;
    }
    if (this.supabasePromise) {
      return await this.supabasePromise;
    }
    throw new Error("Supabase client initialization failed");
  }

  /**
   * 🔑 显式刷新用户完整信息并缓存
   * 按需调用，仅在以下时机调用：
   * - 用户登录成功
   * - 支付成功
   * - 用户保存个人资料
   * - 用户手动刷新
   */
  async refreshUserProfile(): Promise<void> {
    try {
      console.log("🔄 [Supabase] 主动刷新用户信息...");
      const response = await fetch("/api/profile");

      if (response.ok) {
        const fullProfile = await response.json();
        const {
          saveSupabaseUserCache,
        } = await import("@/lib/auth-state-manager-intl");
        // 🔒 安全过滤会在 saveSupabaseUserCache 内部自动进行
        saveSupabaseUserCache(fullProfile);
        console.log("✅ [Supabase] 用户信息刷新成功");
      } else {
        console.warn(
          "⚠️ [Supabase] 刷新用户信息失败:",
          response.status
        );
      }
    } catch (error) {
      console.warn("⚠️ [Supabase] 刷新用户信息失败:", error);
    }
  }

  async signInWithPassword(params: {
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    try {
      const supabase = await this.ensureSupabase();
      const result = await supabase.auth.signInWithPassword(params);

      // ✅ 登录成功后，显式刷新完整用户信息并缓存
      if (result.data.user && !result.error) {
        await this.refreshUserProfile();
      }

      return result;
    } catch (error) {
      return {
        data: { user: null, session: null },
        error:
          error instanceof Error
            ? error
            : new Error("Supabase client not initialized"),
      };
    }
  }

  async signUp(params: {
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    try {
      const supabase = await this.ensureSupabase();
      return await supabase.auth.signUp(params);
    } catch (error) {
      return {
        data: { user: null, session: null },
        error:
          error instanceof Error
            ? error
            : new Error("Supabase client not initialized"),
      };
    }
  }

  async signInWithOAuth(params: {
    provider: string;
    options?: any;
  }): Promise<{ data: any; error: Error | null }> {
    try {
      const supabase = await this.ensureSupabase();
      return await supabase.auth.signInWithOAuth(params);
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error("Supabase client not initialized"),
      };
    }
  }

  async updateUser(params: {
    password?: string;
    email?: string;
    data?: Record<string, any>;
  }): Promise<{ data: { user: AuthUser | null }; error: Error | null }> {
    try {
      const supabase = await this.ensureSupabase();
      return await supabase.auth.updateUser(params);
    } catch (error) {
      return {
        data: { user: null },
        error:
          error instanceof Error
            ? error
            : new Error("Supabase client not initialized"),
      };
    }
  }

  async signInWithOtp(params: {
    email: string;
    options?: any;
  }): Promise<{ error: Error | null }> {
    try {
      const supabase = await this.ensureSupabase();
      return await supabase.auth.signInWithOtp(params);
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error
            : new Error("Supabase client not initialized"),
      };
    }
  }

  async verifyOtp(params: {
    email: string;
    token: string;
    type: string;
  }): Promise<AuthResponse> {
    try {
      const supabase = await this.ensureSupabase();
      return await supabase.auth.verifyOtp(params);
    } catch (error) {
      return {
        data: { user: null, session: null },
        error:
          error instanceof Error
            ? error
            : new Error("Supabase client not initialized"),
      };
    }
  }

  async signOut(): Promise<{ error: Error | null }> {
    try {
      const supabase = await this.ensureSupabase();
      const result = await supabase.auth.signOut();

      // ✅ 登出时清除缓存
      const { clearSupabaseUserCache } = await import(
        "@/lib/auth-state-manager-intl"
      );
      clearSupabaseUserCache();

      return result;
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error
            : new Error("Supabase client not initialized"),
      };
    }
  }

  async getUser(): Promise<{
    data: { user: AuthUser | null };
    error: Error | null;
  }> {
    try {
      // ✅ 优先从缓存读取
      const { getSupabaseUserCache } = await import(
        "@/lib/auth-state-manager-intl"
      );
      const cachedUser = getSupabaseUserCache();

      if (cachedUser) {
        console.log("📦 [Supabase] 使用缓存的用户信息");
        return {
          data: {
            user: {
              id: cachedUser.id,
              email: cachedUser.email,
              user_metadata: {
                full_name: cachedUser.name,
                avatar_url: cachedUser.avatar,
              },
            },
          },
          error: null,
        };
      }

      // ✅ 缓存 miss，回退到 Supabase session 基本信息
      // 🔑 关键改进：不自动调用 /api/profile，避免频繁请求
      console.log("🔍 [Supabase] 缓存未命中，使用 Supabase session 基本信息");
      const supabase = await this.ensureSupabase();
      const result = await supabase.auth.getUser();

      // ⚠️ 不再自动刷新完整信息
      // 只在明确的时机刷新：登录、支付成功、保存个人资料

      return result;
    } catch (error) {
      return {
        data: { user: null },
        error:
          error instanceof Error
            ? error
            : new Error("Supabase client not initialized"),
      };
    }
  }

  async getSession(): Promise<{
    data: { session: AuthSession | null };
    error: Error | null;
  }> {
    try {
      const supabase = await this.ensureSupabase();
      return await supabase.auth.getSession();
    } catch (error) {
      return {
        data: { session: null },
        error:
          error instanceof Error
            ? error
            : new Error("Supabase client not initialized"),
      };
    }
  }

  onAuthStateChange(
    callback: (event: string, session: AuthSession | null) => void
  ): { data: { subscription: { unsubscribe: () => void } } } {
    if (!this.supabase) {
      return {
        data: { subscription: { unsubscribe: () => {} } },
      };
    }
    return this.supabase.auth.onAuthStateChange(callback);
  }
}

/**
 * CloudBase 认证客户端（中国版）
 */
class CloudBaseAuthClient implements AuthClient {
  async signInWithPassword(params: {
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    // 中国版支持邮箱密码登录 - 通过 API 调用后端
    try {
      const msg1 = `🔐 [signInWithPassword] 尝试登录: ${params.email}`;
      console.log(msg1);
      if (typeof window !== "undefined") {
        localStorage.setItem("DEBUG_LOGIN_STEP", "1_signin_start");
      }

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: params.email,
          password: params.password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const msg2 = `🔐 [signInWithPassword] 登录失败: ${errorData.error}`;
        console.error(msg2);
        if (typeof window !== "undefined") {
          localStorage.setItem("DEBUG_LOGIN_ERROR", msg2);
        }
        return {
          data: { user: null, session: null },
          error: new Error(
            errorData.details || errorData.error || "Login failed"
          ),
        };
      }

      const data = await response.json();
      const msg3 = `🔐 [signInWithPassword] 登录成功，返回数据: accessToken=${!!data.accessToken}, userId=${
        data.user?.id
      }`;
      console.log(msg3);
      if (typeof window !== "undefined") {
        localStorage.setItem("DEBUG_LOGIN_STEP", "2_signin_success");
        localStorage.setItem(
          "DEBUG_LOGIN_RESPONSE",
          JSON.stringify({
            hasAccessToken: !!data.accessToken,
            hasRefreshToken: !!data.refreshToken,
            userId: data.user?.id,
            hasTokenMeta: !!data.tokenMeta,
          })
        );
      }

      // P0: 原子保存认证状态（新格式）
      if (data.accessToken && data.user && typeof window !== "undefined") {
        try {
          // 动态导入 saveAuthState 函数
          const { saveAuthState } = await import("@/lib/auth-state-manager");

          const msg4 = `🔐 [signInWithPassword] 原子保存认证状态: accessToken长度=${data.accessToken.length}, userId=${data.user.id}`;
          console.log(msg4);

          // saveAuthState 是同步函数，不需要 await，但保留以兼容旧代码
          saveAuthState(
            data.accessToken,
            data.refreshToken || data.accessToken,
            data.user,
            data.tokenMeta || {
              accessTokenExpiresIn: 3600,
              refreshTokenExpiresIn: 604800,
            }
          );

          localStorage.setItem("DEBUG_LOGIN_STEP", "3_auth_state_saved");
        } catch (error) {
          const msg4err = `🔐 [signInWithPassword] 保存认证状态失败: ${error}`;
          console.error(msg4err);
          localStorage.setItem("DEBUG_LOGIN_ERROR", msg4err);

          // 即使失败也回退到旧格式
          if (data.accessToken && data.user) {
            localStorage.setItem("auth-token", data.accessToken);
            localStorage.setItem("auth-user", JSON.stringify(data.user));
            localStorage.setItem("auth-logged-in", "true");
            localStorage.setItem("DEBUG_LOGIN_STEP", "3_token_saved_fallback");
          }
        }
      } else if (typeof window !== "undefined") {
        // 备用：旧格式支持（如果 API 返回了旧格式）
        const token = data.token || data.session?.access_token;
        if (token) {
          localStorage.setItem("auth-token", token);
          if (data.user) {
            localStorage.setItem("auth-user", JSON.stringify(data.user));
          }
          localStorage.setItem("auth-logged-in", "true");
          localStorage.setItem("DEBUG_LOGIN_STEP", "3_token_saved_legacy");
        }
      }

      // 确保返回的格式符合 AuthResponse 要求
      const accessToken =
        data.accessToken || data.token || data.session?.access_token;
      return {
        data: {
          user: data.user,
          session:
            data.session ||
            (accessToken
              ? { access_token: accessToken, user: data.user }
              : null),
        },
        error: null,
      };
    } catch (error) {
      const msg5 = `🔐 [signInWithPassword] 异常: ${error}`;
      console.error(msg5);
      if (typeof window !== "undefined") {
        localStorage.setItem("DEBUG_LOGIN_ERROR", msg5);
      }
      return {
        data: { user: null, session: null },
        error: error as Error,
      };
    }
  }

  async signUp(params: {
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    return {
      data: { user: null, session: null },
      error: new Error(
        "Sign up requires OTP flow in China region. Use /auth page signup flow."
      ),
    };
  }

  async signInWithOAuth(params: {
    provider: string;
    options?: any;
  }): Promise<{ data: any; error: Error | null }> {
    // 中国版目前只支持微信登录
    if (params.provider === "wechat") {
      // 使用腾讯云官方登录流程
      this.toDefaultLoginPage?.(params.options?.redirectTo);
      return { data: null, error: null };
    }
    return {
      data: null,
      error: new Error(
        "Only WeChat OAuth is supported in China region. Please use WeChat login."
      ),
    };
  }

  /**
   * 跳转到腾讯云默认登录页面
   */
  async toDefaultLoginPage(redirectUrl?: string): Promise<void> {
    // 使用适配器进行登录跳转
    const adapter = getAuth();
    if (adapter.toDefaultLoginPage) {
      await adapter.toDefaultLoginPage(redirectUrl);
    } else {
      throw new Error("toDefaultLoginPage is not supported in this region");
    }
  }

  async updateUser(params: {
    password?: string;
    email?: string;
    data?: Record<string, any>;
  }): Promise<{ data: { user: AuthUser | null }; error: Error | null }> {
    // 中国版支持用户信息更新 - 通过 API 调用后端
    try {
      const { getValidAccessToken } = await import("@/lib/auth-state-manager");
      const token = await getValidAccessToken();
      const response = await fetch("/api/auth/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          data: { user: null },
          error: new Error(
            errorData.details || errorData.error || "Update failed"
          ),
        };
      }

      const data = await response.json();
      return {
        data: { user: data.user },
        error: null,
      };
    } catch (error) {
      return {
        data: { user: null },
        error: error as Error,
      };
    }
  }

  async signInWithOtp(params: {
    email: string;
    options?: any;
  }): Promise<{ error: Error | null }> {
    return {
      error: new Error(
        "OTP is not supported in China region. Please use WeChat login."
      ),
    };
  }

  async verifyOtp(params: {
    email: string;
    token: string;
    type: string;
  }): Promise<AuthResponse> {
    return {
      data: { user: null, session: null },
      error: new Error(
        "OTP is not supported in China region. Please use WeChat login."
      ),
    };
  }

  async signOut(): Promise<{ error: Error | null }> {
    // 通过 API 调用登出
    try {
      const { getValidAccessToken } = await import("@/lib/auth-state-manager");
      const token = await getValidAccessToken();
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok && response.status !== 401) {
        throw new Error("Logout failed");
      }

      // P0: 原子清除认证状态
      if (typeof window !== "undefined") {
        const { clearAuthState } = await import("@/lib/auth-state-manager");
        await clearAuthState();

        // 清除调试信息
        const keysToDelete: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith("DEBUG_")) {
            keysToDelete.push(key);
          }
        }
        keysToDelete.forEach((key) => localStorage.removeItem(key));
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }

  async getUser(): Promise<{
    data: { user: AuthUser | null };
    error: Error | null;
  }> {
    // 使用新的认证状态管理器获取用户信息
    try {
      const { getStoredAuthState } = await import("@/lib/auth-state-manager");
      const authState = getStoredAuthState();

      if (!authState || !authState.user) {
        console.log("📋 [getUser] 没有找到认证状态");
        return { data: { user: null }, error: null };
      }

      // 转换为AuthUser格式
      const authUser: AuthUser = {
        id: authState.user.id,
        email: authState.user.email,
        user_metadata: {
          full_name:
            authState.user.name ||
            authState.user.email?.split("@")[0] ||
            "用户",
          avatar_url: authState.user.avatar,
        },
      };

      console.log("📋 [getUser] 成功获取用户:", authUser.id);
      return {
        data: { user: authUser },
        error: null,
      };
    } catch (error) {
      console.error("📋 [getUser] 异常:", error);
      return { data: { user: null }, error: error as Error };
    }
  }

  async getSession(): Promise<{
    data: { session: AuthSession | null };
    error: Error | null;
  }> {
    const readTokenFromStorage = async (): Promise<string | null> => {
      if (typeof window === "undefined") return null;

      try {
        const { getStoredAuthState } = await import("@/lib/auth-state-manager");
        const authState = getStoredAuthState();
        if (authState?.accessToken) {
          return authState.accessToken;
        }
      } catch (error) {
        console.warn("📋 [getSession] 获取认证状态失败:", error);
      }

      return localStorage.getItem("auth-token");
    };

    // 优先使用新的认证状态管理器
    if (typeof window !== "undefined") {
      try {
        const { getStoredAuthState } = await import("@/lib/auth-state-manager");
        const authState = getStoredAuthState();

        if (authState && authState.user) {
          console.log(
            "📋 [getSession] 使用新的认证状态管理器，找到用户:",
            authState.user.id
          );

          // 转换为AuthUser格式
          const authUser: AuthUser = {
            id: authState.user.id,
            email: authState.user.email,
            user_metadata: {
              full_name:
                authState.user.name ||
                authState.user.email?.split("@")[0] ||
                "用户",
              avatar_url: authState.user.avatar,
            },
          };

          return {
            data: {
              session: {
                access_token: authState.accessToken,
                user: authUser,
              },
            },
            error: null,
          };
        }
      } catch (error) {
        console.warn("📋 [getSession] 新认证状态管理器不可用:", error);
      }
    }

    // 回退到旧的 localStorage 检查方式
    if (typeof window !== "undefined") {
      const isLoggedIn = localStorage.getItem("auth-logged-in");
      if (isLoggedIn === "true") {
        const cachedUser = localStorage.getItem("auth-user");
        if (cachedUser) {
          try {
            const userData = JSON.parse(cachedUser);
            console.log(
              "📋 [getSession] 检测到登录标志，使用缓存的用户信息:",
              userData.id
            );

            // 转换为AuthUser格式
            const authUser: AuthUser = {
              id: userData.id,
              email: userData.email,
              user_metadata: {
                full_name:
                  userData.name || userData.email?.split("@")[0] || "用户",
                avatar_url: userData.avatar,
              },
            };

            const token = await readTokenFromStorage();
            if (token) {
              return {
                data: {
                  session: {
                    access_token: token,
                    user: authUser,
                  },
                },
                error: null,
              };
            }

            console.warn(
              "📋 [getSession] 检测到登录标志但缺少有效 token，返回空会话"
            );
          } catch (parseError) {
            console.error("📋 [getSession] 解析缓存用户信息失败:", parseError);
          }
        }
      }
    }

    // CloudBase 使用 token-based session
    const userResult = await this.getUser();
    if (userResult.data.user) {
      // 优先使用新的认证状态管理器获取 token
      const token = await readTokenFromStorage();
      console.log(
        "📋 [getSession] 从本地存储获取 token:",
        token ? "成功" : "失败"
      );

      if (!token) {
        console.warn("📋 [getSession] 用户信息存在但 token 缺失，返回空会话");
        return { data: { session: null }, error: null };
      }

      return {
        data: {
          session: {
            access_token: token,
            user: userResult.data.user,
          },
        },
        error: null,
      };
    }

    // 如果getUser失败，尝试从缓存获取用户信息
    if (typeof window !== "undefined") {
      const cachedUser = localStorage.getItem("auth-user");
      if (cachedUser) {
        try {
          const userData = JSON.parse(cachedUser);
          console.log(
            "📋 [getSession] 使用缓存的用户信息创建session:",
            userData.id
          );

          // 转换为AuthUser格式
          const authUser: AuthUser = {
            id: userData.id,
            email: userData.email,
            user_metadata: {
              full_name:
                userData.name || userData.email?.split("@")[0] || "用户",
              avatar_url: userData.avatar,
            },
          };

          const token = await readTokenFromStorage();
          if (token) {
            return {
              data: {
                session: {
                  access_token: token,
                  user: authUser,
                },
              },
              error: null,
            };
          }

          console.warn("📋 [getSession] 仅有缓存用户，无有效 token，返回空会话");
        } catch (parseError) {
          console.error("📋 [getSession] 解析缓存用户信息失败:", parseError);
        }
      }
    }

    return { data: { session: null }, error: null };
  }

  onAuthStateChange(
    callback: (event: string, session: AuthSession | null) => void
  ): { data: { subscription: { unsubscribe: () => void } } } {
    // CloudBase 不支持实时状态变化监听
    // 返回空订阅
    return {
      data: {
        subscription: {
          unsubscribe: () => {},
        },
      },
    };
  }
}

/**
 * 创建认证客户端实例
 */
function createAuthClient(): AuthClient {
  if (isChinaRegion()) {
    console.log("🔐 使用 CloudBase 认证客户端（中国版）");
    return new CloudBaseAuthClient();
  } else {
    console.log("🔐 使用 Supabase 认证客户端（国际版）");
    return new SupabaseAuthClient();
  }
}

/**
 * 全局认证客户端实例（单例）
 */
let authClientInstance: AuthClient | null = null;

/**
 * 获取认证客户端
 *
 * 在前端组件中使用这个客户端代替直接使用 supabase
 *
 * @example
 * ```ts
 * import { getAuthClient } from "@/lib/auth/client";
 *
 * const authClient = getAuthClient();
 * const { data, error } = await authClient.signInWithPassword({
 *   email,
 *   password
 * });
 * ```
 */
export function getAuthClient(): AuthClient {
  if (!authClientInstance) {
    authClientInstance = createAuthClient();
  }
  return authClientInstance;
}

/**
 * 认证客户端的命名空间对象
 * 提供类似 supabase.auth 的 API
 */
export const auth = {
  get client() {
    return getAuthClient();
  },
  signInWithPassword: (params: { email: string; password: string }) =>
    getAuthClient().signInWithPassword(params),
  signUp: (params: { email: string; password: string }) =>
    getAuthClient().signUp(params),
  signInWithOtp: (params: { email: string; options?: any }) =>
    getAuthClient().signInWithOtp(params),
  verifyOtp: (params: { email: string; token: string; type: string }) =>
    getAuthClient().verifyOtp(params),
  signOut: () => getAuthClient().signOut(),
  getUser: () => getAuthClient().getUser(),
  getSession: () => getAuthClient().getSession(),
  onAuthStateChange: (
    callback: (event: string, session: AuthSession | null) => void
  ) => getAuthClient().onAuthStateChange(callback),
  signInWithOAuth: (params: { provider: string; options?: any }) =>
    getAuthClient().signInWithOAuth(params),
  toDefaultLoginPage: (redirectUrl?: string) =>
    getAuthClient().toDefaultLoginPage?.(redirectUrl),
  // 🔑 显式刷新用户信息（按需调用）
  refreshUserProfile: () => {
    const client = getAuthClient();
    if ("refreshUserProfile" in client && typeof client.refreshUserProfile === "function") {
      return client.refreshUserProfile();
    }
    return Promise.resolve();
  },
};
