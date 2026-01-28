/**
 * 模型分类与配额限制工具
 * 用于订阅系统的分级配额策略
 */

import { IS_DOMESTIC_VERSION } from "@/config";

// =============================================================================
// 模型分类定义
// =============================================================================

// 默认通用模型（前端展示为 General Model）：
// - 国内版使用 Qwen-Turbo
// - 国际版使用 Mistral-small-latest
export const GENERAL_MODEL_ID = IS_DOMESTIC_VERSION
  ? "qwen-turbo"
  : "mistral-small-latest";

/**
 * 通用模型列表 (General/Internal Models)
 * 这些模型对 Free 用户无限制使用
 */
export const GENERAL_MODELS = [GENERAL_MODEL_ID];

/**
 * 外部模型列表 (External Models)
 * 这些模型受每日配额限制
 */
export const EXTERNAL_MODELS = [
  // 国内版模型
  "qwen3-max",
  "qwen-plus",
  "qwen-flash",
  "qwen3-coder-plus",
  "qwen3-coder-flash",
  "deepseek-r1",
  "deepseek-v3",
  "deepseek-v3.1",
  "deepseek-v3.2-exp",
  "Moonshot-Kimi-K2-Instruct",
  "glm-4.6",
  // 国际版模型 (Mistral)
  "codestral-latest",
  "codestral-2412",
  "mistral-medium-latest",
];

/**
 * 高级多模态模型列表 (Advanced Multimodal Models)
 * 这些模型受每月媒体配额限制
 */
export const ADVANCED_MULTIMODAL_MODELS = ["qwen3-omni-flash"];

// =============================================================================
// 模型分类判断函数
// =============================================================================

/**
 * 判断是否为通用模型 (无限制)
 */
export function isGeneralModel(modelId: string): boolean {
  return GENERAL_MODELS.some(
    (m) => m.toLowerCase() === modelId.toLowerCase()
  );
}

/**
 * 判断是否为外部模型 (每日配额限制)
 */
export function isExternalModel(modelId: string): boolean {
  return EXTERNAL_MODELS.some(
    (m) => m.toLowerCase() === modelId.toLowerCase()
  );
}

/**
 * 判断是否为高级多模态模型 (每月媒体配额限制)
 */
export function isAdvancedMultimodalModel(modelId: string): boolean {
  return ADVANCED_MULTIMODAL_MODELS.some(
    (m) => m.toLowerCase() === modelId.toLowerCase()
  );
}

/**
 * 获取模型分类类型
 */
export type ModelCategory =
  | "general"
  | "external"
  | "advanced_multimodal"
  | "unknown";

export function getModelCategory(modelId: string): ModelCategory {
  if (isGeneralModel(modelId)) return "general";
  if (isExternalModel(modelId)) return "external";
  if (isAdvancedMultimodalModel(modelId)) return "advanced_multimodal";
  return "unknown";
}

// =============================================================================
// 配额限制常量获取
// =============================================================================

/**
 * 获取外部模型每日限制 (Free)
 */
export function getFreeDailyLimit(): number {
  const raw = process.env.NEXT_PUBLIC_FREE_DAILY_LIMIT || "10";
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.min(1000, n);
}

/**
 * 获取 Basic 订阅每日外部模型限制
 */
export function getBasicDailyLimit(): number {
  const raw = process.env.NEXT_PUBLIC_BASIC_DAILY_LIMIT || "50";
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(10000, n);
}

/**
 * 获取 Pro 订阅每日外部模型限制
 */
export function getProDailyLimit(): number {
  const raw = process.env.NEXT_PUBLIC_PRO_DAILY_LIMIT || "200";
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 200;
  return Math.min(20000, n);
}

/**
 * 获取 Enterprise 订阅每日外部模型限制
 */
export function getEnterpriseDailyLimit(): number {
  const raw = process.env.NEXT_PUBLIC_ENTERPRISE_DAILY_LIMIT || "2000";
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 2000;
  return Math.min(50000, n);
}

/**
 * 获取高级多模态模型每月图片限制 (Free)
 */
