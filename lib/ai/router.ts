/**
 * AI Router
 * 管理和路由不同的 AI Provider
 */

import { isChinaRegion } from "@/lib/config/region";
import { BaseAIProvider } from "./providers/base-provider";
import { OpenRouterProvider } from "./providers/openrouter-provider";
import { DashScopeProvider } from "./providers/dashscope-provider";
import { VolcengineProvider } from "./providers/volcengine-provider";
import { AIProviderError } from "./types";

class AIRouter {
  private static instance: AIRouter;
  private providers: Map<string, BaseAIProvider> = new Map();
  private modelToProvider: Map<string, string> = new Map();

  private constructor() {
    this.initialize();
  }

  static getInstance(): AIRouter {
    if (!AIRouter.instance) {
      AIRouter.instance = new AIRouter();
    }
    return AIRouter.instance;
  }

  private initialize(): void {
    try {
      if (isChinaRegion()) {
        if (process.env.DASHSCOPE_API_KEY) {
          this.registerProvider(new DashScopeProvider());
        }
        if (process.env.VOLCENGINE_API_KEY) {
          this.registerProvider(new VolcengineProvider());
        }
      } else if (process.env.OPENROUTER_API) {
        try {
          this.registerProvider(new OpenRouterProvider());
        } catch (error) {
          console.error("[OpenRouter] Failed to initialize:", error);
        }
      }

      if (this.providers.size === 0) {
        console.warn("No AI providers registered. Please configure API keys.");
      }
    } catch (error) {
      console.error("Failed to initialize AI providers:", error);
    }
  }

  registerProvider(provider: BaseAIProvider): void {
    this.providers.set(provider.name, provider);
    for (const model of provider.models) {
      this.modelToProvider.set(model, provider.name);
    }
  }

  getProvider(name: string): BaseAIProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new AIProviderError(
        `AI Provider "${name}" not found. Available providers: ${Array.from(this.providers.keys()).join(", ")}`,
        "provider_not_found",
        404
      );
    }
    return provider;
  }

  async getProviderForModel(model: string): Promise<BaseAIProvider> {
    const providerName = this.modelToProvider.get(model);
    if (providerName) return this.getProvider(providerName);

    const { getModelCatalogEntry } = await import("@/lib/billing/catalog");
    try {
      const entry = await getModelCatalogEntry(model);
      if (entry.provider && this.providers.has(entry.provider)) {
        return this.getProvider(entry.provider);
      }
    } catch {}

    if (!isChinaRegion()) {
      const openrouter = this.providers.get("openrouter");
      if (openrouter) return openrouter;
    }

    throw new AIProviderError(
      `No provider found for model "${model}". Available models: ${Array.from(this.modelToProvider.keys()).join(", ")}`,
      "model_not_found",
      404
    );
  }

  getAllProviders(): BaseAIProvider[] {
    return Array.from(this.providers.values());
  }

  getAllModels(): string[] {
    return Array.from(this.modelToProvider.keys());
  }

  getModelsGroupedByProvider(): Record<string, { name: string; models: string[] }> {
    const grouped: Record<string, { name: string; models: string[] }> = {};
    for (const provider of this.providers.values()) {
      grouped[provider.name] = { name: provider.name, models: provider.models };
    }
    return grouped;
  }

  isProviderAvailable(name: string): boolean {
    return this.providers.has(name);
  }

  isModelAvailable(model: string): boolean {
    return this.modelToProvider.has(model) || (!isChinaRegion() && this.providers.has("openrouter"));
  }

  getDefaultProvider(): BaseAIProvider {
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

  getDefaultModel(): string {
    const firstProvider = this.providers.values().next().value as BaseAIProvider | undefined;
    return firstProvider?.defaultModel || (isChinaRegion() ? "deepseek-v3.2" : "openai/gpt-4o-mini");
  }

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

export const aiRouter = AIRouter.getInstance();
