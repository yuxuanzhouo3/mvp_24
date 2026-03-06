"use server";

/**
 * 管理员认证 Server Actions
 */

import {
  createAdminSession,
  destroyAdminSession,
  getAdminSession,
} from "@/lib/admin/session";
import {
  isAdminCredentialsConfigured,
  verifyAdminCredentialsFromEnv,
} from "@/lib/admin/credentials";
import { redirect } from "next/navigation";

export interface LoginResult {
  success: boolean;
  error?: string;
}

export interface ChangePasswordResult {
  success: boolean;
  error?: string;
}

/**
 * 管理员登录
 */
export async function adminLogin(formData: FormData): Promise<LoginResult> {
  const username = String(formData.get("username") || "");
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    return { success: false, error: "请输入用户名 and 密码" };
  }

  try {
    if (!isAdminCredentialsConfigured()) {
      return {
        success: false,
        error:
          "管理员账号未配置，请设置 ADMIN_USERNAME + ADMIN_PASSWORD（或 ADMIN_PASSWORD_HASH）",
      };
    }

    const admin = await verifyAdminCredentialsFromEnv({ username, password });
    if (!admin) {
      return { success: false, error: "用户名或密码错误" };
    }

    // 创建会话
    await createAdminSession(admin.userId, admin.username);

    return { success: true };
  } catch (err) {
    console.error("[adminLogin] Unexpected error:", err);
    return { success: false, error: "登录失败，请稍后重试" };
  }
}

/**
 * 管理员登出
 */
export async function adminLogout(): Promise<void> {
  await destroyAdminSession();
  redirect("/admin/login");
}

/**
 * 修改密码
 */
export async function changePassword(
  formData: FormData
): Promise<ChangePasswordResult> {
  void formData;

  const session = await getAdminSession();
  if (!session) {
    return { success: false, error: "未登录" };
  }

  return {
    success: false,
    error:
      "当前使用环境变量管理管理员密码，请修改 ADMIN_PASSWORD 或 ADMIN_PASSWORD_HASH 后重启服务",
  };
}

/**
 * 获取当前管理员信息
 */
export async function getCurrentAdmin() {
  const session = await getAdminSession();
  if (!session) return null;

  return {
    userId: session.userId,
    username: session.username,
  };
}
