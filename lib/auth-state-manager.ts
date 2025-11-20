/**
 * Auth State Manager
 * 原子性管理认证状态（token + user + metadata）
 * 支持 Refresh Token 自动刷新
 */

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  subscription_plan?: string;
  [key: string]: any;
}

export interface StoredAuthState {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  tokenMeta: {
    accessTokenExpiresIn: number; // 秒数
    refreshTokenExpiresIn: number; // 秒数
  };
  savedAt: number; // 毫秒
}

const AUTH_STATE_KEY = "app-auth-state";

/**
 * 初始化认证状态管理器
 * 清理旧格式的 localStorage 键
 */
export function initAuthStateManager(): void {
  if (typeof window === "undefined") return;

  try {
    // 清除旧格式的键（如果存在）
    const oldKeys = ["auth-token", "auth-user", "auth-logged-in"];
    const hasPP0State = !!localStorage.getItem(AUTH_STATE_KEY);

    // 只在 P0 状态存在时清除旧键（避免误删用户的旧登录状态）
    if (hasPP0State) {
      oldKeys.forEach((key) => {
        if (localStorage.getItem(key)) {
          console.log(`🧹 [Auth] 清除旧格式的 localStorage 键: ${key}`);
          localStorage.removeItem(key);
        }
      });
    }
  } catch (error) {
    console.warn("⚠️ [Auth] 清理旧 localStorage 键时出错:", error);
  }
}

/**
 * 原子性保存认证状态
 * 成功保存后会 dispatch 'auth-state-changed' 事件
 */
export function saveAuthState(
  accessToken: string,
  refreshToken: string,
  user: AuthUser,
  tokenMeta: { accessTokenExpiresIn: number; refreshTokenExpiresIn: number }
): void {
  if (typeof window === "undefined") return;

  try {
    const authState: StoredAuthState = {
      accessToken,
      refreshToken,
      user,
      tokenMeta,
      savedAt: Date.now(),
    };

    localStorage.setItem(AUTH_STATE_KEY, JSON.stringify(authState));
    console.log("✅ [Auth] 认证状态已保存");

    // 触发自定义事件（用于同标签页内同步）
    window.dispatchEvent(new CustomEvent("auth-state-changed"));
  } catch (error) {
    console.error("❌ [Auth] 保存认证状态失败:", error);
    // 保存失败则清除
    localStorage.removeItem(AUTH_STATE_KEY);
  }
}

/**
 * 获取存储的认证状态
 */
export function getStoredAuthState(): StoredAuthState | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(AUTH_STATE_KEY);
    if (!stored) return null;

    const authState: StoredAuthState = JSON.parse(stored);

    // 验证数据完整性
    if (
      !authState.accessToken ||
      !authState.refreshToken ||
      !authState.user?.id ||
      !authState.tokenMeta
    ) {
      console.warn("⚠️ [Auth] 存储的认证状态不完整");
      clearAuthState();
      return null;
    }

    return authState;
  } catch (error) {
    console.error("❌ [Auth] 解析认证状态失败:", error);
    clearAuthState();
    return null;
  }
}

/**
 * 获取有效的 access token
 * 若本地已过期但 refreshToken 有效，自动调用刷新端点
 * 若刷新失败或都过期，返回 null（由调用者处理重新登录）
 */
export async function getValidAccessToken(): Promise<string | null> {
  const authState = getStoredAuthState();
  if (!authState) return null;

  const accessTokenExpiresAt =
    authState.savedAt + authState.tokenMeta.accessTokenExpiresIn * 1000;

  // 提前 60 秒判定为过期（留出时间刷新）
  if (Date.now() <= accessTokenExpiresAt - 60000) {
    // Token 仍然有效，直接返回
    return authState.accessToken;
  }

  console.log("⏰ [Auth] Access token 已过期或即将过期，尝试自动刷新...");

  // Token 已过期，检查 refresh token 是否有效
  if (!isRefreshTokenValid()) {
    console.log("❌ [Auth] Refresh token 也已过期，需要重新登录");
    clearAuthState();
    return null;
  }

  // 尝试刷新 token
  try {
    console.log("🔄 [Auth] 调用刷新端点...");
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refreshToken: authState.refreshToken,
      }),
    });

    if (!response.ok) {
      console.error(
        "❌ [Auth] 刷新失败，状态码:",
        response.status,
        response.statusText
      );
      if (response.status === 401) {
        // Refresh token 已过期或无效
        clearAuthState();
      }
      return null;
    }

    const data = await response.json();

    if (!data.accessToken) {
      console.error("❌ [Auth] 刷新响应中缺少 accessToken");
      return null;
    }

    console.log("✅ [Auth] Token 刷新成功，更新本地状态");

    // 更新本地存储
    updateAccessToken(data.accessToken, data.tokenMeta?.accessTokenExpiresIn);

    return data.accessToken;
  } catch (error) {
    console.error("❌ [Auth] 刷新 token 时出错:", error);
    return null;
  }
}

