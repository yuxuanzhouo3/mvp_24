/**
 * CloudBase 认证适配器（中国版）
 * 简单实现，调用 /api/auth API
 */

export interface CloudBaseAuthResponse {
  success: boolean;
  message: string;
  user?: {
    id: string;
    email: string;
    name: string;
    pro: boolean;
    region: string;
  };
  token?: string;
}

export async function signInWithEmailCN(
  email: string,
  password: string
): Promise<CloudBaseAuthResponse> {
  try {
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email, password }),
    });
    return await response.json();
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "请求失败",
    };
  }
}

export async function signUpWithEmailCN(
  email: string,
  password: string
): Promise<CloudBaseAuthResponse> {
  try {
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "signup", email, password }),
    });
    return await response.json();
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "请求失败",
    };
  }
}
