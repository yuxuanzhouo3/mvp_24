/**
 * P2 Token 预加载和请求队列管理
 *
 * 功能:
 * 1. Token 预加载: 在 token 即将过期（5分钟内）时自动刷新
 * 2. 请求队列: 防止多个并发 refresh 请求，共享同一个刷新
 * 3. 详细日志: 追踪所有 token 操作
 */

type RefreshPromise = Promise<string | null>;

interface PreloaderConfig {
  preloadThreshold: number; // 多少秒时开始预加载刷新（默认 300秒 = 5分钟）
  checkInterval: number; // 检查间隔（默认 30秒）
  enableDetailedLogs: boolean; // 启用详细日志
}

class AuthTokenPreloader {
  private static instance: AuthTokenPreloader;
  private refreshPromise: RefreshPromise | null = null;
  private preloadCheckInterval: NodeJS.Timeout | null = null;
  private config: PreloaderConfig = {
    preloadThreshold: 300, // 5 分钟
    checkInterval: 30000, // 30 秒
    enableDetailedLogs: true,
  };

  private constructor() {}

  static getInstance(): AuthTokenPreloader {
    if (!AuthTokenPreloader.instance) {
      AuthTokenPreloader.instance = new AuthTokenPreloader();
    }
    return AuthTokenPreloader.instance;
  }

  /**
   * 初始化预加载器
   * 在应用启动时调用一次
   */
  public initialize(config?: Partial<PreloaderConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    if (typeof window !== "undefined") {
      this.startPreloadCheck();
      this.log("✅ Token 预加载器已初始化", {
        threshold: this.config.preloadThreshold,
        interval: this.config.checkInterval,
      });
    }
  }

  /**
   * 启动定期检查
   * P2-2: 每隔 checkInterval 检查一次 token 是否需要预加载刷新
   */
  private startPreloadCheck() {
    if (this.preloadCheckInterval) {
      clearInterval(this.preloadCheckInterval);
    }

    this.preloadCheckInterval = setInterval(() => {
      this.checkAndPreload();
    }, this.config.checkInterval);

    this.log("🔄 预加载检查已启动", {
      interval: this.config.checkInterval,
    });
  }

  /**
   * 检查是否需要预加载刷新
   * P2-2: 检查 token 剩余有效期
   */
  private async checkAndPreload() {
    if (typeof window === "undefined") return;

    try {
      const authState = localStorage.getItem("app-auth-state");
      if (!authState) {
        this.log("⏭️  未找到 auth state，跳过预加载");
        return;
      }

      const parsed = JSON.parse(authState);
      const now = Date.now();
      const tokenExpiresAt =
        parsed.savedAt + parsed.tokenMeta.accessTokenExpiresIn * 1000;
      const remainingSeconds = (tokenExpiresAt - now) / 1000;

      this.log("🔍 检查 token 过期时间", {
        remainingSeconds: Math.round(remainingSeconds),
        threshold: this.config.preloadThreshold,
      });

      // P2-2: 如果 token 在 5 分钟内过期，则预加载刷新
      if (
        remainingSeconds > 0 &&
        remainingSeconds <= this.config.preloadThreshold
      ) {
        this.log("⚠️  Token 即将过期，触发预加载刷新", {
          remainingSeconds: Math.round(remainingSeconds),
        });

        await this.refreshTokenWithQueue();
      }
    } catch (error) {
      this.log("❌ 预加载检查失败", { error });
    }
  }

  /**
   * P2-3: 带队列的 token 刷新
   * 防止多个并发刷新请求，共享同一个 refresh 操作
   */
  public async refreshTokenWithQueue(): Promise<string | null> {
    // 如果已经有一个 refresh 进行中，直接返回该 Promise
    if (this.refreshPromise) {
      this.log("⏳ 已有 refresh 进行中，等待队列中的 refresh 完成...");
      return this.refreshPromise;
    }

    // P2-3: 创建新的 refresh Promise
    this.refreshPromise = this.performRefresh();

    try {
      const result = await this.refreshPromise;
      this.log("✅ Queue refresh 成功完成", { newTokenLength: result?.length });
      return result;
    } finally {
      // 清除 Promise 引用
      this.refreshPromise = null;
    }
  }

