import { z } from "zod";

// 环境变量验证schema
const envSchema = z.object({
  // 基础配置
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  APP_NAME: z.string().min(1).default("MultiGPT Platform"),
  APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  // Supabase配置
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),

  // Stripe配置
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z
    .string()
    .regex(/^pk_(test|live)_/)
    .optional(),
  STRIPE_SECRET_KEY: z
    .string()
    .regex(/^sk_(test|live)_/)
    .optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),

  // Stripe价格ID
  STRIPE_PRO_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_PRO_ANNUAL_PRICE_ID: z.string().optional(),
  STRIPE_TEAM_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_TEAM_ANNUAL_PRICE_ID: z.string().optional(),

  // PayPal配置
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  PAYPAL_MODE: z.enum(["sandbox", "live"]).default("sandbox"),

  // PayPal计划ID
  PAYPAL_PRO_MONTHLY_PLAN_ID: z.string().optional(),
  PAYPAL_PRO_ANNUAL_PLAN_ID: z.string().optional(),
  PAYPAL_TEAM_MONTHLY_PLAN_ID: z.string().optional(),
  PAYPAL_TEAM_ANNUAL_PLAN_ID: z.string().optional(),

  // AI提供商配置
  OPENAI_API_KEY: z.string().regex(/^sk-/).optional(),
  OPENAI_ORG_ID: z.string().optional(),
  ANTHROPIC_API_KEY: z
    .string()
    .regex(/^sk-ant-/)
    .optional(),
  DASHSCOPE_API_KEY: z.string().optional(), // 阿里云通义千问
  DASHSCOPE_BASE_URL: z.string().url().optional(),
  AI_GATEWAY_API_KEY: z.string().optional(), // Vercel AI Gateway

  // 地理分流配置
  ALLOWED_ORIGINS: z.string().optional(),
  DOMESTIC_SYSTEM_URL: z.string().url().optional(),
  INTERNATIONAL_SYSTEM_URL: z.string().url().optional(),

  // 监控配置
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z
    .string()
    .regex(/^\d*\.?\d+$/)
    .optional(),

  // Vercel配置
  VERCEL_URL: z.string().optional(),
});

/**
 * 验证环境变量
 */
export function validateEnvironment():
  | { success: true }
  | { success: false; errors: string[] } {
  try {
    const envData: Record<string, string | undefined> = {};

    // 收集所有环境变量
    for (const key in process.env) {
      envData[key] = process.env[key];
    }

    const result = envSchema.safeParse(envData);

    if (!result.success) {
      const errors = result.error.errors.map(
        (err) => `${err.path.join(".")}: ${err.message}`
      );
      return { success: false, errors };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      errors: [
        `Environment validation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      ],
    };
  }
}

/**
 * 获取验证后的环境变量
 */
export function getValidatedEnv(): z.infer<typeof envSchema> {
  const validation = validateEnvironment();
  if (!validation.success) {
    throw new Error(
      `Environment validation failed:\n${validation.errors.join("\n")}`
    );
  }

  return envSchema.parse(process.env);
}

/**
 * 检查敏感信息泄露风险
 */
export function checkSensitiveDataExposure(): {
  safe: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // 检查是否在客户端代码中暴露了敏感信息
  const sensitiveKeys = [
    "STRIPE_SECRET_KEY",
    "PAYPAL_CLIENT_SECRET",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "DASHSCOPE_API_KEY",
    "AI_GATEWAY_API_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SENTRY_DSN", // 虽然DSN是公开的，但仍需检查
  ];

  for (const key of sensitiveKeys) {
    if (process.env[key] && typeof window !== "undefined") {
      warnings.push(
        `Sensitive environment variable ${key} is accessible in browser context`
      );
    }
  }

  // 检查API密钥格式
  if (
    process.env.STRIPE_SECRET_KEY &&
    !process.env.STRIPE_SECRET_KEY.startsWith("sk_")
  ) {
    warnings.push("Stripe secret key does not have expected format");
  }

  if (
    process.env.OPENAI_API_KEY &&
    !process.env.OPENAI_API_KEY.startsWith("sk-")
  ) {
    warnings.push("OpenAI API key does not have expected format");
  }

  return { safe: warnings.length === 0, warnings };
}

/**
 * 加密敏感配置存储（概念实现）
 * 注意：这只是一个示例，实际实现需要更安全的加密方案
 */
export class SecureConfig {
  private static encryptedConfigs = new Map<string, string>();

  static storeSecure(key: string, value: string): void {
    // 在生产环境中，这里应该使用真正的加密
    // 这里只是一个占位符实现
    const encrypted = Buffer.from(value).toString("base64");
    this.encryptedConfigs.set(key, encrypted);
  }

  static getSecure(key: string): string | null {
    const encrypted = this.encryptedConfigs.get(key);
    if (!encrypted) return null;

    // 在生产环境中，这里应该使用真正的解密
    return Buffer.from(encrypted, "base64").toString();
  }
}
