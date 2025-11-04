/**
 * AI Router
 * 管理和路由不同的AI Provider
 */

import { BaseAIProvider } from "./providers/base-provider";
import { AIGatewayProvider } from "./providers/ai-gateway-provider";
import { DeepSeekProvider } from "./providers/deepseek-provider";
import { AIProviderError } from "./types";

/**
 * AI路由器类
 * 单例模式，管理所有AI Provider
 */
class AIRouter {
  private static instance: AIRouter;
  private providers: Map<string, BaseAIProvider> = new Map();
  private modelToProvider: Map<string, string> = new Map();
  private aiGatewayProvider: AIGatewayProvider | null = null;

  private constructor() {
    this.initialize();
  }

  /**
   * 获取AI路由器单例
   */
  static getInstance(): AIRouter {
    if (!AIRouter.instance) {
      AIRouter.instance = new AIRouter();
    }
    return AIRouter.instance;
  }

  /**
   * 初始化Provider
   */
  private initialize(): void {
    try {
      // 注册 DeepSeek Provider（中国区域，直连）
      if (process.env.DEEPSEEK_API_KEY) {
        const deepseekProvider = new DeepSeekProvider();
        this.registerProvider(deepseekProvider);
      }

      // 注册 Vercel AI Gateway Provider（全球区域，统一端点）
      if (process.env.AI_GATEWAY_API_KEY) {
        this.aiGatewayProvider = new AIGatewayProvider();

        // AI Gateway 支持的模型列表（通过 provider/model 格式）
        const gatewayModels = [
          // Anthropic (5 models)
          "anthropic/claude-haiku-4.5",
          "anthropic/claude-sonnet-4.5",
          "anthropic/claude-sonnet-4",
          "anthropic/claude-3-haiku",
          "anthropic/claude-3.7-sonnet",

          // OpenAI (9 models)
          "openai/gpt-4.1-mini",
          "openai/gpt-5-nano",
          "openai/gpt-5",
          "openai/gpt-5-mini",
          "openai/gpt-5-codex",
          "openai/gpt-4o-mini",
          "openai/gpt-4o",
          "openai/text-embedding-3-small",
          "openai/gpt-oss-120b",

          // Google (5 models)
          "google/gemini-2.5-flash",
          "google/gemini-2.5-pro",
          "google/gemini-2.0-flash-lite",
          "google/gemini-2.0-flash",
          "google/gemini-2.5-flash-lite",

          // DeepSeek (1 model)
          "deepseek/deepseek-v3.2-exp",
        ];

        // 为 AI Gateway 支持的所有模型注册映射
        for (const model of gatewayModels) {
          this.modelToProvider.set(model, "ai-gateway");
        }

        console.log(
          `[AIRouter] Registered AI Gateway provider with ${gatewayModels.length} models`
        );
      }

      if (this.providers.size === 0 && !this.aiGatewayProvider) {
        console.warn("No AI providers registered. Please configure API keys.");
      }
    } catch (error) {
      console.error("Failed to initialize AI providers:", error);
    }
  }

  /**
   * 注册Provider
   */
  registerProvider(provider: BaseAIProvider): void {
    this.providers.set(provider.name, provider);

    // 建立模型到Provider的映射
    for (const model of provider.models) {
      this.modelToProvider.set(model, provider.name);
    }

    console.log(
      `[AIRouter] Registered provider: ${provider.name} with ${provider.models.length} models`
    );
  }

  /**
   * 根据名称获取Provider
   */
  getProvider(name: string): BaseAIProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new AIProviderError(
        `AI Provider "${name}" not found. Available providers: ${Array.from(
          this.providers.keys()
        ).join(", ")}`,
        "provider_not_found",
        404
      );
    }
    return provider;
  }

  /**
   * 根据模型名称获取Provider
   */
  getProviderForModel(model: string): BaseAIProvider | AIGatewayProvider {
    // 检查是否是 AI Gateway 模型
    if (model.includes("/")) {
      // 格式: provider/model (如 openai/gpt-4o, anthropic/claude-sonnet-4)
      if (this.aiGatewayProvider) {
        return this.aiGatewayProvider;
      }
      throw new AIProviderError(
        `AI Gateway not configured. Please set AI_GATEWAY_API_KEY in environment.`,
        "gateway_not_configured",
        500
      );
    }

    // 传统模型名称，使用原有的 Provider 路由
    const providerName = this.modelToProvider.get(model);
    if (!providerName) {
      throw new AIProviderError(
        `No provider found for model "${model}". Available models: ${Array.from(
          this.modelToProvider.keys()
        ).join(", ")}`,
        "model_not_found",
        404
      );
    }
    return this.getProvider(providerName);
  }

  /**
   * 获取所有可用的Provider
   */
  getAllProviders(): BaseAIProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * 获取所有可用的模型
   */
  getAllModels(): string[] {
    return Array.from(this.modelToProvider.keys());
  }

  /**
   * 获取模型信息（按Provider分组）
   */
  getModelsGroupedByProvider(): Record<
    string,
    { name: string; models: string[] }
  > {
    const grouped: Record<string, { name: string; models: string[] }> = {};

    for (const provider of this.providers.values()) {
      grouped[provider.name] = {
        name: provider.name,
        models: provider.models,
      };
    }

    return grouped;
  }

  /**
   * 检查Provider是否可用
   */
  isProviderAvailable(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * 检查模型是否可用
   */
  isModelAvailable(model: string): boolean {
    if (model.includes("/") && this.aiGatewayProvider) {
      return true; // AI Gateway 模型
    }
    return this.modelToProvider.has(model);
  }

  /**
   * 获取默认Provider
   */
  getDefaultProvider(): BaseAIProvider | AIGatewayProvider {
    // 优先返回 AI Gateway（如果配置了）
    if (this.aiGatewayProvider) {
      return this.aiGatewayProvider;
    }

    // 返回第一个可用的Provider
    const first = this.providers.values().next().value;
    if (!first) {
      throw new AIProviderError(
        "No AI providers available. Please configure API keys.",
        "no_providers",
        500
      );
    }

    return first;
  }

  /**
   * 获取默认模型
   */
  getDefaultModel(): string {
    // 如果有 AI Gateway，使用 GPT-4o Mini
    if (this.aiGatewayProvider) {
      return "openai/gpt-4o-mini";
    }

    // 否则返回第一个可用provider的默认模型
    try {
      const firstProvider = this.providers.values().next()
        .value as BaseAIProvider;
      return firstProvider?.defaultModel || "deepseek-chat";
    } catch {
      throw new AIProviderError(
        "No default model available",
        "no_default_model",
        500
      );
    }
  }

  /**
   * 验证所有Provider的API密钥
   */
  async validateAllProviders(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [name, provider] of this.providers) {
      try {
        results[name] = await provider.validateApiKey();
      } catch {
        results[name] = false;
      }
    }

    return results;
  }
}

/**
 * 导出单例实例
 */
export const aiRouter = AIRouter.getInstance();

/**
 * 导出类型
 */
export type { AIRouter };
