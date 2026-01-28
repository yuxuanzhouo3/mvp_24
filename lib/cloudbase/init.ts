/**
 * 统一的 CloudBase 初始化器
 * 确保全局只初始化一次，避免重复初始化和警告
 */

import cloudbase from "@cloudbase/node-sdk";

let cachedApp: any = null;

/**
 * 获取 CloudBase 应用实例（单例）
 * 全局只初始化一次，避免重复初始化
 *
 * ✅ 优点：
 * - 统一管理 CloudBase 连接
 * - 避免多次初始化导致的警告
 * - 提高性能（复用连接）
 *
 * ⚠️ 注意：
 * - env 环境 ID 必须设置在 NEXT_PUBLIC_WECHAT_CLOUDBASE_ID
 * - secretId 和 secretKey 必须设置在 CLOUDBASE_SECRET_ID 和 CLOUDBASE_SECRET_KEY
 */
export function getCloudBaseApp() {
  if (cachedApp) {
    return cachedApp;
  }

  const envId = process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID;
  const secretId = process.env.CLOUDBASE_SECRET_ID;
  const secretKey = process.env.CLOUDBASE_SECRET_KEY;

  if (!envId) {
    throw new Error(
      "❌ CloudBase 环境 ID 未配置。请设置 NEXT_PUBLIC_WECHAT_CLOUDBASE_ID 环境变量"
    );
  }

  if (!secretId || !secretKey) {
    throw new Error(
      "❌ CloudBase 认证信息未配置。请设置 CLOUDBASE_SECRET_ID 和 CLOUDBASE_SECRET_KEY 环境变量"
    );
  }

  console.log(`✅ [CloudBase] 初始化环境: ${envId}`);

  cachedApp = cloudbase.init({
    env: envId,
    secretId: secretId,
    secretKey: secretKey,
  });

  return cachedApp;
}

/**
 * 获取 CloudBase 数据库实例
 */
export function getCloudBaseDatabase() {
  const app = getCloudBaseApp();
  return app.database();
}

/**
 * 重置 CloudBase 连接（仅用于测试）
 */
export function resetCloudBaseApp() {
  cachedApp = null;
}