  /**
   * 执行实际的 token 刷新
   */
  private async performRefresh(): Promise<string | null> {
    try {
      const authState = localStorage.getItem("app-auth-state");
      if (!authState) {
        this.log("❌ 无法刷新: 未找到 auth state");
        return null;
      }

      const parsed = JSON.parse(authState);
      const refreshToken = parsed.refreshToken;

      if (!refreshToken) {
        this.log("❌ 无法刷新: 缺少 refresh token");
        return null;
      }

      this.log("🔄 开始刷新 token...", {
        refreshTokenLength: refreshToken.length,
      });

      const startTime = Date.now();

      // 调用刷新端点
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      const elapsed = Date.now() - startTime;

      if (!response.ok) {
        const error = await response.json();
        this.log("❌ Token 刷新失败", {
          status: response.status,
          error: error.error,
          elapsed,
        });

        // 如果是 401 (token 过期)，清除 auth state
        if (response.status === 401) {
          this.log("🔓 Refresh token 已过期，清除认证状态");
          const { clearAuthState } = await import("@/lib/auth-state-manager");
          await clearAuthState();
          // 触发自定义事件通知应用
          window.dispatchEvent(
            new CustomEvent("auth-refresh-failed", {
              detail: "refresh_expired",
            })
          );
        }

        return null;
      }

      const data = await response.json();

      // P2-1: 更新 localStorage 中的 token（包括新的 refresh token）
      const updatedState = {
        ...parsed,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken, // P2-1: 使用轮转后的新 refresh token
        user: data.user,
        tokenMeta: data.tokenMeta,
        savedAt: Date.now(),
      };

      localStorage.setItem("app-auth-state", JSON.stringify(updatedState));

      this.log("✅ Token 刷新成功（预加载）", {
        elapsed,
        newTokenLength: data.accessToken.length,
        nextExpiresIn: data.tokenMeta.accessTokenExpiresIn,
      });

      // 触发自定义事件通知其他地方 token 已更新
      window.dispatchEvent(
        new CustomEvent("auth-state-changed", {
          detail: { action: "token_refreshed", user: data.user },
        })
      );

      return data.accessToken;
    } catch (error) {
      this.log("❌ Token 刷新异常", { error });
      return null;
    }
  }

  /**
   * 停止预加载检查
   * 在组件卸载时调用
   */
  public stop() {
    if (this.preloadCheckInterval) {
      clearInterval(this.preloadCheckInterval);
      this.preloadCheckInterval = null;
      this.log("⛔ 预加载检查已停止");
    }
  }

  /**
   * P2-4: 详细日志方法
   * 仅在启用详细日志时才输出
   */
  private log(message: string, data?: any) {
    if (!this.config.enableDetailedLogs) return;

    const timestamp = new Date().toISOString();
    const prefix = "[AuthTokenPreloader]";

    if (data) {
      console.log(`${prefix} ${timestamp} ${message}`, data);
    } else {
      console.log(`${prefix} ${timestamp} ${message}`);
    }
  }

  /**
   * 获取当前配置
   */
  public getConfig(): PreloaderConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<PreloaderConfig>) {
    this.config = { ...this.config, ...config };
    this.log("⚙️  配置已更新", this.config);
  }

  /**
   * 禁用详细日志
   */
  public disableDetailedLogs() {
    this.config.enableDetailedLogs = false;
  }

  /**
   * 启用详细日志
   */
  public enableDetailedLogs() {
    this.config.enableDetailedLogs = true;
  }
}

/**
 * 导出单例
 */
export const authTokenPreloader = AuthTokenPreloader.getInstance();

/**
 * 初始化函数，在应用启动时调用
 * 例如在 UserContext 中调用
 */
export function initializeAuthTokenPreloader(
  config?: Partial<PreloaderConfig>
) {
  authTokenPreloader.initialize(config);
}