/**
 * 获取 refresh token
 */
export function getRefreshToken(): string | null {
  const authState = getStoredAuthState();
  return authState?.refreshToken || null;
}

/**
 * 获取用户信息
 */
export function getUser(): AuthUser | null {
  const authState = getStoredAuthState();
  return authState?.user || null;
}

/**
 * 检查 refresh token 是否有效
 */
export function isRefreshTokenValid(): boolean {
  const authState = getStoredAuthState();
  if (!authState) return false;

  const refreshTokenExpiresAt =
    authState.savedAt + authState.tokenMeta.refreshTokenExpiresIn * 1000;

  return Date.now() < refreshTokenExpiresAt;
}

/**
 * 更新 access token（刷新后调用）
 */
export function updateAccessToken(
  newAccessToken: string,
  newExpiresIn?: number
): void {
  if (typeof window === "undefined") return;

  try {
    const authState = getStoredAuthState();
    if (!authState) {
      console.warn("⚠️ [Auth] 无现有认证状态，无法更新 token");
      return;
    }

    // 更新 token 和过期时间
    authState.accessToken = newAccessToken;
    if (newExpiresIn) {
      authState.tokenMeta.accessTokenExpiresIn = newExpiresIn;
    }
    authState.savedAt = Date.now();

    localStorage.setItem(AUTH_STATE_KEY, JSON.stringify(authState));
    console.log("✅ [Auth] Access token 已更新");

    window.dispatchEvent(new CustomEvent("auth-state-changed"));
  } catch (error) {
    console.error("❌ [Auth] 更新 token 失败:", error);
  }
}

/**
 * 获取认证头（同步版本，不触发自动刷新）
 * 用于不需要自动刷新的场景（如日志、分析等）
 */
export function getAuthHeader(): { Authorization: string } | null {
  const authState = getStoredAuthState();
  if (!authState) return null;

  const accessTokenExpiresAt =
    authState.savedAt + authState.tokenMeta.accessTokenExpiresIn * 1000;

  // 检查 token 是否仍然有效（不尝试刷新）
  if (Date.now() > accessTokenExpiresAt - 60000) {
    return null;
  }

  return { Authorization: `Bearer ${authState.accessToken}` };
}

/**
 * 获取认证头（异步版本，支持自动刷新）
 * 用于 API 请求时自动刷新过期 token
 */
export async function getAuthHeaderAsync(): Promise<{
  Authorization: string;
} | null> {
  const token = await getValidAccessToken();
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

/**
 * 清除所有认证状态
 */
export function clearAuthState(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(AUTH_STATE_KEY);
    console.log("🗑️  [Auth] 认证状态已清除");

    window.dispatchEvent(new CustomEvent("auth-state-changed"));
  } catch (error) {
    console.error("❌ [Auth] 清除认证状态失败:", error);
  }
}

/**
 * 检查用户是否已认证（同步检查，不触发自动刷新）
 * 用于快速检查，如 UI 条件渲染
 */
export function isAuthenticated(): boolean {
  const authState = getStoredAuthState();
  if (!authState || !authState.user?.id) return false;

  const accessTokenExpiresAt =
    authState.savedAt + authState.tokenMeta.accessTokenExpiresIn * 1000;

  // 检查 token 是否仍然有效（不尝试刷新）
  return Date.now() < accessTokenExpiresAt - 60000;
}

/**
 * P2: 获取 token 预加载器
 * 用于在应用启动时初始化预加载机制
 */
export async function initializeTokenPreloader() {
  if (typeof window === "undefined") return;

  try {
    const { initializeAuthTokenPreloader } = await import(
      "@/lib/auth-token-preloader"
    );
    initializeAuthTokenPreloader({
      preloadThreshold: 300, // 5 分钟
      checkInterval: 30000, // 30 秒
      enableDetailedLogs: process.env.NODE_ENV === "development",
    });
    console.log("✅ [Auth] Token 预加载器已初始化");
  } catch (error) {
    console.error("❌ [Auth] 初始化预加载器失败:", error);
  }
}
