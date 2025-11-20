/**
 * CloudBase 认证客户端
 * 仅用于认证功能，不再涉及数据库操作
 */

import cloudbase from "@cloudbase/js-sdk";

// 延迟初始化，避免SSR错误
let app: any = null;
let auth: any = null;

// 初始化函数（仅在浏览器端初始化）
function initCloudBase() {
  if (app) return { app, auth }; // 已初始化

  // 只在浏览器端初始化，避免SSR时window undefined错误
  if (typeof window === "undefined") {
    return { app: null, auth: null };
  }

  try {
    const envId =
      process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID ||
      "multigpt-6g9pqxiz52974a7c";

    app = cloudbase.init({
      env: envId,
    });

    auth = app.auth();

    console.log("✅ [CloudBase] 认证初始化成功:", envId);
  } catch (error) {
    console.error("❌ [CloudBase] 认证初始化失败:", error);
  }

  return { app, auth };
}

// 浏览器端立即初始化
if (typeof window !== "undefined") {
  initCloudBase();
}

// 导出认证实例
export { auth };
export default app;
