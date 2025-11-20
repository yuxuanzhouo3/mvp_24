/**
 * 微信 OAuth Token 交换
 * 用授权码(code)换取 access_token 和 openid
 */

export interface WechatTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  openid: string;
  scope: string;
  errcode?: number;
  errmsg?: string;
}

export interface WechatUserInfo {
  openid: string;
  nickname: string;
  sex: number; // 1=男, 2=女, 0=未知
  province: string;
  city: string;
  country: string;
  headimgurl: string; // 头像 URL
  privilege: string[];
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

/**
 * 用授权码(code)换取 access_token
 * 这是标准的 OAuth2 流程第5步
 *
 * @param code 微信返回的授权码
 * @param appId 应用ID
 * @param appSecret 应用密钥
 * @returns access_token和openid
 */
export async function exchangeWechatCode(
  code: string,
  appId: string,
  appSecret: string
): Promise<WechatTokenResponse> {
  try {
    const url = "https://api.weixin.qq.com/sns/oauth2/access_token";
    const params = {
      appid: appId,
      secret: appSecret,
      code: code,
      grant_type: "authorization_code",
    };

    const queryString = Object.entries(params)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join("&");

    const response = await fetch(`${url}?${queryString}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data: WechatTokenResponse = await response.json();

    if (data.errcode) {
      throw new Error(`WeChat error: ${data.errmsg} (code: ${data.errcode})`);
    }

    return data;
  } catch (error) {
    console.error("Failed to exchange WeChat code:", error);
    throw error;
  }
}

/**
 * 用 access_token 和 openid 获取用户信息
 * 这是标准的 OAuth2 流程第6步
 *
 * @param accessToken 微信 access_token
 * @param openid 用户 openid
 * @returns 用户信息（头像、昵称等）
 */
export async function getWechatUserInfo(
  accessToken: string,
  openid: string
): Promise<WechatUserInfo> {
  try {
    const url = "https://api.weixin.qq.com/sns/userinfo";
    const params = {
      access_token: accessToken,
      openid: openid,
      lang: "zh_CN", // 返回中文昵称
    };

    const queryString = Object.entries(params)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join("&");

    const response = await fetch(`${url}?${queryString}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data: WechatUserInfo = await response.json();

    if (data.errcode) {
      throw new Error(
        `WeChat error: ${data.errmsg} (code: ${data.errcode})`
      );
    }

    return data;
  } catch (error) {
    console.error("Failed to get WeChat user info:", error);
    throw error;
  }
}

/**
 * 一步到位：用 code 获取完整的用户信息
 *
 * @param code 微信授权码
 * @param appId 应用ID
 * @param appSecret 应用密钥
 * @returns 用户信息
 */
export async function getWechatUserByCode(
  code: string,
  appId: string,
  appSecret: string
): Promise<WechatUserInfo & { access_token: string; openid: string }> {
  // 第5步：用 code 换 access_token
  const tokenResponse = await exchangeWechatCode(code, appId, appSecret);

  // 第6步：用 access_token 获取用户信息
  const userInfo = await getWechatUserInfo(
    tokenResponse.access_token,
    tokenResponse.openid
  );

  return {
    ...userInfo,
    access_token: tokenResponse.access_token,
    openid: tokenResponse.openid,
  };
}
