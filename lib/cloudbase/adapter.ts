/**
 * CloudBase 认证适配器
 * 仅提供认证功能，不再使用集合数据库
 */

import cloudbase from "@cloudbase/js-sdk";

/**
 * CloudBase认证适配器类
 * 只提供登录认证功能，不涉及数据库操作
 */
export class CloudBaseAuthAdapter {
  private auth: any;
  private initialized: boolean = false;

  constructor() {
    this.initAuth();
  }

  /**
   * 初始化CloudBase认证
   */
  private async initAuth() {
    try {
      if (typeof window === "undefined") {
        // 服务端环境，使用Node.js SDK
        const cloudbaseNode = await import("@cloudbase/node-sdk");
        const app = cloudbaseNode.default.init({
          env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID!,
          secretId: process.env.CLOUDBASE_SECRET_ID!,
          secretKey: process.env.CLOUDBASE_SECRET_KEY!,
        });
        this.auth = app.auth();
      } else {
        // 客户端环境，使用JS SDK
        const app = cloudbase.init({
          env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID!,
        });
        this.auth = app.auth();
      }

      this.initialized = true;
      console.log("✅ CloudBase认证初始化成功");
    } catch (error) {
      console.error("❌ CloudBase认证初始化失败:", error);
      this.initialized = false;
    }
  }

  /**
   * 确保认证已初始化
   */
  private async ensureInitialized() {
    if (!this.initialized) {
      await this.initAuth();
      if (!this.initialized) {
        throw new Error("CloudBase认证初始化失败");
      }
    }
  }

  /**
   * 用户名密码登录
   */
  async signInWithUsername(username: string, password: string) {
    try {
      await this.ensureInitialized();

      const result = await this.auth.signIn({
        username,
        password,
      });

      console.log("✅ CloudBase登录成功:", username);
      return {
        success: true,
        user: result.user,
        token: result.accessToken,
      };
    } catch (error: any) {
      console.error("❌ CloudBase登录失败:", error);
      return {
        success: false,
        error: error.message || "登录失败",
      };
    }
  }

  /**
   * 用户登出
   */
  async signOut() {
    try {
      await this.ensureInitialized();

      await this.auth.signOut();
      console.log("✅ CloudBase登出成功");
      return { success: true };
    } catch (error: any) {
      console.error("❌ CloudBase登出失败:", error);
      return {
        success: false,
        error: error.message || "登出失败",
      };
    }
  }

  /**
   * 获取当前登录用户
   */
  async getCurrentUser() {
    try {
      await this.ensureInitialized();

      const user = this.auth.currentUser;
      return user ? { success: true, user } : { success: false, user: null };
    } catch (error: any) {
      console.error("❌ 获取当前用户失败:", error);
      return {
        success: false,
        error: error.message || "获取用户信息失败",
      };
    }
  }

  /**
   * 检查登录状态
   */
  async isLoggedIn(): Promise<boolean> {
    try {
      const result = await this.getCurrentUser();
      return result.success && result.user !== null;
    } catch {
      return false;
    }
  }
}

/**
 * 认证适配器接口
 */
export interface IAuthAdapter {
  signInWithUsername(username: string, password: string): Promise<any>;
  signOut(): Promise<any>;
  getCurrentUser(): Promise<any>;
  isLoggedIn(): Promise<boolean>;
}

/**
 * 创建认证适配器工厂函数
 */
export function createAuthAdapter(): IAuthAdapter {
  console.log("🔐 创建CloudBase认证适配器");
  return new CloudBaseAuthAdapter();
}

/**
 * 获取全局认证适配器实例
 */
let authAdapterInstance: IAuthAdapter | null = null;

export function getAuthAdapter(): IAuthAdapter {
  if (!authAdapterInstance) {
    authAdapterInstance = createAuthAdapter();
  }
  return authAdapterInstance;
}
