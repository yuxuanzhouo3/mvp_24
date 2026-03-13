/**
 * 区域配置管理
 *
 * 这个文件提供区域判断工具，实际的部署配置来自 deployment.config.ts
 *
 * 使用方式：
 * - 修改 lib/config/deployment.config.ts 中的 DEPLOYMENT_REGION 来切换区域
 * - 不再依赖环境变量（因为腾讯云运行时的限制）
 */

import { currentRegion } from "./deployment.config";

export type Region = "CN" | "INTL";

/**
 * 延迟初始化部署区域，避免构建时访问环境变量
 */
let cachedRegion: Region | null = null;

function getDeployRegion(): Region {
  if (cachedRegion) {
    return cachedRegion;
  }

  // 从 deployment.config.ts 读取配置
  cachedRegion = currentRegion;

  return cachedRegion;
}

/**
 * 获取当前部署区域
 * 注意：这会在运行时动态获取，而不是在构建时
 */
export function getDEPLOY_REGION(): Region {
  return getDeployRegion();
}

/**
 * 导出当前区域作为命名导出（用于向后兼容）
 * 注意：这是一个常量，在编译时确定，不会动态改变
 */
export const DEPLOY_REGION: Region = getDeployRegion();

/**
 * 判断是否为中国区域
 */
export const isChinaRegion = (): boolean => {
  return getDeployRegion() === "CN";
};

/**
 * 判断是否为国际区域
 */
export const isInternationalRegion = (): boolean => {
  return getDeployRegion() === "INTL";
};

/**
 * 服务提供商配置
 */
export const RegionConfig = {
  /**
   * 认证服务提供商
   */
  auth: {
    provider: isChinaRegion() ? "cloudbase" : "supabase",
    features: {
      // 中国：支持邮箱 + 微信登录
      // 国际：支持邮箱 + Google + GitHub
      emailAuth: true, // 所有地区都支持邮箱认证
      wechatAuth: isChinaRegion(), // 只有中国支持微信
      googleAuth: !isChinaRegion(), // 只有国际支持 Google
      githubAuth: !isChinaRegion(), // 只有国际支持 GitHub
    },
  },

  /**
   * 数据库服务提供商
   */
  database: {
    provider: isChinaRegion() ? "cloudbase" : "supabase",
  },

  /**
   * 支付服务提供商
   */
  payment: {
    providers: isChinaRegion() ? ["alipay"] : ["paypal"],
    primary: isChinaRegion() ? "alipay" : "paypal",
  },

  /**
   * AI 服务提供商
   */
  ai: {
    provider: isChinaRegion() ? "deepseek" : "openrouter",
    availableModels: isChinaRegion()
      ? ["deepseek-chat", "deepseek-coder"]
      : [
          "openai/gpt-4o",
          "openai/gpt-4o-mini",
          "anthropic/claude-sonnet-4",
          "google/gemini-2.0-flash",
        ],
  },

  /**
   * 存储服务提供商
   */
  storage: {
    provider: isChinaRegion() ? "cloudbase" : "supabase",
  },

  /**
   * 重定向 URL 配置
   */
  redirectUrls: {
    domestic: process.env.DOMESTIC_SYSTEM_URL,
    international: process.env.INTERNATIONAL_SYSTEM_URL,
  },

  /**
   * IP 检测配置
   */
  ipDetection: {
    enabled: true,
    apiUrl: process.env.IP_API_URL || "https://ipapi.co/json/",
    cacheTtl: parseInt(process.env.GEO_CACHE_TTL || "3600000"), // 1小时
  },
} as const;

/**
 * 环境变量验证
 * 注意：部署区域现在来自 deployment.config.ts，不再依赖环境变量
 */
export function validateRegionConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 部署区域已从 deployment.config.ts 读取，不需要再检查环境变量
  // 自动验证通过因为配置总是有效的（在编译时定义）
  const region = getDeployRegion();
  if (!["CN", "INTL"].includes(region)) {
    // 这在正常情况下不应该发生（编译时已验证）
    errors.push(`❌ 部署区域值无效: ${region}，必须是 CN 或 INTL`);
  }

  // 验证中国区域配置
  if (isChinaRegion()) {
    if (!process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID) {
      errors.push("❌ 中国区域缺少 NEXT_PUBLIC_WECHAT_CLOUDBASE_ID");
    }
    if (!process.env.ALIPAY_APP_ID) {
      errors.push("❌ 中国区域缺少 ALIPAY_APP_ID");
    }
    if (!process.env.DEEPSEEK_API_KEY) {
      errors.push("❌ 中国区域缺少 DEEPSEEK_API_KEY");
    }
  }

  // 验证国际区域配置
  if (isInternationalRegion()) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      errors.push("❌ 国际区域缺少 NEXT_PUBLIC_SUPABASE_URL");
    }
    if (!process.env.PAYPAL_CLIENT_ID) {
      errors.push("❌ 国际区域缺少 PAYPAL_CLIENT_ID");
    }
    if (!process.env.OPENROUTER_API) {
      errors.push("❌ 国际区域缺少 OPENROUTER_API");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 打印当前区域配置信息
 */
export function printRegionConfig() {
  const region = getDeployRegion();
  console.log("\n🌍 ========== 区域配置信息 ==========");
  console.log(`📍 当前区域: ${region === "CN" ? "中国 🇨🇳" : "国际 🌍"}`);
  console.log(`🔐 认证服务: ${RegionConfig.auth.provider}`);
  console.log(`💾 数据库服务: ${RegionConfig.database.provider}`);
  console.log(`💰 支付服务: ${RegionConfig.payment.primary}`);
  console.log(`🤖 AI 服务: ${RegionConfig.ai.provider}`);
  console.log("========================================\n");

  // 验证配置
  const validation = validateRegionConfig();
  if (!validation.valid) {
    console.error("⚠️  配置验证失败:");
    validation.errors.forEach((error) => console.error(error));
    console.log("");
  }
}
