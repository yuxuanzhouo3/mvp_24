/**
 * 部署配置文件
 *
 * 这个文件集中管理所有部署相关的配置，包括：
 * - 部署区域（CN/INTL）
 * - 服务提供商选择
 * - 功能开关
 *
 * 由于环境变量在腾讯云运行时的限制，我们使用 TypeScript 配置文件而不是 .env
 *
 * 使用方式：
 * - 开发环境：直接修改此文件测试不同配置
 * - 生产环境：在打包/部署前修改此文件或通过构建脚本注入配置
 */

/**
 * 部署区域类型
 */
export type DeploymentRegion = "CN" | "INTL";

/**
 * 部署配置接口
 */
export interface DeploymentConfig {
  /** 部署区域：CN=中国，INTL=国际 */
  region: DeploymentRegion;

  /** 应用名称 */
  appName: string;

  /** 应用版本 */
  version: string;

  /** 认证配置 */
  auth: {
    provider: "cloudbase" | "supabase";
    features: {
      emailAuth: boolean;
      wechatAuth: boolean;
      googleAuth: boolean;
      githubAuth: boolean;
    };
  };

  /** 数据库配置 */
  database: {
    provider: "cloudbase" | "supabase";
  };

  /** 支付配置 */
  payment: {
    providers: Array<"stripe" | "paypal" | "wechat" | "alipay">;
  };

  /** API 端点 */
  apis: {
    authCallbackPath: string;
  };

  /** 日志配置 */
  logging: {
    level: "debug" | "info" | "warn" | "error";
    enableConsole: boolean;
  };
}

/**
 * 根据部署区域生成配置
 */
function generateConfig(region: DeploymentRegion): DeploymentConfig {
  const isChinaRegion = region === "CN";

  return {
    region,
    appName: "MultiGPT Platform",
    version: "3.0.0",

    auth: {
      provider: isChinaRegion ? "cloudbase" : "supabase",
      features: {
        emailAuth: true, // 全地区支持
        wechatAuth: isChinaRegion, // 仅中国支持
        googleAuth: !isChinaRegion, // 仅国际支持
        githubAuth: !isChinaRegion, // 仅国际支持
      },
    },

    database: {
      provider: isChinaRegion ? "cloudbase" : "supabase",
    },

    payment: {
      // 中国支持：微信支付、支付宝
      // 国际支持：Stripe、PayPal
      providers: isChinaRegion ? ["wechat", "alipay"] : ["stripe", "paypal"],
    },

    apis: {
      authCallbackPath: "/auth/callback",
    },

    logging: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
      enableConsole: process.env.NODE_ENV !== "production",
    },
  };
}

/**
 * 当前部署配置
 *
 * 修改下面的 DEPLOYMENT_REGION 来切换部署区域：
 * - "CN": 中国区域（使用 CloudBase）
 * - "INTL": 国际区域（使用 Supabase）
 *
 * 环境变量 NEXT_PUBLIC_DEPLOYMENT_REGION：
 * - 未设置或其他值：默认为中国版 (CN)
 * - "INTL"：国际版
 */
const DEPLOYMENT_REGION: DeploymentRegion =
  process.env.NEXT_PUBLIC_DEPLOYMENT_REGION === "INTL" ? "INTL" : "CN";

// 在运行时验证区域设置
if (typeof window === "undefined") {
  // 只在服务器端打印
  console.log(
    `🌍 部署区域已确认: ${DEPLOYMENT_REGION} (使用 ${
      DEPLOYMENT_REGION === "INTL" ? "Supabase" : "CloudBase"
    })`
  );
}

/**
 * 导出当前配置
 */
export const deploymentConfig: DeploymentConfig =
  generateConfig(DEPLOYMENT_REGION);

/**
 * 导出部署区域
 */
export const currentRegion: DeploymentRegion = DEPLOYMENT_REGION;

/**
 * 判断是否为中国区域
 */
export function isChinaDeployment(): boolean {
  return deploymentConfig.region === "CN";
}

/**
 * 判断是否为国际区域
 */
export function isInternationalDeployment(): boolean {
  return deploymentConfig.region === "INTL";
}

/**
 * 获取认证提供商
 */
export function getAuthProvider(): "cloudbase" | "supabase" {
  return deploymentConfig.auth.provider;
}

/**
 * 获取数据库提供商
 */
export function getDatabaseProvider(): "cloudbase" | "supabase" {
  return deploymentConfig.database.provider;
}

/**
 * 检查是否支持某个认证功能
 */
export function isAuthFeatureSupported(
  feature: keyof typeof deploymentConfig.auth.features
): boolean {
  return deploymentConfig.auth.features[feature];
}

/**
 * 获取支持的支付提供商列表
 */
export function getPaymentProviders(): DeploymentConfig["payment"]["providers"] {
  return deploymentConfig.payment.providers;
}

/**
 * 检查是否支持某个支付方式
 */
export function isPaymentMethodSupported(
  method: DeploymentConfig["payment"]["providers"][number]
): boolean {
  return deploymentConfig.payment.providers.includes(method);
}

/**
 * 导出完整配置（用于调试）
 */
export function getFullConfig(): DeploymentConfig {
  return deploymentConfig;
}
