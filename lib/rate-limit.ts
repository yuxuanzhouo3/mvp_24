// lib/rate-limit.ts - Rate limiting middleware for API routes
import rateLimit from "express-rate-limit";
import { ipKeyGenerator } from "express-rate-limit";
import { logWarn, logSecurityEvent } from "./logger";

// In-memory store for Edge Runtime rate limiting
class MemoryStore {
  private store = new Map<string, { count: number; resetTime: number }>();

  incr(key: string, windowMs: number) {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || now > record.resetTime) {
      this.store.set(key, { count: 1, resetTime: now + windowMs });
      return { count: 1, resetTime: now + windowMs };
    } else {
      record.count++;
      return { count: record.count, resetTime: record.resetTime };
    }
  }

  // Clean up old entries
  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (now > record.resetTime) {
        this.store.delete(key);
      }
    }
  }
}

const memoryStore = new MemoryStore();

// Clean up memory store every 5 minutes
setInterval(() => memoryStore.cleanup(), 5 * 60 * 1000);

// Edge Runtime compatible rate limiter
export function createEdgeRateLimit(options: {
  windowMs: number;
  max: number;
  message?: string;
  skip?: (req: Request) => boolean;
  handler?: (req: Request) => Response;
}) {
  const {
    windowMs,
    max,
    message = "Too many requests, please try again later.",
    skip,
    handler,
  } = options;

  return async (req: Request): Promise<Response | null> => {
    // Skip if condition met
    if (skip && skip(req)) {
      return null;
    }

    // Get client IP (in Edge Runtime, this might be limited)
    const ip =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const key = `rate_limit_${ip}`;
    const result = memoryStore.incr(key, windowMs);

    if (result.count > max) {
      logWarn("edge_rate_limit_exceeded", {
        ip,
        endpoint: new URL(req.url).pathname,
        method: req.method,
        count: result.count,
        max,
        windowMs,
      });

      if (handler) {
        return handler(req);
      }

      return new Response(
        JSON.stringify({
          error: message,
          retryAfter:
            Math.ceil((result.resetTime - Date.now()) / 1000) + " seconds",
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return null; // Continue to next handler
  };
}

// Rate limit configurations for different endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: "Too many authentication attempts, please try again later.",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Configure for Next.js/Vercel environment with IPv6 support
  keyGenerator: (req: any) => {
    // Extract IP from headers for Vercel/Next.js
    const forwardedFor =
      req.headers?.get?.("x-forwarded-for") || req.headers?.["x-forwarded-for"];
    if (forwardedFor) {
      // Use ipKeyGenerator for proper IPv6 handling
      return ipKeyGenerator(forwardedFor.split(",")[0].trim());
    }

    const realIp =
      req.headers?.get?.("x-real-ip") ||
      req.headers?.["x-real-ip"] ||
      req.ip ||
      "unknown";

    return ipKeyGenerator(realIp);
  },
  handler: (req: any, res: any) => {
    const ip =
      req.headers?.get?.("x-forwarded-for") ||
      req.headers?.get?.("x-real-ip") ||
      req.headers?.["x-forwarded-for"] ||
      req.headers?.["x-real-ip"] ||
      req.ip ||
      "unknown";

    logSecurityEvent("auth_rate_limit_exceeded", undefined, ip, {
      endpoint: req.url || req.originalUrl,
      method: req.method,
      userAgent: req.headers?.get?.("user-agent") || req.get?.("User-Agent"),
    });

    res.status(429).json({
      error: "Too many authentication attempts, please try again later.",
      retryAfter: "15 minutes",
    });
  },
  skip: (req: any) => {
    // Skip rate limiting for health checks or internal requests
    return (
      req.url?.includes("/health") ||
      req.originalUrl?.includes("/health") ||
      req.headers?.get?.("x-internal-request") === "true" ||
      req.headers?.["x-internal-request"] === "true"
    );
  },
});

export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: "Too many API requests, please try again later.",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Configure for Next.js/Vercel environment with IPv6 support
  keyGenerator: (req: any) => {
    // Extract IP from headers for Vercel/Next.js
    const forwardedFor =
      req.headers?.get?.("x-forwarded-for") || req.headers?.["x-forwarded-for"];
    if (forwardedFor) {
      // Use ipKeyGenerator for proper IPv6 handling
      return ipKeyGenerator(forwardedFor.split(",")[0].trim());
    }

    const realIp =
      req.headers?.get?.("x-real-ip") ||
      req.headers?.["x-real-ip"] ||
      req.ip ||
      "unknown";

    return ipKeyGenerator(realIp);
  },
  handler: (req: any, res: any) => {
    const ip =
      req.headers?.get?.("x-forwarded-for") ||
      req.headers?.get?.("x-real-ip") ||
      req.headers?.["x-forwarded-for"] ||
      req.headers?.["x-real-ip"] ||
      req.ip ||
      "unknown";

    logWarn("api_rate_limit_exceeded", {
      endpoint: req.url || req.originalUrl,
      method: req.method,
      ip,
      userAgent: req.headers?.get?.("user-agent") || req.get?.("User-Agent"),
    });

    res.status(429).json({
      error: "Too many API requests, please try again later.",
      retryAfter: "15 minutes",
    });
  },
  skip: (req: any) => {
    // Skip rate limiting for health checks or internal requests
    return (
      req.url?.includes("/health") ||
      req.originalUrl?.includes("/health") ||
      req.headers?.get?.("x-internal-request") === "true" ||
      req.headers?.["x-internal-request"] === "true"
    );
  },
});

