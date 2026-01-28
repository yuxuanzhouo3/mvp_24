import { NextRequest, NextResponse } from "next/server";
import { geoRouter } from "@/lib/architecture-modules/core/geo-router";
import { RegionType } from "@/lib/architecture-modules/core/types";
import {
  validateEnvironment,
  checkSensitiveDataExposure,
} from "@/lib/env-validation";
import { csrfProtection } from "@/lib/csrf";
import { verifyAdminSessionToken } from "@/lib/admin/session";

/**
 * IP检测和访问控制中间件
 * 实现以下功能：
 * 1. 检测用户IP地理位置
 * 2. 完全禁止欧洲IP访问（符合GDPR合规要求）
 * 3. 为响应添加地理信息头供前端使用
 * 4. Admin 后台路由保护
 *
 * 注意：不进行任何重定向，用户访问哪个域名就使用哪个系统
 */
export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // =====================
  // Admin 路由保护
  // =====================
  if (pathname.startsWith("/admin")) {
    // 登录页不需要验证
    if (pathname === "/admin/login") {
      // 如果已登录，重定向到管理页
      const token = request.cookies.get("admin_session")?.value;
      if (token) {
        const session = verifyAdminSessionToken(token);
        if (session) {
          return NextResponse.redirect(new URL("/admin/ads", request.url));
        }
      }
      return NextResponse.next();
    }

    // 其他 admin 页面需要验证
    const token = request.cookies.get("admin_session")?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    const session = verifyAdminSessionToken(token);
    if (!session) {
      // Token 无效或过期，重定向到登录页
      const response = NextResponse.redirect(new URL("/admin/login", request.url));
      // 清除无效的 cookie
      response.cookies.delete("admin_session");
      return response;
    }

    return NextResponse.next();
  }

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
    // 检查URL参数中的debug模式（仅开发环境支持）
    const debugParam = searchParams.get("debug");
    const isDevelopment = process.env.NODE_ENV === "development";

    // 🚨 生产环境安全检查：禁止调试模式访问
    if (debugParam && !isDevelopment) {
      console.warn(`🚨 生产环境检测到调试模式参数，已禁止访问: ${debugParam}`);
      return new NextResponse(
        JSON.stringify({
          error: "Access Denied",
          message: "Debug mode is not allowed in production.",
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
    if (pathname.startsWith("/api/") && !isDevelopment) {
      const referer = request.headers.get("referer");
      if (referer) {
        const refererUrl = new URL(referer);
        const refererDebug = refererUrl.searchParams.get("debug");

        // 生产环境禁用来自referer的调试模式
        if (refererDebug) {
          console.warn(
            `🚨 生产环境检测到来自referer的调试模式参数，已禁止访问: ${refererDebug}`
          );
          return new NextResponse(
            JSON.stringify({
              error: "Access Denied",
              message: "Debug mode is not allowed in production.",
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

    // 开发环境支持调试模式
    if (debugParam && isDevelopment) {
      console.log(`� 调试模式启用: ${debugParam}`);

      // 根据debug参数设置模拟的地理位置
      switch (debugParam.toLowerCase()) {
        case "china":
          geoResult = {
            region: RegionType.CHINA,
            countryCode: "CN",
            currency: "CNY",
          };
          break;
        case "usa":
        case "us":
          geoResult = {
            region: RegionType.USA,
            countryCode: "US",
            currency: "USD",
          };
          break;
        case "europe":
        case "eu":
          geoResult = {
            region: RegionType.EUROPE,
            countryCode: "DE",
            currency: "EUR",
          };
          break;
        default:
          // 无效的debug参数，回退到正常检测
          const clientIP = getClientIP(request);
          geoResult = await geoRouter.detect(clientIP || "");
      }
    } else {
      // 正常地理位置检测
      // 获取客户端真实IP并检测地理位置
      const clientIP = getClientIP(request);

      if (!clientIP) {
        console.warn("无法获取客户端IP，使用默认处理");
        return NextResponse.next();
      }

      // 检测地理位置
      geoResult = await geoRouter.detect(clientIP);
    }

    console.log(
      `IP检测结果 - 国家: ${geoResult.countryCode}, 地区: ${geoResult.region}${
        debugParam && isDevelopment ? " (调试模式)" : ""
      }`
    );

    // 1. 禁止欧洲IP访问（开发环境调试模式除外）
    if (
      geoResult.region === RegionType.EUROPE &&
      !(debugParam && isDevelopment)
    ) {
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

    // 2. 为响应添加地理信息头（用于前端判断区域）
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

    // 开发环境添加调试模式标识
    if (debugParam && isDevelopment) {
      response.headers.set("X-Debug-Mode", debugParam);
    }

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
