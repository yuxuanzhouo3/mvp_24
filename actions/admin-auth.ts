"use server";

/**
 * 管理员认证 Server Actions
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyPassword, hashPassword } from "@/lib/admin/password";
import {
  CloudBaseConnector,
  isCloudBaseConfigured,
} from "@/lib/admin/cloudbase-connector";
import { IS_DOMESTIC_VERSION } from "@/config";
import {
  createAdminSession,
  destroyAdminSession,
  getAdminSession,
} from "@/lib/admin/session";
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
 * 获取 CloudBase 客户端
 */
async function getCloudBase() {
  const connector = new CloudBaseConnector();
  await connector.initialize();
  return {
    db: connector.getClient(),
    app: connector.getApp(),
  };
}

/**
 * 管理员登录
 */
export async function adminLogin(formData: FormData): Promise<LoginResult> {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return { success: false, error: "请输入用户名 and 密码" };
  }

  try {
    let admin: { id: string; username: string; password_hash: string } | null =
      null;

    if (IS_DOMESTIC_VERSION && isCloudBaseConfigured()) {
      // 从 CloudBase 查询管理员
      const { db } = await getCloudBase();
      const result = await db
        .collection("admin_users")
        .where({ username })
        .limit(1)
        .get();

      if (result.data && result.data.length > 0) {
        const user = result.data[0];
        admin = {
          id: user._id || user.id,
          username: user.username,
          password_hash: user.password_hash,
        };
      }
    } else {
      // 从 Supabase 查询管理员
      const { data, error } = await supabaseAdmin
        .from("admin_users")
        .select("id, username, password_hash")
        .eq("username", username)
        .maybeSingle();

      if (error) {
        console.error("[adminLogin] Supabase query failed:", error);
      } else if (data) {
        admin = data;
      }
    }

    if (!admin) {
      return { success: false, error: "用户名或密码错误" };
    }

    // 验证密码
    const isValid = await verifyPassword(password, admin.password_hash);
    if (!isValid) {
      return { success: false, error: "用户名或密码错误" };
    }

    // 创建会话
    await createAdminSession(admin.id, admin.username);

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
  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { success: false, error: "请填写所有字段" };
  }

  if (newPassword !== confirmPassword) {
    return { success: false, error: "两次输入的新密码不一致" };
  }

  if (newPassword.length < 6) {
    return { success: false, error: "新密码长度至少 6 位" };
  }

  const session = await getAdminSession();
  if (!session) {
    return { success: false, error: "未登录" };
  }

  try {
    // 获取当前用户信息
    let admin: { id: string; password_hash: string } | null = null;
    let isCloudBase = false;

    if (IS_DOMESTIC_VERSION && isCloudBaseConfigured()) {
      const { db } = await getCloudBase();
      const result = await db
        .collection("admin_users")
        .doc(session.userId)
        .get();

      if (result.data && result.data.length > 0) {
        const user = result.data[0];
        admin = {
          id: user._id || user.id,
          password_hash: user.password_hash,
        };
        isCloudBase = true;
      }
    } else {
      const { data, error: fetchError } = await supabaseAdmin
        .from("admin_users")
        .select("id, password_hash")
        .eq("id", session.userId)
        .single();

      if (!fetchError && data) {
        admin = data;
      }
    }

    if (!admin) {
      return { success: false, error: "获取用户信息失败" };
    }

    // 验证当前密码
    const isValid = await verifyPassword(currentPassword, admin.password_hash);
    if (!isValid) {
      return { success: false, error: "当前密码错误" };
    }

    // 生成新密码哈希
    const newHash = await hashPassword(newPassword);

    // 更新密码
    if (isCloudBase) {
      const { db } = await getCloudBase();
      await db
        .collection("admin_users")
        .doc(session.userId)
        .update({
          password_hash: newHash,
          updated_at: new Date().toISOString(),
        });
    } else {
      const { error: updateError } = await supabaseAdmin
        .from("admin_users")
        .update({ password_hash: newHash })
        .eq("id", session.userId);

      if (updateError) {
        return { success: false, error: "更新密码失败" };
      }
    }

    return { success: true };
  } catch (err) {
    console.error("Change password error:", err);
    return { success: false, error: "修改密码失败，请稍后重试" };
  }
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
