/**
 * 🔧 AI 配置加载器
 * 根据区域自动加载对应的 AI 配置
 */

import { AIRegionConfig } from "./types";
import { chinaAIConfig } from "./china-ai.config";
import { globalAIConfig } from "./global-ai.config";

export type RegionType = "china" | "global" | "usa";

/**
 * 根据区域加载 AI 配置
 * @param region - 区域类型（china/global/usa）
 * @returns AI 配置对象
 */
export function loadAIConfig(region: RegionType): AIRegionConfig {
  // 将 'usa' 视为 'global'
  const normalizedRegion = region === "usa" ? "global" : region;

  switch (normalizedRegion) {
    case "china":
      console.log("🇨🇳 加载中国区域 AI 配置");
      return chinaAIConfig;

    case "global":
      console.log("🌍 加载全球区域 AI 配置");
      return globalAIConfig;

    default:
      console.warn(`⚠️ 未知区域: ${region}，使用全球配置`);
      return globalAIConfig;
  }
}

/**
 * 获取已启用的 AI 智能体列表
 * @param region - 区域类型
 * @returns 启用的 AI 智能体数组
 */
export function getEnabledAgents(region: RegionType) {
  const config = loadAIConfig(region);

  // 只返回已启用 Provider 的智能体
  const enabledProviders = new Set(
    config.providers.filter((p) => p.enabled).map((p) => p.provider)
  );

  return config.agents.filter((agent) => enabledProviders.has(agent.provider));
}

/**
 * 获取指定 Provider 的 API 配置
 * @param region - 区域类型
 * @param provider - AI 提供商
 * @returns Provider 配置或 null
 */
export function getProviderConfig(region: RegionType, provider: string) {
  const config = loadAIConfig(region);
  return config.providers.find((p) => p.provider === provider) || null;
}

/**
 * 验证区域是否有可用的 AI
 * @param region - 区域类型
 * @returns 是否有可用的 AI
 */
export function hasEnabledAI(region: RegionType): boolean {
  const config = loadAIConfig(region);
  return config.providers.some((p) => p.enabled);
}
