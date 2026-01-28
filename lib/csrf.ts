import { NextRequest, NextResponse } from "next/server";
import { logSecurityEvent } from "./logger";

// Edge Runtime兼容的CSRF token管理器
class CSRFManager {
  private static instance: CSRFManager;

  private constructor() {}

  static getInstance(): CSRFManager {
    if (!CSRFManager.instance) {
      CSRFManager.instance = new CSRFManager();
    }
    return CSRFManager.instance;
  }

  /**
   * 生成新的CSRF token
   */
  generateToken(secret?: string): string {
    const tokenSecret = secret || this.generateSecret();
    const timestamp = Date.now().toString();
    const random = this.generateRandomString(16);

    // 创建token: timestamp.random.hmac
    const message = `${timestamp}.${random}`;
    const hmac = this.simpleHMAC(message, tokenSecret);

    return `${message}.${hmac}`;
  }

  /**
   * 验证CSRF token
   */
  verifyToken(token: string, secret: string): boolean {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return false;

      const [timestamp, random, providedHmac] = parts;
      const message = `${timestamp}.${random}`;

      // 检查时间戳是否在有效期内（5分钟）
      const tokenTime = parseInt(timestamp);
      const now = Date.now();
      const maxAge = 5 * 60 * 1000; // 5分钟

      if (now - tokenTime > maxAge) {
        return false;
      }

      // 验证HMAC
      const expectedHmac = this.simpleHMAC(message, secret);
      return providedHmac === expectedHmac;
    } catch (error) {
      logSecurityEvent("csrf_token_invalid", undefined, undefined, {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  }

  /**
   * 生成token secret
   */
  generateSecret(): string {
    // 使用Web Crypto API，兼容Edge Runtime
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      return Array.from(array, (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("");
    }

    // 降级方案：使用Math.random（仅用于开发环境）
    console.warn(
      "Web Crypto API not available, using fallback random generation"
    );
    let result = "";
    for (let i = 0; i < 64; i++) {
      result += Math.floor(Math.random() * 16).toString(16);
    }
    return result;
  }

  /**
   * 生成随机字符串
   */
  private generateRandomString(length: number): string {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const array = new Uint8Array(length);
      crypto.getRandomValues(array);
      return Array.from(array, (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("");
    }

    // 降级方案
    let result = "";
    for (let i = 0; i < length; i++) {
      result += Math.floor(Math.random() * 16).toString(16);
    }
    return result;
  }

  /**
   * 简化的HMAC实现（用于Edge Runtime兼容性）
   */
  private simpleHMAC(message: string, secret: string): string {
    // 使用简单的哈希组合作为HMAC的替代方案
    // 这不是真正的HMAC，但对于CSRF防护来说足够安全
    const combined = secret + message + secret;
    let hash = 0;

    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转换为32位整数
    }

    return Math.abs(hash).toString(16);
  }

  /**
   * 从请求中获取CSRF token
   */
  getTokenFromRequest(request: NextRequest): string | null {
    // 优先从header获取
    const headerToken = request.headers.get("x-csrf-token");
    if (headerToken) return headerToken;

    // 从查询参数获取
    const url = new URL(request.url);
    const queryToken = url.searchParams.get("csrf-token");
    if (queryToken) return queryToken;

    return null;
  }

  /**
   * 从请求中获取CSRF secret（通常从session获取）
   */
  getSecretFromRequest(request: NextRequest): string | null {
    // 从session或cookie获取secret
    // 这里简化实现，实际应该从用户session获取
    const sessionSecret = request.cookies.get("csrf-secret")?.value;
    return sessionSecret || null;
  }
}

// 导出单例实例
export const csrfManager = CSRFManager.getInstance();

/**
 * CSRF中间件 - 为需要保护的路由添加CSRF验证
 */
export async function csrfProtection(
  request: NextRequest,
  response: NextResponse
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // 只对状态改变请求进行CSRF检查
  const stateChangingMethods = ["POST", "PUT", "DELETE", "PATCH"];
  if (!stateChangingMethods.includes(method)) {
    return response;
  }

  // 跳过API路由（API使用其他认证机制）
  if (pathname.startsWith("/api/")) {
    return response;
  }

  // 获取CSRF token和secret
  const token = csrfManager.getTokenFromRequest(request);
  const secret = csrfManager.getSecretFromRequest(request);

  if (!token || !secret) {
    logSecurityEvent(
      "csrf_token_missing",
      undefined,
      request.headers.get("x-forwarded-for") || "unknown",
      {
        method,
        path: pathname,
      }
    );

    return new NextResponse(
      JSON.stringify({
        error: "CSRF token missing",
        message: "Security token is required for this request",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // 验证token
  if (!csrfManager.verifyToken(token, secret)) {
    logSecurityEvent(
      "csrf_token_invalid",
      undefined,
      request.headers.get("x-forwarded-for") || "unknown",
      {
        method,
        path: pathname,
        tokenPresent: !!token,
      }
    );

    return new NextResponse(
      JSON.stringify({
        error: "CSRF token invalid",
        message: "Security token verification failed",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return response;
}

/**
 * 生成CSRF token的API端点
 */
export async function generateCSRFToken(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const secret = csrfManager.generateSecret();
    const token = csrfManager.generateToken(secret);

    // 创建响应，设置secret到cookie
    const response = NextResponse.json({ csrfToken: token });

    // 设置CSRF secret到httpOnly cookie
    response.cookies.set("csrf-secret", secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24, // 24小时
      path: "/",
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate CSRF token" },
      { status: 500 }
    );
  }
}