export function getFreeMonthlyPhotoLimit(): number {
  const raw = process.env.NEXT_PUBLIC_FREE_MONTHLY_PHOTO_LIMIT || "30";
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(10000, n);
}

/**
 * 获取高级多模态模型每月视频/音频限制 (Free)
 */
export function getFreeMonthlyVideoAudioLimit(): number {
  const raw = process.env.NEXT_PUBLIC_FREE_MONTHLY_VIDEO_AUDIO_LIMIT || "5";
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.min(1000, n);
}

/**
 * 获取 Basic 订阅多模态图片月度限制
 */
export function getBasicMonthlyPhotoLimit(): number {
  const raw = process.env.NEXT_PUBLIC_BASIC_MONTHLY_PHOTO_LIMIT || "100";
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(10000, n);
}

/**
 * 获取 Basic 订阅多模态视频/音频月度限制
 */
export function getBasicMonthlyVideoAudioLimit(): number {
  const raw = process.env.NEXT_PUBLIC_BASIC_MONTHLY_VIDEO_AUDIO_LIMIT || "20";
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(1000, n);
}

/**
 * 获取 Pro 订阅多模态图片月度限制
 */
export function getProMonthlyPhotoLimit(): number {
  const raw = process.env.NEXT_PUBLIC_PRO_MONTHLY_PHOTO_LIMIT || "500";
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 500;
  return Math.min(20000, n);
}

/**
 * 获取 Pro 订阅多模态视频/音频月度限制
 */
export function getProMonthlyVideoAudioLimit(): number {
  const raw = process.env.NEXT_PUBLIC_PRO_MONTHLY_VIDEO_AUDIO_LIMIT || "100";
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(5000, n);
}

/**
 * 获取 Enterprise 订阅多模态图片月度限制
 */
export function getEnterpriseMonthlyPhotoLimit(): number {
  const raw = process.env.NEXT_PUBLIC_ENTERPRISE_MONTHLY_PHOTO_LIMIT || "1500";
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 1500;
  return Math.min(50000, n);
}

/**
 * 获取 Enterprise 订阅多模态视频/音频月度限制
 */
export function getEnterpriseMonthlyVideoAudioLimit(): number {
  const raw =
    process.env.NEXT_PUBLIC_ENTERPRISE_MONTHLY_VIDEO_AUDIO_LIMIT || "200";
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 200;
  return Math.min(20000, n);
}

// =============================================================================
// 日期工具函数
// =============================================================================

/**
 * 获取今天的日期字符串 (YYYY-MM-DD) - 北京时间
 */
export function getTodayString(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const beijing = new Date(utc + 8 * 3600000);
  return beijing.toISOString().split("T")[0];
}

/**
 * 获取当前年月字符串 (YYYY-MM) - 北京时间
 */
export function getCurrentYearMonth(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const beijing = new Date(utc + 8 * 3600000);
  return `${beijing.getFullYear()}-${String(beijing.getMonth() + 1).padStart(2, "0")}`;
}

// =============================================================================
// 配额检查结果类型
// =============================================================================

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  quotaType?: "unlimited" | "daily" | "monthly_photo" | "monthly_video_audio";
  remaining?: number;
  limit?: number;
}

/**
 * 生成配额不足的错误消息
 */
export function getQuotaExceededMessage(
  quotaType: string,
  language: string = "zh"
): string {
  const isZh = language === "zh";

  switch (quotaType) {
    case "daily":
      return isZh
        ? "今日外部模型配额已用完，请升级套餐或明天再试，或切换到通用模型（General Model）继续使用。"
        : "Daily external model quota exceeded. Please upgrade your plan, try again tomorrow, or switch to the General Model.";
    case "monthly_photo":
      return isZh
        ? "本月图片配额已用完，请升级套餐或下月再试。"
        : "Monthly photo quota exceeded. Please upgrade your plan or try again next month.";
    case "monthly_video_audio":
      return isZh
        ? "本月视频/音频配额已用完，请升级套餐或下月再试。"
        : "Monthly video/audio quota exceeded. Please upgrade your plan or try again next month.";
    default:
      return isZh
        ? "配额已用完，请升级套餐继续使用。"
        : "Quota exceeded. Please upgrade your plan to continue.";
  }
}
