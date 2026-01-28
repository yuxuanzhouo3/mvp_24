/**
 * AI Router
 * 管理和路由不同的AI Provider
 */

import { BaseAIProvider } from "./providers/base-provider";
import { DashScopeProvider } from "./providers/dashscope-provider";
import { MistralProvider } from "./providers/mistral-provider";
import { AIProviderError } from "./types";

/**
 * AI路由器类
 * 单例模式，管理所有AI Provider
 */
class AIRouter {
  private static instance: AIRouter;
  private providers: Map<string, BaseAIProvider> = new Map();
  private modelToProvider: Map<string, string> = new Map();

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
      // 注册 DashScope Provider（中国区域，阿里云通义千问）
      if (process.env.DASHSCOPE_API_KEY) {
        const dashscopeProvider = new DashScopeProvider();
        this.registerProvider(dashscopeProvider);
      }

      // 注册国外版提供商
      // Mistral AI
      if (process.env.MISTRAL_API_KEY) {
        try {
          const mistralProvider = new MistralProvider();
          this.registerProvider(mistralProvider);
        } catch (error) {
          console.error("[Mistral] Failed to initialize:", error);
        }
      }

      if (this.providers.size === 0) {
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
  getProviderForModel(model: string): BaseAIProvider {
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
    return this.modelToProvider.has(model);
  }

  /**
   * 获取默认Provider
   */
  getDefaultProvider(): BaseAIProvider {
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
    // 返回第一个可用provider的默认模型
    try {
      const firstProvider = this.providers.values().next()
        .value as BaseAIProvider;
      return firstProvider?.defaultModel || "mistral-large";
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
