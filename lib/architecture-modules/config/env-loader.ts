// lib/architecture-modules/config/env-loader.ts - 环境变量加载器
import { RegionType, EnvironmentConfig, SubscriptionPlan } from "../core/types";

export class EnvironmentLoader {
  private region: RegionType;

  constructor(region: RegionType) {
    this.region = region;
  }

  /**
   * 加载环境配置
   */
  load(): EnvironmentConfig {
    const config: EnvironmentConfig = {
      // 基础配置
      NODE_ENV: process.env.NODE_ENV || "development",
      APP_NAME: process.env.APP_NAME || "SiteHub",
      APP_URL: this.getAppUrl(), // 支持Vercel自动检测

      // 根据地区加载数据库配置
      ...this.loadDatabaseConfig(),

      // 根据地区加载支付配置
      ...this.loadPaymentConfig(),

      // 根据地区加载认证配置
      ...this.loadAuthConfig(),

      // 订阅配置
      SUBSCRIPTION_PLANS:
        process.env.SUBSCRIPTION_PLANS || this.getDefaultSubscriptionPlans(),
    };

    this.validateConfig(config);
    return config;
  }

  /**
   * 加载数据库配置
   */
  private loadDatabaseConfig(): Partial<EnvironmentConfig> {
    if (this.region === RegionType.CHINA) {
      return {
        WECHAT_CLOUDBASE_ID: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
      };
    } else {
      return {
        SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      };
    }
  }

  /**
   * 加载支付配置
   */
  private loadPaymentConfig(): Partial<EnvironmentConfig> {
    const config: Partial<EnvironmentConfig> = {};

    if (this.region === RegionType.CHINA) {
      // 中国地区：微信支付 + 支付宝
      config.WECHAT_APP_ID = process.env.WECHAT_APP_ID;
      config.WECHAT_MCH_ID = process.env.WECHAT_PAY_MCH_ID;
      config.WECHAT_API_KEY = process.env.WECHAT_PAY_API_V3_KEY;
      config.ALIPAY_APP_ID = process.env.NEXT_PUBLIC_ALIPAY_APP_ID;
      config.ALIPAY_PRIVATE_KEY = process.env.ALIPAY_PRIVATE_KEY;
    } else if (this.region !== RegionType.EUROPE) {
      // 海外非欧洲地区：Stripe + PayPal
      config.STRIPE_PUBLIC_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      config.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
      config.PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
      config.PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
    }
    // 欧洲地区：无支付配置（GDPR）

    return config;
  }

  /**
   * 加载认证配置
   */
  private loadAuthConfig(): Partial<EnvironmentConfig> {
    if (this.region === RegionType.CHINA) {
      return {
        WECHAT_APP_SECRET: process.env.WECHAT_APP_SECRET,
      };
    } else {
      // Supabase OAuth 在服务端配置，无需客户端环境变量
      return {};
    }
  }

  /**
   * 获取应用URL，支持Vercel自动检测
   */
  private getAppUrl(): string {
    // 1. 优先使用显式配置的环境变量
    if (process.env.APP_URL) {
      return process.env.APP_URL;
    }

    // 2. 检测Vercel环境并使用其提供的URL
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}`;
    }

    // 3. 开发环境使用localhost
    if (process.env.NODE_ENV === "development") {
      return "http://localhost:3000";
    }

    // 4. 如果都没有，抛出错误
    throw new Error(
      "APP_URL is required. Set APP_URL environment variable or deploy to Vercel for automatic detection."
    );
  }

  /**
   * 获取默认订阅计划
   */
  private getDefaultSubscriptionPlans(): string {
    const defaultPlans: SubscriptionPlan = {
      pro: {
        price: { monthly: 9.99, yearly: 99.99 },
        features: ["unlimited_sites", "custom_domains", "priority_support"],
      },
    };
    return JSON.stringify(defaultPlans);
  }

  /**
   * 验证配置完整性
   */
  private validateConfig(config: EnvironmentConfig): void {
    const requiredFields = ["APP_NAME", "APP_URL"];

    // 根据地区添加必需字段
    if (this.region === RegionType.CHINA) {
      requiredFields.push("WECHAT_CLOUDBASE_ID");
    } else {
      requiredFields.push("SUPABASE_URL", "SUPABASE_ANON_KEY");
    }

    const missing = requiredFields.filter(
      (field) => !config[field as keyof EnvironmentConfig]
    );

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables for ${
          this.region
        }: ${missing.join(", ")}`
      );
    }
  }

  /**
   * 获取订阅计划配置
   */
  getSubscriptionPlans(): SubscriptionPlan {
    const plansStr =
      process.env.SUBSCRIPTION_PLANS || this.getDefaultSubscriptionPlans();
    try {
      return JSON.parse(plansStr);
    } catch (error) {
      console.warn("Invalid SUBSCRIPTION_PLANS format, using defaults");
      return JSON.parse(this.getDefaultSubscriptionPlans());
    }
  }
}

/**
 * 根据IP自动创建环境加载器
 */
export async function createEnvironmentLoader(
  ip: string
): Promise<EnvironmentLoader> {
  const { geoRouter } = await import("../core/geo-router");
  const geoResult = await geoRouter.detect(ip);
  return new EnvironmentLoader(geoResult.region);
}