export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 chat requests per minute
  message: {
    error: "Too many chat requests, please slow down.",
    retryAfter: "1 minute",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Configure for Next.js/Vercel environment with IPv6 support
  keyGenerator: (req: any) => {
    // Extract IP from headers for Vercel/Next.js
    const forwardedFor =
      req.headers?.get?.("x-forwarded-for") || req.headers?.["x-forwarded-for"];
    if (forwardedFor) {
      // Use ipKeyGenerator for proper IPv6 handling
      return ipKeyGenerator(forwardedFor.split(",")[0].trim());
    }

    const realIp =
      req.headers?.get?.("x-real-ip") ||
      req.headers?.["x-real-ip"] ||
      req.ip ||
      "unknown";

    return ipKeyGenerator(realIp);
  },
  handler: (req: any, res: any) => {
    const ip =
      req.headers?.get?.("x-forwarded-for") ||
      req.headers?.get?.("x-real-ip") ||
      req.headers?.["x-forwarded-for"] ||
      req.headers?.["x-real-ip"] ||
      req.ip ||
      "unknown";

    logWarn("chat_rate_limit_exceeded", {
      endpoint: req.url || req.originalUrl,
      method: req.method,
      ip,
      userAgent: req.headers?.get?.("user-agent") || req.get?.("User-Agent"),
    });

    res.status(429).json({
      error: "Too many chat requests, please slow down.",
      retryAfter: "1 minute",
    });
  },
});

export const paymentRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 payment operations per minute
  message: {
    error: "Too many payment operations, please try again later.",
    retryAfter: "1 minute",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Configure for Next.js/Vercel environment with IPv6 support
  keyGenerator: (req: any) => {
    // Extract IP from headers for Vercel/Next.js
    const forwardedFor =
      req.headers?.get?.("x-forwarded-for") || req.headers?.["x-forwarded-for"];
    if (forwardedFor) {
      // Use ipKeyGenerator for proper IPv6 handling
      return ipKeyGenerator(forwardedFor.split(",")[0].trim());
    }

    const realIp =
      req.headers?.get?.("x-real-ip") ||
      req.headers?.["x-real-ip"] ||
      req.ip ||
      "unknown";

    return ipKeyGenerator(realIp);
  },
  handler: (req: any, res: any) => {
    const ip =
      req.headers?.get?.("x-forwarded-for") ||
      req.headers?.get?.("x-real-ip") ||
      req.headers?.["x-forwarded-for"] ||
      req.headers?.["x-real-ip"] ||
      req.ip ||
      "unknown";

    logSecurityEvent("payment_rate_limit_exceeded", undefined, ip, {
      endpoint: req.url || req.originalUrl,
      method: req.method,
      userAgent: req.headers?.get?.("user-agent") || req.get?.("User-Agent"),
    });

    res.status(429).json({
      error: "Too many payment operations, please try again later.",
      retryAfter: "1 minute",
    });
  },
  skip: (req: any) => {
    // Skip rate limiting in development environment
    if (process.env.NODE_ENV === "development") {
      return true;
    }
    // Skip for health checks or internal requests
    return (
      req.url?.includes("/health") ||
      req.originalUrl?.includes("/health") ||
      req.headers?.get?.("x-internal-request") === "true" ||
      req.headers?.["x-internal-request"] === "true"
    );
  },
});

