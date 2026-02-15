/**
 * 简化的认证适配器
 * CloudBase 认证逻辑在 /api/auth 中实现
 */

export interface AuthResponse {
  user: any | null;
  session?: any;
  error?: Error | null;
}

export class CloudBaseAuthAdapter {
  constructor() {
    console.log("🔐 CloudBase 认证适配器已初始化");
  }

  async signInWithEmail(
    email: string,
    password: string
  ): Promise<AuthResponse> {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      return response.ok && data.user
        ? { user: data.user, session: { access_token: data.accessToken } }
        : { user: null, error: new Error(data.error || data.message) };
    } catch (error) {
      return { user: null, error: error as Error };
    }
  }

  async signUpWithEmail(
    email: string,
    password: string
  ): Promise<AuthResponse> {
    return {
      user: null,
      error: new Error(
        "Sign up requires OTP. Please use /api/auth/register with signupOtp."
      ),
    };
  }

  async signOut(): Promise<void> {
    console.log("✅ 登出");
  }

  async getCurrentUser(): Promise<any> {
    return null;
  }

  async isAuthenticated(): Promise<boolean> {
    return false;
  }
}
