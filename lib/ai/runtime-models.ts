import { readFileSync } from "node:fs";
import path from "node:path";
import { listModelCatalogEntries } from "@/lib/billing/catalog";
import { fetchOpenRouterModels } from "@/lib/importers/openrouter";
import { getCachedData, setCachedData } from "@/lib/admin/cache";
import type { BillingRegion, ModelCatalogEntry } from "@/lib/billing/types";
import { isChinaRegion } from "@/lib/config/region";

let openRouterPopularityCache: Map<string, number> | null = null;
const OPENROUTER_POPULARITY_CACHE_KEY = "openrouter:models:most-popular:intl";
const OPENROUTER_POPULARITY_CACHE_TTL_SECONDS = 15 * 24 * 60 * 60;
const DEFAULT_INTL_MODEL_KEY = "x-ai/grok-4.1-fast";

function currentBillingRegion(): BillingRegion {
  return isChinaRegion() ? "CN" : "INTL";
}

function loadOpenRouterPopularitySnapshot(): Map<string, number> {
  const map = new Map<string, number>();
  try {
    const snapshotPath = path.join(process.cwd(), "openrouter-top100-most-popular-2026-03-11.intl-model-import.json");
    const raw = readFileSync(snapshotPath, "utf8");
    const items = JSON.parse(raw);
    if (Array.isArray(items)) {
      items.forEach((item, index) => {
        const modelKey = typeof item?.modelKey === "string" ? item.modelKey : "";
        const metadataRank = Number(item?.metadata?.openrouterRank || 0);
        const rank = Number.isFinite(metadataRank) && metadataRank > 0 ? metadataRank : index + 1;
        if (modelKey) {
          map.set(modelKey, rank);
        }
      });
    }
  } catch {}
  return map;
}

async function getOpenRouterPopularityMap(): Promise<Map<string, number>> {
  if (openRouterPopularityCache) return openRouterPopularityCache;

  const cached = getCachedData<Array<{ modelKey: string; rank: number }>>(OPENROUTER_POPULARITY_CACHE_KEY);
  if (Array.isArray(cached) && cached.length > 0) {
    openRouterPopularityCache = new Map(cached.map((item) => [item.modelKey, item.rank]));
    return openRouterPopularityCache;
  }

  try {
    const result = await fetchOpenRouterModels({ order: "most-popular", limit: 200 });
    const entries = result.models
      .map((item) => ({ modelKey: item.slug, rank: item.rank }))
      .filter((item) => item.modelKey && Number.isFinite(item.rank) && item.rank > 0);
    if (entries.length > 0) {
      setCachedData(OPENROUTER_POPULARITY_CACHE_KEY, entries, OPENROUTER_POPULARITY_CACHE_TTL_SECONDS);
      openRouterPopularityCache = new Map(entries.map((item) => [item.modelKey, item.rank]));
      return openRouterPopularityCache;
    }
  } catch {}

  openRouterPopularityCache = loadOpenRouterPopularitySnapshot();
  return openRouterPopularityCache;
}

async function getOpenRouterPopularityRank(entry: ModelCatalogEntry): Promise<number | undefined> {
  const metadataRank = Number((entry.metadata as any)?.openrouterRank || 0);
  if (Number.isFinite(metadataRank) && metadataRank > 0) return metadataRank;

  const popularityMap = await getOpenRouterPopularityMap();
  return popularityMap.get(entry.modelKey);
}

function inferCapabilities(entry: ModelCatalogEntry): string[] {
  const modality = String(entry.modality || "text").toLowerCase();
  const text = `${entry.modelKey} ${entry.displayName} ${entry.provider} ${entry.modality}`.toLowerCase();
  const metadata = entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {};
  const metadataModalities = new Set<string>();
  const metadataArrays = [
    (metadata as any).inputModalities,
    (metadata as any).outputModalities,
    (metadata as any).capabilities,
  ];
  const capabilities = new Set<string>();

  for (const candidate of metadataArrays) {
    if (!Array.isArray(candidate)) continue;
    for (const item of candidate) {
      if (typeof item !== "string") continue;
      const normalized = item.trim().toLowerCase();
      if (normalized) metadataModalities.add(normalized);
    }
  }

  if (modality.includes("image")) {
    capabilities.add("vision");
    capabilities.add("image_input");
    capabilities.add("multimodal");
  }
  if (modality.includes("audio")) {
    capabilities.add("audio_input");
    capabilities.add("audio_output");
    capabilities.add("multimodal");
  }
  if (modality.includes("video")) {
    capabilities.add("vision");
    capabilities.add("multimodal");
  }
  if (modality.includes("multi") || modality.includes("omni")) {
    capabilities.add("multimodal");
    capabilities.add("vision");
  }
  if ([...metadataModalities].some((item) => /image|vision/.test(item))) {
    capabilities.add("vision");
    capabilities.add("image_input");
    capabilities.add("multimodal");
  }
  if ([...metadataModalities].some((item) => /audio|speech|stt|asr/.test(item))) {
    capabilities.add("audio_input");
    capabilities.add("audio_output");
    capabilities.add("multimodal");
  }
  if ([...metadataModalities].some((item) => /video/.test(item))) {
    capabilities.add("vision");
    capabilities.add("multimodal");
  }

  capabilities.add("conversation");
  capabilities.add("analysis");

  if (/code|coder|codestral|devstral|program|software|开发|代码|编程/.test(text)) {
    capabilities.add("coding");
  }
  if (/creative|writer|writing|copy|story|文案|创作|写作|润色/.test(text)) {
    capabilities.add("creative");
  }
  if (/research|reason|thinking|think|deep research|调研|研究|推理|思考|分析/.test(text)) {
    capabilities.add("research");
  }
  if (/translate|translation|翻译/.test(text)) {
    capabilities.add("translation");
  }

  if (
    /gpt|claude|gemini|opus|sonnet|pro|max|ultra|r1|o1|o3|kimi|qwen|deepseek/.test(text)
  ) {
    capabilities.add("creative");
    capabilities.add("research");
  }

  return Array.from(capabilities);
}

