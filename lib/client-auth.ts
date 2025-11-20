/**
 * 客户端认证工具
 * 获取用户的认证 token，支持 CloudBase 和 Supabase
 * 现已迁移到 TokenManager，此文件保留用于向后兼容
 */

import { tokenManager } from "@/lib/frontend-token-manager";

/**
 * 获取客户端认证 Token（向后兼容）
 * ⚠️ 新代码请直接使用 tokenManager.getValidToken()
 *
 * DEPLOY_REGION=CN (中国): 从 localStorage 读取 CloudBase token
 * DEPLOY_REGION=INTL (国际): 使用 Supabase 会话的 access_token
 */
export async function getClientAuthToken(): Promise<{
  token: string | null;
  error: string | null;
}> {
  try {
    // getValidToken() 是异步的，需要 await
    const token = await tokenManager.getValidToken();

    if (!token) {
      return {
        token: null,
        error: "Not authenticated or token expired",
      };
    }

    return { token, error: null };
  } catch (error) {
    console.error("[Client Auth] Error:", error);
    return { token: null, error: "Failed to get token" };
  }
}
