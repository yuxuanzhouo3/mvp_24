// lib/architecture-modules/core/types.ts - 核心类型定义
export enum RegionType {
  CHINA = "china",
  USA = "usa",
  EUROPE = "europe",
  INDIA = "india",
  SINGAPORE = "singapore",
  OTHER = "other",
}

export interface GeoResult {
  region: RegionType;
  countryCode: string;
  currency: string;
  paymentMethods: string[];
  authMethods: string[];
  database: "supabase" | "cloudbase";
  deployment: "vercel" | "tencent";
  gdprCompliant: boolean;
}

export interface EnvironmentConfig {
  // 基础配置
  NODE_ENV: string;
  APP_NAME: string;
  APP_URL: string;

  // 数据库配置
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  WECHAT_CLOUDBASE_ID?: string;

  // 支付配置
  STRIPE_PUBLIC_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  WECHAT_APP_ID?: string;
  WECHAT_MCH_ID?: string;
  WECHAT_API_KEY?: string;
  ALIPAY_APP_ID?: string;
  ALIPAY_PRIVATE_KEY?: string;

  // 认证配置
  WECHAT_APP_SECRET?: string;

  // 订阅配置
  SUBSCRIPTION_PLANS?: string; // JSON string
}

export interface SubscriptionPlan {
  pro: {
    price: { monthly: number; yearly: number };
    features: string[];
  };
}

export interface PaymentConfig {
  methods: string[];
  currency: string;
  gdprCompliant: boolean;
}

export interface DatabaseConfig {
  type: "supabase" | "cloudbase";
  connectionString?: string;
  envId?: string;
}

export interface UserContext {
  ip: string;
  geo: GeoResult;
  config: EnvironmentConfig;
  userId?: string;
  subscription?: {
    plan: string;
    status: string;
    expireTime: Date;
  };
}
