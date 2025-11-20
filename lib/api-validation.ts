import { z } from "zod";
import { NextRequest } from "next/server";

// 通用API验证工具
export class ApiValidator {
  /**
   * 验证请求体
   */
  static async validateBody<T>(
    req: NextRequest,
    schema: z.ZodSchema<T>
  ): Promise<{ success: true; data: T } | { success: false; error: string }> {
    try {
      // 检查Content-Type
      const contentType = req.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        return {
          success: false,
          error: "Content-Type must be application/json",
        };
      }

      // 检查请求体大小 (10MB限制)
      const contentLength = req.headers.get("content-length");
      if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
        return { success: false, error: "Request body too large (max 10MB)" };
      }

      const body = await req.json();
      const result = schema.safeParse(body);

      if (!result.success) {
        return {
          success: false,
          error: `Validation failed: ${result.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ")}`,
        };
      }

      return { success: true, data: result.data };
    } catch (error) {
      return { success: false, error: "Invalid JSON in request body" };
    }
  }

  /**
   * 验证查询参数
   */
  static validateQuery<T>(
    searchParams: URLSearchParams,
    schema: z.ZodSchema<T>
  ): { success: true; data: T } | { success: false; error: string } {
    try {
      const queryData: Record<string, any> = {};

      // 转换searchParams为对象
      for (const [key, value] of searchParams.entries()) {
        // 处理数组参数 (key[]=value1&key[]=value2)
        if (key.endsWith("[]")) {
          const arrayKey = key.slice(0, -2);
          if (!queryData[arrayKey]) {
            queryData[arrayKey] = [];
          }
          queryData[arrayKey].push(value);
        } else {
          queryData[key] = value;
        }
      }

      const result = schema.safeParse(queryData);

      if (!result.success) {
        return {
          success: false,
          error: `Query validation failed: ${result.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ")}`,
        };
      }

      return { success: true, data: result.data };
    } catch (error) {
      return { success: false, error: "Invalid query parameters" };
    }
  }

  /**
   * 验证路径参数
   */
  static validateParams<T>(
    params: Record<string, string | string[]>,
    schema: z.ZodSchema<T>
  ): { success: true; data: T } | { success: false; error: string } {
    try {
      const result = schema.safeParse(params);

      if (!result.success) {
        return {
          success: false,
          error: `Path validation failed: ${result.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ")}`,
        };
      }

      return { success: true, data: result.data };
    } catch (error) {
      return { success: false, error: "Invalid path parameters" };
    }
  }
}

// 常用验证schema
export const commonSchemas = {
  // 分页参数
  pagination: z.object({
    limit: z.coerce.number().min(1).max(100).default(50),
    offset: z.coerce.number().min(0).default(0),
  }),

  // 会话创建
  createSession: z.object({
    title: z.string().min(1).max(200).trim(),
    model: z.string().optional().default("gpt-3.5-turbo"),
  }),

  // 消息发送
  sendMessage: z.object({
    content: z.string().min(1).max(10000).trim(),
    role: z.enum(["user", "assistant", "system"]).default("user"),
    sessionId: z.string().uuid(),
  }),

  // 用户注册
  userRegistration: z.object({
    email: z.string().email().max(254),
    password: z.string().min(8).max(128),
    name: z.string().min(1).max(100).trim().optional(),
  }),

  // 支付创建
  createPayment: z.object({
    method: z.enum(["stripe", "paypal", "alipay", "wechat"]),
    amount: z.number().positive().max(10000), // 最大10000元
    currency: z.enum(["CNY", "USD"]),
    description: z.string().max(500).optional(),
    planType: z.string().min(1).max(50).optional(),
    billingCycle: z.enum(["monthly", "yearly"]),
    region: z.string().min(1).max(50),
    idempotencyKey: z.string().max(255).optional(),
  }),

  // Webhook验证
  webhookData: z.object({
    eventType: z.string().min(1).max(100),
    data: z.record(z.any()),
    signature: z.string().optional(),
  }),
};
