/**
 * 国内用户邮箱认证客户端
 * 用于前端调用国内用户邮箱注册/登录 API
 */

/**
 * 注册响应类型
 */
export interface SignupResponse {
  success: boolean;
  message: string;
  token?: string; // JWT Token
  user?: {
    id: string;
    email: string;
    name: string;
    pro: boolean;
    region: string;
  };
}

/**
 * 登录响应类型
 */
export interface LoginResponse {
  success: boolean;
  message: string;
  token?: string; // JWT Token
  user?: {
    id: string;
    email: string;
    name: string;
    pro: boolean;
    region: string;
  };
}

/**
 * 国内用户邮箱注册
 * @param email 用户邮箱
 * @param password 用户密码
 * @returns 注册响应
 */
export async function signupWithEmailCN(
  email: string,
  password: string
): Promise<SignupResponse> {
  return {
    success: false,
    message: "Sign up requires OTP. Please use /api/auth/register with signupOtp.",
  };
}

/**
 * 国内用户邮箱登录
 * @param email 用户邮箱
 * @param password 用户密码
 * @returns 登录响应
 */
export async function loginWithEmailCN(
  email: string,
  password: string
): Promise<LoginResponse> {
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const data = await response.json();
    return {
      success: response.ok,
      message: data.error || data.message || (response.ok ? "登录成功" : "登录失败"),
      token: data.accessToken || data.token,
      user: data.user,
    };
  } catch (error) {
    console.error("登录失败:", error);
    return {
      success: false,
      message: "网络错误，请稍后重试",
    };
  }
}