// Stricter rate limit for webhook endpoints (should be very restrictive)
export const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // Allow more requests for webhooks but still limit abuse
  message: {
    error: "Too many webhook requests",
    retryAfter: "1 minute",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Configure for Next.js/Vercel environment with IPv6 support
  keyGenerator: (req: any) => {
    // Extract IP from headers for Vercel/Next.js
    const forwardedFor =
      req.headers?.get?.("x-forwarded-for") || req.headers?.["x-forwarded-for"];
    if (forwardedFor) {
      // Use ipKeyGenerator for proper IPv6 handling
      return ipKeyGenerator(forwardedFor.split(",")[0].trim());
    }

    const realIp =
      req.headers?.get?.("x-real-ip") ||
      req.headers?.["x-real-ip"] ||
      req.ip ||
      "unknown";

    return ipKeyGenerator(realIp);
  },
  handler: (req: any, res: any) => {
    const ip =
      req.headers?.get?.("x-forwarded-for") ||
      req.headers?.get?.("x-real-ip") ||
      req.headers?.["x-forwarded-for"] ||
      req.headers?.["x-real-ip"] ||
      req.ip ||
      "unknown";

    logSecurityEvent("webhook_rate_limit_exceeded", undefined, ip, {
      endpoint: req.url || req.originalUrl,
      method: req.method,
      userAgent: req.headers?.get?.("user-agent") || req.get?.("User-Agent"),
    });

    res.status(429).json({
      error: "Too many webhook requests",
      retryAfter: "1 minute",
    });
  },
});

// Edge Runtime compatible rate limiters
export const edgeChatRateLimit = createEdgeRateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: "Too many chat requests, please slow down.",
  handler: (req) => {
    logWarn("edge_chat_rate_limit_exceeded", {
      endpoint: new URL(req.url).pathname,
      method: req.method,
      ip: req.headers.get("x-forwarded-for") || "unknown",
    });

    return new Response(
      JSON.stringify({
        error: "Too many chat requests, please slow down.",
        retryAfter: "1 minute",
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }
    );
  },
});

export const edgeAuthRateLimit = createEdgeRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 auth attempts per 15 minutes
  message: "Too many authentication attempts, please try again later.",
  handler: (req) => {
    logSecurityEvent(
      "edge_auth_rate_limit_exceeded",
      undefined,
      req.headers.get("x-forwarded-for") || "unknown",
      {
        endpoint: new URL(req.url).pathname,
        method: req.method,
      }
    );

    return new Response(
      JSON.stringify({
        error: "Too many authentication attempts, please try again later.",
        retryAfter: "15 minutes",
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }
    );
  },
});

// Create a custom rate limiter for user-based limiting (when user is authenticated)
export function createUserRateLimit(
  windowMs: number,
  maxRequests: number,
  userIdField = "userId"
) {
  const userRequests = new Map<string, { count: number; resetTime: number }>();

  return (req: any, res: any, next: any) => {
    const userId =
      req[userIdField] || req.body?.[userIdField] || req.query?.[userIdField];
    const now = Date.now();

    if (!userId) {
      // If no user ID, fall back to IP-based limiting
      return apiRateLimit(req, res, next);
    }

    const userKey = `user_${userId}`;
    const userData = userRequests.get(userKey);

    if (!userData || now > userData.resetTime) {
      // First request or window expired
      userRequests.set(userKey, {
        count: 1,
        resetTime: now + windowMs,
      });
      next();
    } else if (userData.count < maxRequests) {
      // Within limit
      userData.count++;
      next();
    } else {
      // Rate limit exceeded
      logWarn("user_rate_limit_exceeded", {
        userId,
        endpoint: req.url,
        method: req.method,
        count: userData.count,
        maxRequests,
        windowMs,
      });

      res.status(429).json({
        error: "Too many requests, please try again later.",
        retryAfter: Math.ceil((userData.resetTime - now) / 1000) + " seconds",
      });
    }

    // Clean up old entries periodically
    if (Math.random() < 0.01) {
      // 1% chance to clean up
      for (const [key, data] of userRequests.entries()) {
        if (now > data.resetTime) {
          userRequests.delete(key);
        }
      }
    }
  };
}
