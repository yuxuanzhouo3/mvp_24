/**
 * 微信 OAuth 工具函数
 * 处理微信登录的 OAuth 流程
 */

/**
 * 微信 OAuth 配置接口
 */
export interface WechatOAuthConfig {
  appId: string;
  redirectUri: string;
  state?: string;
  scope?: string;
}

/**
 * 微信授权 URL 参数
 */
export interface WechatAuthParams {
  appid: string;
  redirect_uri: string;
  response_type: string;
  scope: string;
  state: string;
}

/**
 * 微信授权响应
 */
export interface WechatAuthResponse {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

/**
 * 生成微信 OAuth 授权 URL
 * @param config 微信 OAuth 配置
 * @returns 微信授权 URL
 */
export function generateWechatAuthUrl(config: WechatOAuthConfig): string {
  // ✅ 根据 scope 选择不同的授权 URL
  // snsapi_login: 显示二维码扫码（网站用）
  // snsapi_userinfo: 网页应用授权登录（微信内打开）
  let baseUrl = "https://open.weixin.qq.com/connect/oauth2/authorize";

  if (config.scope === "snsapi_login") {
    // 二维码登录 - 使用 qrconnect 端点会显示二维码
    baseUrl = "https://open.weixin.qq.com/connect/qrconnect";
  }

  const params: WechatAuthParams = {
    appid: config.appId,
    redirect_uri: encodeURIComponent(config.redirectUri),
    response_type: "code",
    scope: config.scope || "snsapi_userinfo",
    state: config.state || generateState(),
  };

  const queryString = Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return `${baseUrl}?${queryString}#wechat_redirect`;
}

/**
 * 生成随机状态值
 * @returns 随机状态值
 */
export function generateState(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}_${random}`;
}

/**
 * 从 URL 查询参数中提取微信授权响应
 * @param searchParams URL 查询参数
 * @returns 微信授权响应
 */
export function extractWechatAuthResponse(
  searchParams: URLSearchParams
): WechatAuthResponse {
  return {
    code: searchParams.get("code") || undefined,
    state: searchParams.get("state") || undefined,
    error: searchParams.get("error") || undefined,
    error_description: searchParams.get("error_description") || undefined,
  };
}

/**
 * 验证微信授权状态
 * @param state 返回的状态值
 * @param savedState 保存的状态值
 * @returns 是否有效
 */
export function validateWechatState(
  state: string | undefined,
  savedState: string | null | undefined
): boolean {
  if (!state || !savedState) {
    return false;
  }
  return state === savedState;
}

/**
 * 在 localStorage 中保存微信授权状态
 * @param state 状态值
 */
export function saveWechatState(state: string): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem("wechat_auth_state", state);
  }
}

/**
 * 从 localStorage 中获取微信授权状态
 * @returns 状态值
 */
export function getSavedWechatState(): string | null {
  if (typeof window !== "undefined") {
    return sessionStorage.getItem("wechat_auth_state");
  }
  return null;
}

/**
 * 清除保存的微信授权状态
 */
export function clearWechatState(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("wechat_auth_state");
  }
}

/**
 * 构建完整的微信登录 URL
 * @param appId 微信应用 ID
 * @param redirectUri 重定向 URI
 * @returns 微信登录 URL
 *
 * 注意：使用 snsapi_login scope 会显示二维码扫码登录
 * 如果要在微信客户端内使用 snsapi_userinfo，参考 getWechatWebLoginUrl
 */
export function getWechatLoginUrl(appId: string, redirectUri: string): string {
  const state = generateState();
  saveWechatState(state);

  // ✅ 使用 snsapi_login 显示二维码（网站上使用）
  // ⚠️ 重要：微信对 redirect_uri 很严格
  // 必须与微信开放平台配置的回调域名一致
  const cleanRedirectUri = redirectUri.replace(/\/$/, ""); // 移除末尾的 /

  return generateWechatAuthUrl({
    appId,
    redirectUri: cleanRedirectUri,
    state,
    scope: "snsapi_login",
  });
}

/**
 * 构建微信网页应用登录 URL（在微信客户端内打开）
 * @param appId 微信应用 ID
 * @param redirectUri 重定向 URI
 * @returns 微信登录 URL
 *
 * 使用 snsapi_userinfo 在微信客户端内打开
 */
export function getWechatWebLoginUrl(appId: string, redirectUri: string): string {
  const state = generateState();
  saveWechatState(state);

  return generateWechatAuthUrl({
    appId,
    redirectUri,
    state,
    scope: "snsapi_userinfo",
  });
}
