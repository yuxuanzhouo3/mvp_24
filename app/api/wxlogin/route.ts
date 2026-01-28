import { NextRequest, NextResponse } from "next/server";
import { POST as miniprogramLogin } from "../wechat/miniprogram/login/route";

/**
 * 严格按照 Demo 实现的网页端接口
 * 路径: /api/wxlogin
 * 功能: 接收 code，返回 token 和 openid
 */
export async function POST(request: NextRequest) {
  try {
    // 转发给现有的微信小程序登录逻辑
    const response = await miniprogramLogin(request);
    const data = await response.json();

    if (data.success && data.data) {
      // 转换为 Demo 要求的响应格式
      return NextResponse.json({
        ok: true,
        token: data.data.token,
        refreshToken: data.data.refreshToken,
        openid: data.data.userInfo?.openid,
        expiresIn: 3600,
        userInfo: data.data.userInfo
      });
    }

    return NextResponse.json({
      ok: false,
      error: data.error || "登录失败",
      details: data.details
    }, { status: response.status });

  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message || "服务器错误"
    }, { status: 500 });
  }
}

// 支持 OPTIONS 请求以兼容跨域（如果需要）
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