function inferIcon(entry: ModelCatalogEntry): string {
  const provider = String(entry.provider || "").toLowerCase();
  if (provider.includes("anthropic") || provider.includes("claude")) return "🧠";
  if (provider.includes("google") || provider.includes("gemini")) return "✨";
  if (provider.includes("openai") || provider.includes("gpt")) return "🤖";
  if (provider.includes("deepseek")) return "🔷";
  if (provider.includes("mistral") || provider.includes("openrouter")) return "🛣️";
  if (provider.includes("openrouter")) return "🛣️";
  return "🤖";
}

function getUnitPrice(entry: ModelCatalogEntry): number {
  const input = Number(entry.inputPrice || 0);
  const output = Number(entry.outputPrice || 0);
  return input + output;
}

function getPricingLevel(entry: ModelCatalogEntry): "free" | "low" | "medium" | "high" {
  const unitPrice = getUnitPrice(entry);
  if (unitPrice === 0) return "free";
  if (unitPrice <= 0.002) return "low";
  if (unitPrice <= 0.02) return "medium";
  return "high";
}

function isFreeEntry(entry: ModelCatalogEntry): boolean {
  if (getUnitPrice(entry) > 0) return false;
  return !Array.isArray(entry.pricingRules) || entry.pricingRules.every((rule) => Number(rule?.price || 0) === 0);
}

function buildDescription(entry: ModelCatalogEntry): string {
  const provider = entry.provider ? `${entry.provider} · ` : "";
  const modality = entry.modality ? `${entry.modality} model` : "AI model";
  return `${provider}${modality}`;
}

export async function listEnabledRuntimeModels(
  region: BillingRegion = currentBillingRegion()
): Promise<ModelCatalogEntry[]> {
  const items = await listModelCatalogEntries(region);
  const enabled = items.filter((item) => item.enabled !== false);
  const selected = enabled.length > 0 ? enabled : items;
  if (region !== "INTL") return selected;

  const popularityMap = await getOpenRouterPopularityMap();
  return [...selected].sort((a, b) => {
    const rankA = popularityMap.get(a.modelKey) ?? Number.MAX_SAFE_INTEGER;
    const rankB = popularityMap.get(b.modelKey) ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    return String(a.displayName || a.modelKey).localeCompare(String(b.displayName || b.modelKey));
  });
}

export async function listEnabledRuntimeModelKeys(
  region: BillingRegion = currentBillingRegion()
): Promise<string[]> {
  const items = await listEnabledRuntimeModels(region);
  return items.map((item) => item.modelKey).filter(Boolean);
}

export async function getDefaultRuntimeModel(
  region: BillingRegion = currentBillingRegion()
): Promise<string> {
  const items = await listEnabledRuntimeModels(region);
  if (region === "INTL") {
    const preferred = items.find((item) => item.modelKey === DEFAULT_INTL_MODEL_KEY);
    if (preferred) return preferred.modelKey;
  }
  return items[0]?.modelKey || (region === "CN" ? "deepseek-v3.2" : DEFAULT_INTL_MODEL_KEY);
}

export async function buildCatalogAgent(entry: ModelCatalogEntry, index = 0) {
  const openrouterRank = await getOpenRouterPopularityRank(entry);
  return {
    id: entry.modelKey,
    name: entry.displayName || entry.modelKey,
    provider: (entry.provider || "openrouter") as any,
    model: entry.modelKey,
    description: buildDescription(entry),
    capabilities: inferCapabilities(entry) as any,
    maxTokens: 16000,
    temperature: 0.7,
    icon: inferIcon(entry),
    isFree: isFreeEntry(entry),
    pricingLevel: getPricingLevel(entry),
    unitPrice: getUnitPrice(entry),
    openrouterRank,
    openrouterOrder:
      typeof (entry.metadata as any)?.openrouterOrder === "string"
        ? (entry.metadata as any).openrouterOrder
        : openrouterRank
          ? "most-popular"
          : undefined,
    order: index + 1,
  };
}
