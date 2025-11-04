import { NextRequest, NextResponse } from "next/server";
import { geoRouter } from "@/lib/architecture-modules/core/geo-router";
import { RegionType } from "@/lib/architecture-modules/core/types";
import {
  validateEnvironment,
  checkSensitiveDataExposure,
} from "@/lib/env-validation";
import { csrfProtection } from "@/lib/csrf";

/**
 * IP检测和地理分流中间件
 * 实现以下功能：
 * 1. 检测用户IP地理位置
 * 2. 完全禁止欧洲IP访问（包括调试模式）
 * 3. 将国内用户分流到国内系统，国外用户分流到国际系统
 *
 * 注意：认证逻辑由前端处理，避免middleware与前端产生重定向循环
 */
export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // =====================
  // CORS 预检统一处理（仅 API 路由）
  // 允许基于环境变量 ALLOWED_ORIGINS 的白名单反射 Origin
  // =====================
  if (pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin") || "";
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const isAllowedOrigin = origin && allowedOrigins.includes(origin);

    // 预检请求快速返回
    if (request.method === "OPTIONS") {
      if (isAllowedOrigin) {
        return new NextResponse(null, {
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Credentials": "true",
          },
        });
      }
      // 非白名单直接拒绝
      return new NextResponse(null, {
        status: 403,
        headers: {
          "Access-Control-Allow-Origin": "null",
        },
      });
    }
  }

  // 跳过静态资源和Next.js内部路由（但保留 API 路由以便设置区域 Header）
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon.ico") ||
    (pathname.includes(".") && !pathname.startsWith("/api/"))
  ) {
    return NextResponse.next();
  }

  // 请求体大小限制 (10MB) - 仅API路由
  if (pathname.startsWith("/api/") && request.method === "POST") {
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
      return new NextResponse(
        JSON.stringify({
          error: "Request body too large",
          message: "Maximum request size is 10MB",
        }),
        {
          status: 413,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  // 注意：认证重定向由前端处理，middleware只处理地理路由
  // 这样可以避免与前端useEffect产生重定向循环

  try {
    // 🚨 生产环境安全：完全移除调试模式支持
    // 检查URL参数中的debug模式（仅开发环境支持）
    const debugParam = searchParams.get("debug");

    // 🚨 生产环境安全检查：完全禁止调试模式访问
    if (debugParam) {
      console.warn(`🚨 检测到调试模式参数，已禁止访问: ${debugParam}`);
      return new NextResponse(
        JSON.stringify({
          error: "Access Denied",
          message: "Debug mode is not allowed.",
          code: "DEBUG_MODE_BLOCKED",
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Blocked": "true",
          },
        }
      );
    }

    // 如果是 API 请求，也检查 Referer 中的 debug 参数
    if (pathname.startsWith("/api/")) {
      const referer = request.headers.get("referer");
      if (referer) {
        const refererUrl = new URL(referer);
        const refererDebug = refererUrl.searchParams.get("debug");

        // 同样禁用来自referer的调试模式
        if (refererDebug) {
          console.warn(
            `🚨 检测到来自referer的调试模式参数，已禁止访问: ${refererDebug}`
          );
          return new NextResponse(
            JSON.stringify({
              error: "Access Denied",
              message: "Debug mode is not allowed.",
              code: "DEBUG_MODE_BLOCKED",
            }),
            {
              status: 403,
              headers: {
                "Content-Type": "application/json",
                "X-Debug-Blocked": "true",
              },
            }
          );
        }
      }
    }
    let geoResult;

    // 🚨 调试模式已被完全移除，只使用正常地理位置检测
    // 获取客户端真实IP并检测地理位置
    const clientIP = getClientIP(request);

    if (!clientIP) {
      console.warn("无法获取客户端IP，使用默认处理");
      return NextResponse.next();
    }

    // 检测地理位置
    geoResult = await geoRouter.detect(clientIP);

    console.log(
      `IP: ${clientIP}, 国家: ${geoResult.countryCode}, 地区: ${geoResult.region}`
    );

    // 1. 禁止欧洲IP访问（完全屏蔽，不允许任何欧洲IP访问，包括调试模式）
    if (geoResult.region === RegionType.EUROPE) {
      console.log(`禁止欧洲IP访问: ${geoResult.countryCode}`);
      return new NextResponse(
        JSON.stringify({
          error: "Access Denied",
          message:
            "This service is not available in your region due to regulatory requirements.",
          code: "REGION_BLOCKED",
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // 2. 地理分流逻辑（调试模式已被移除）
    if (!pathname.startsWith("/api/")) {
      const domesticUrl = process.env.DOMESTIC_SYSTEM_URL;
      const internationalUrl = process.env.INTERNATIONAL_SYSTEM_URL;

      // 如果配置了分流URL，则进行重定向
      if (domesticUrl && internationalUrl) {
        const isDomestic = geoResult.region === RegionType.CHINA;
        const targetUrl = isDomestic ? domesticUrl : internationalUrl;

        // 如果当前域名不是目标域名，则重定向
        const currentHost = request.headers.get("host");
        const targetHost = new URL(targetUrl).host;

        if (currentHost !== targetHost) {
          const redirectUrl = new URL(request.url);
          redirectUrl.protocol = new URL(targetUrl).protocol;
          redirectUrl.host = targetHost;

          console.log(
            `分流用户: ${geoResult.countryCode} -> ${redirectUrl.toString()}`
          );

          return NextResponse.redirect(redirectUrl, {
            status: 302, // 临时重定向
          });
        }
      }
    }

    // 3. 为响应添加地理信息头（用于前端判断区域）
    const response = NextResponse.next();
    // 为 API 路由添加 CORS 响应头（基于白名单反射）
    if (pathname.startsWith("/api/")) {
      const origin = request.headers.get("origin") || "";
      const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (origin && allowedOrigins.includes(origin)) {
        response.headers.set("Access-Control-Allow-Origin", origin);
        response.headers.set(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, DELETE, OPTIONS"
        );
        response.headers.set(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization"
        );
        response.headers.set("Access-Control-Allow-Credentials", "true");
      }
    }
    response.headers.set("X-User-Region", geoResult.region);
    response.headers.set("X-User-Country", geoResult.countryCode);
    response.headers.set("X-User-Currency", geoResult.currency);

    // 🚨 调试模式已被完全移除，不再设置调试头

    // 4. CSRF防护 - 对状态改变请求进行CSRF验证
    const csrfResponse = await csrfProtection(request, response);
    if (csrfResponse.status !== 200) {
      return csrfResponse;
    }

    return response;
  } catch (error) {
    console.error("地理分流中间件错误:", error);

    // 出错时使用降级策略：允许访问但记录错误
    const response = NextResponse.next();
    response.headers.set("X-Geo-Error", "true");

    return response;
  }
}

/**
 * 获取客户端真实IP地址
 * 处理各种代理和CDN的情况
 */
function getClientIP(request: NextRequest): string | null {
  // 优先级：X-Real-IP > X-Forwarded-For > request.ip

  // 1. 检查 X-Real-IP（Nginx等代理设置）
  const realIP = request.headers.get("x-real-ip");
  if (realIP && isValidIP(realIP)) {
    return realIP;
  }

  // 2. 检查 X-Forwarded-For（多个代理的情况）
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // X-Forwarded-For 可能包含多个IP，取第一个（最原始的客户端IP）
    const ips = forwardedFor.split(",").map((ip) => ip.trim());
    for (const ip of ips) {
      if (isValidIP(ip)) {
        return ip;
      }
    }
  }

  // 3. 检查其他可能的头
  const possibleHeaders = [
    "x-client-ip",
    "x-forwarded",
    "forwarded-for",
    "forwarded",
    "cf-connecting-ip", // Cloudflare
    "true-client-ip", // Akamai
  ];

  for (const header of possibleHeaders) {
    const ip = request.headers.get(header);
    if (ip && isValidIP(ip)) {
      return ip;
    }
  }

  return null;
}

/**
 * 验证IP地址格式
 */
function isValidIP(ip: string): boolean {
  // IPv4 验证
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  if (ipv4Regex.test(ip)) {
    const parts = ip.split(".").map(Number);
    return parts.every((part) => part >= 0 && part <= 255);
  }

  // IPv6 验证（简化版）
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  return ipv6Regex.test(ip);
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径，包括 API 路由（需要设置区域 Header）
     * 排除：
     * - Next.js 内部路由 (/_next/...)
     * - 静态文件 (favicon.ico 等)
     */
    "/((?!_next/|favicon.ico).*)",
  ],
};
