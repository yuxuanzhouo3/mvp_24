// Configuration based on environment variables

// Normalize and clamp default language to 'zh' or 'en'
const envDefaultLang = (
  process.env.NEXT_PUBLIC_DEFAULT_LANGUAGE || "zh"
).toLowerCase();
export const DEFAULT_LANGUAGE: string = envDefaultLang === "en" ? "en" : "zh";

// Deployment edition is decided by env, not by user toggle
export const IS_DOMESTIC_VERSION = DEFAULT_LANGUAGE === "zh";

// Model configurations for different versions
export const MODEL_CONFIG = {
  // Domestic version models (Chinese)
  domestic: {
    defaultModel: "qwen3-omni-flash", // 优先多模态，保证图片/视频可用
    availableModels: [
      "qwen3-omni-flash",
      "qwen3-max",
      "qwen-plus",
      "qwen-turbo",
      "qwen-flash",
      "qwen3-coder-plus",
      "qwen3-coder-flash",
      "deepseek-r1",
      "deepseek-v3",
      "deepseek-v3.1",
      "deepseek-v3.2-exp",
      "Moonshot-Kimi-K2-Instruct",
      "glm-4.6",
    ],
    apiBaseUrl: process.env.DOMESTIC_API_BASE_URL || "/api/domestic",
  },
  // International version models (English)
  international: {
    defaultModel: "codestral-latest",
    availableModels: [
      "codestral-latest",
      "codestral-2412",
      "mistral-medium-latest",
    ],
    apiBaseUrl: process.env.INTERNATIONAL_API_BASE_URL || "/api/international",
  },
};

// Get current model configuration based on version
export const getCurrentModelConfig = () => {
  return IS_DOMESTIC_VERSION ? MODEL_CONFIG.domestic : MODEL_CONFIG.international;
};
