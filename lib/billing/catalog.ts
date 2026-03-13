import { getDatabase } from "@/lib/cloudbase-service";
import { isChinaRegion } from "@/lib/config/region";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { MODEL_PRICING } from "@/lib/ai/token-counter";
import type { BillingRegion, BillingRule, ModelCatalogEntry } from "./types";
import { getBillingSettings } from "./settings";
import { getCachedData, setCachedData } from "@/lib/admin/cache";

const COLLECTION = "ai_model_catalog";
const SNAPSHOT_COLLECTION = "ai_model_price_snapshots";
const BAILIAN_CACHE_KEY = "bailian:models:cn";
const BAILIAN_CACHE_TTL = 6 * 60 * 60;

function currentRegion(): BillingRegion {
  return isChinaRegion() ? "CN" : "INTL";
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "string" ? Number(value) : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isTokenMetric(metricKey: string): boolean {
  return /(^|_)(token|tokens)(_|$)/i.test(metricKey);
}

function isCanonicalTextTokenMetric(metricKey: string): boolean {
  return metricKey === "input_tokens" || metricKey === "output_tokens";
}

function normalizeRuleRounding(metricKey: string, rawRounding: unknown): BillingRule["rounding"] {
  if (isTokenMetric(metricKey)) {
    return "none";
  }
  return rawRounding === "none" ? "none" : "ceil";
}

export function normalizePricingRules(raw: unknown): BillingRule[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const metricKey = typeof (item as any).metricKey === "string"
        ? (item as any).metricKey.trim()
        : "";
      const unitSize = Math.max(1, toNumber((item as any).unitSize, 1));
      const price = Math.max(0, toNumber((item as any).price, 0));
      const rounding = normalizeRuleRounding(metricKey, (item as any).rounding);
      const label = typeof (item as any).label === "string" ? (item as any).label : undefined;
      if (!metricKey) return null;
      return { metricKey, unitSize, price, rounding, label } as BillingRule;
    })
    .filter((item): item is BillingRule => item !== null);
}

function synthesizeTokenRules(inputPrice: number, outputPrice: number): BillingRule[] {
  const rules: BillingRule[] = [];
  if (inputPrice > 0) {
    rules.push({ metricKey: "input_tokens", unitSize: 1000, price: inputPrice, rounding: "none" });
  }
  if (outputPrice > 0) {
    rules.push({ metricKey: "output_tokens", unitSize: 1000, price: outputPrice, rounding: "none" });
  }
  return rules;
}

function dedupeRules(rules: BillingRule[]): BillingRule[] {
  const seen = new Set<string>();
  const result: BillingRule[] = [];
  for (const rule of rules) {
    const key = `${rule.metricKey}:${rule.unitSize}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(rule);
  }
  return result;
}

function inferProvider(modelKey: string, region: BillingRegion): string {
  const value = modelKey.toLowerCase();
  if (value.includes("claude")) return "anthropic";
  if (value.includes("google/") || value.includes("gemini")) return region === "CN" ? "dashscope" : "google";
  if (value.includes("openai/") || value.includes("gpt")) return "openai";
  if (value.includes("mistral") || value.includes("codestral") || value.includes("devstral")) {
    return region === "CN" ? "dashscope" : "openrouter";
  }
  if (value.includes("deepseek-chat") || value.includes("deepseek-coder")) return "deepseek";
  if (
    value.includes("qwen") ||
    value.includes("kimi") ||
    value.includes("qwq") ||
    value.includes("deepseek-v3")
  ) {
    return region === "CN" ? "dashscope" : "openrouter";
  }
  return region === "CN" ? "dashscope" : "openrouter";
}

function inferModality(modelKey: string): string {
  const value = modelKey.toLowerCase();
  if (value.includes("omni") || value.includes("vision")) return "multimodal";
  if (value.includes("gpt-5-nano") || value.includes("gemini-2.5-flash-lite")) return "multimodal";
  return "text";
}

function makeBuiltinEntry(modelKey: string, region: BillingRegion): ModelCatalogEntry {
  const pricing =
    MODEL_PRICING[modelKey as keyof typeof MODEL_PRICING] ||
    (modelKey === "qwen3-omni-flash-2025-12-01"
      ? MODEL_PRICING["qwen3-omni-flash"]
      : null) ||
    { prompt: 0, completion: 0 };

  const defaultCurrency = region === "CN" ? "CNY" : "USD";
  const provider = inferProvider(modelKey, region);
  return {
    modelKey,
    provider,
    providerModel: modelKey,
    displayName: modelKey,
    region,
    modality: inferModality(modelKey),
    billingMode: "metered",
    currency: defaultCurrency,
    inputPrice: toNumber(pricing.prompt, 0),
    outputPrice: toNumber(pricing.completion, 0),
    pricingUnit: "per_1k_tokens",
    pricingRules: synthesizeTokenRules(
      toNumber(pricing.prompt, 0),
      toNumber(pricing.completion, 0)
    ),
    enabled: true,
    metadata: {},
  };
}

function getBuiltinModelKeys(region: BillingRegion): string[] {
  const known = Object.keys(MODEL_PRICING);
  const extras = ["qwen3-omni-flash-2025-12-01"];
  const all = Array.from(new Set([...known, ...extras]));
  return all.filter((modelKey) => {
    const provider = inferProvider(modelKey, region);
    if (region === "CN") {
      return provider === "dashscope" || modelKey.includes("qwen") || modelKey.includes("deepseek-v3");
    }
    return provider !== "dashscope";
  });
}

export function buildCatalogEntry(row: any, fallback?: ModelCatalogEntry): ModelCatalogEntry {
  const region = (typeof row?.region === "string" ? row.region : fallback?.region) || currentRegion();
  const inputPrice = Math.max(0, toNumber(row?.input_price ?? row?.inputPrice, fallback?.inputPrice || 0));
  const outputPrice = Math.max(0, toNumber(row?.output_price ?? row?.outputPrice, fallback?.outputPrice || 0));
  const explicitRules = normalizePricingRules(row?.pricing_rules ?? row?.pricingRules);
  const explicitNonCanonicalRules = explicitRules.filter(
    (rule) => !isCanonicalTextTokenMetric(rule.metricKey)
  );
  const pricingRules = dedupeRules([
    ...explicitNonCanonicalRules,
    ...synthesizeTokenRules(inputPrice, outputPrice),
  ]);
  return {
    modelKey:
      typeof (row?.model_key ?? row?.modelKey) === "string"
        ? String(row?.model_key ?? row?.modelKey)
        : fallback?.modelKey || "unknown-model",
    provider:
      typeof (row?.provider) === "string"
        ? row.provider
        : fallback?.provider || inferProvider(fallback?.modelKey || "unknown-model", region),
    providerModel:
      typeof (row?.provider_model ?? row?.providerModel) === "string"
        ? String(row?.provider_model ?? row?.providerModel)
        : fallback?.providerModel || fallback?.modelKey || "unknown-model",
    displayName:
      typeof (row?.display_name ?? row?.displayName) === "string"
        ? String(row?.display_name ?? row?.displayName)
        : fallback?.displayName || String(row?.model_key ?? row?.modelKey ?? "unknown-model"),
    region,
    modality:
      typeof (row?.modality) === "string"
        ? row.modality
        : fallback?.modality || inferModality(String(row?.model_key ?? row?.modelKey ?? "unknown-model")),
    billingMode:
      typeof (row?.billing_mode ?? row?.billingMode) === "string"
        ? String(row?.billing_mode ?? row?.billingMode)
        : fallback?.billingMode || "metered",
    currency:
      typeof (row?.currency) === "string"
        ? row.currency
        : fallback?.currency || (region === "CN" ? "CNY" : "USD"),
    inputPrice,
    outputPrice,
    pricingUnit:
      typeof (row?.pricing_unit ?? row?.pricingUnit) === "string"
        ? String(row?.pricing_unit ?? row?.pricingUnit)
        : fallback?.pricingUnit || "per_1k_tokens",
    pricingRules,
    enabled: row?.enabled === undefined ? fallback?.enabled ?? true : Boolean(row?.enabled),
    metadata:
      row?.metadata && typeof row.metadata === "object"
        ? row.metadata
        : fallback?.metadata || {},
    updatedAt:
      typeof (row?.updated_at ?? row?.updatedAt) === "string"
        ? String(row?.updated_at ?? row?.updatedAt)
        : fallback?.updatedAt ?? null,
  };
}

function missingCloudbaseCollection(error: any) {
  const message = String(error?.message || "");
  const code = String(error?.code || "");
  return (
    message.includes("Db or Table not exist") ||
    message.includes("DATABASE_COLLECTION_NOT_EXIST") ||
    code.includes("DATABASE_COLLECTION_NOT_EXIST")
  );
}

async function ensureCloudbaseCollection(name: string) {
  const db = getDatabase();
  try {
    await db.collection(name).limit(1).get();
  } catch (error: any) {
    if (!missingCloudbaseCollection(error)) throw error;
    await db.createCollection(name);
  }
}

async function seedBuiltinsIfNeeded(region: BillingRegion) {
  const builtins = getBuiltinModelKeys(region).map((modelKey) => makeBuiltinEntry(modelKey, region));
  if (isChinaRegion()) {
    await ensureCloudbaseCollection(COLLECTION);
    await ensureCloudbaseCollection(SNAPSHOT_COLLECTION);
    const db = getDatabase();
    for (const item of builtins) {
      const existing = await db
        .collection(COLLECTION)
        .where({ model_key: item.modelKey, region })
        .limit(1)
        .get();
      if (Array.isArray(existing?.data) && existing.data.length > 0) continue;
      await db.collection(COLLECTION).add({
        model_key: item.modelKey,
        provider: item.provider,
        provider_model: item.providerModel,
        display_name: item.displayName,
        region: item.region,
        modality: item.modality,
        billing_mode: item.billingMode,
        currency: item.currency,
        input_price: item.inputPrice,
        output_price: item.outputPrice,
        pricing_unit: item.pricingUnit,
        pricing_rules: item.pricingRules,
        enabled: item.enabled,
        metadata: item.metadata || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    return;
  }

  const rows = builtins.map((item) => ({
    model_key: item.modelKey,
    provider: item.provider,
    provider_model: item.providerModel,
    display_name: item.displayName,
    region: item.region,
    modality: item.modality,
    billing_mode: item.billingMode,
    currency: item.currency,
    input_price: item.inputPrice,
    output_price: item.outputPrice,
    pricing_unit: item.pricingUnit,
    pricing_rules: item.pricingRules,
    enabled: item.enabled,
    metadata: item.metadata || {},
  }));

  await supabaseAdmin.from("ai_model_catalog").upsert(rows, {
    onConflict: "model_key,region",
    ignoreDuplicates: true,
  });
}

export async function listModelCatalogEntries(
  region: BillingRegion = currentRegion()
): Promise<ModelCatalogEntry[]> {
  if (isChinaRegion()) {
    try {
      const db = getDatabase();
      await ensureCloudbaseCollection(COLLECTION);
      const result = await db.collection(COLLECTION).where({ region }).limit(500).get();
      const rows = Array.isArray(result?.data) ? result.data : [];

      if (rows.length === 0) {
        const cached = getCachedData<ModelCatalogEntry[]>(BAILIAN_CACHE_KEY);
        if (cached) return cached;

        const { fetchBailianBillingImportItems } = await import("@/lib/importers/bailian");
        const bailianData = await fetchBailianBillingImportItems({ limit: 200 });
        const entries = bailianData.items.map((item) => buildCatalogEntry(item, makeBuiltinEntry(item.modelKey, region)));
        setCachedData(BAILIAN_CACHE_KEY, entries, BAILIAN_CACHE_TTL);
        return entries;
      }

      return rows.map((row) => buildCatalogEntry(row, makeBuiltinEntry(String(row?.model_key ?? row?.modelKey ?? ""), region)))
        .sort((a, b) => a.modelKey.localeCompare(b.modelKey));
    } catch (error) {
      console.error("[billing-catalog] CloudBase list failed:", error);
      const cached = getCachedData<ModelCatalogEntry[]>(BAILIAN_CACHE_KEY);
      if (cached) return cached;

      const { fetchBailianBillingImportItems } = await import("@/lib/importers/bailian");
      try {
        const bailianData = await fetchBailianBillingImportItems({ limit: 200 });
        const entries = bailianData.items.map((item) => buildCatalogEntry(item, makeBuiltinEntry(item.modelKey, region)));
        setCachedData(BAILIAN_CACHE_KEY, entries, BAILIAN_CACHE_TTL);
        return entries;
      } catch (bailianError) {
        console.error("[billing-catalog] Bailian fallback failed:", bailianError);
        return [];
      }
    }
  }

  const builtinMap = new Map(
    getBuiltinModelKeys(region).map((modelKey) => [modelKey, makeBuiltinEntry(modelKey, region)])
  );

  try {
    await seedBuiltinsIfNeeded(region);
    const { data, error } = await supabaseAdmin
      .from("ai_model_catalog")
      .select("*")
      .eq("region", region)
      .order("model_key", { ascending: true });
    if (error) {
      console.error("[billing-catalog] Supabase list failed:", error);
      return Array.from(builtinMap.values());
    }
    const merged = new Map<string, ModelCatalogEntry>(builtinMap);
    for (const row of data || []) {
      const key = String((row as any)?.model_key ?? "");
      if (!key) continue;
      merged.set(key, buildCatalogEntry(row, builtinMap.get(key)));
    }
    return Array.from(merged.values()).sort((a, b) => a.modelKey.localeCompare(b.modelKey));
  } catch (error) {
    console.error("[billing-catalog] Supabase list exception:", error);
    return Array.from(builtinMap.values());
  }
}

export async function getModelCatalogEntry(
  modelKey: string,
  options?: { region?: BillingRegion }
): Promise<ModelCatalogEntry> {
  const region = options?.region || currentRegion();
  const list = await listModelCatalogEntries(region);
  const found = list.find((item) => item.modelKey === modelKey);
  return found || makeBuiltinEntry(modelKey, region);
}

async function createSnapshot(entry: ModelCatalogEntry) {
  const snapshot = {
    model_key: entry.modelKey,
    region: entry.region,
    currency: entry.currency,
    input_price: entry.inputPrice,
    output_price: entry.outputPrice,
    pricing_rules: entry.pricingRules,
    source: "admin",
    snapshot_hash: JSON.stringify({
      modelKey: entry.modelKey,
      region: entry.region,
      inputPrice: entry.inputPrice,
      outputPrice: entry.outputPrice,
      pricingRules: entry.pricingRules,
    }),
  };

  if (isChinaRegion()) {
    await ensureCloudbaseCollection(SNAPSHOT_COLLECTION);
    await getDatabase().collection(SNAPSHOT_COLLECTION).add({
      ...snapshot,
      created_at: new Date().toISOString(),
    });
    return;
  }

  await supabaseAdmin.from("ai_model_price_snapshots").insert(snapshot);
}

export async function upsertModelCatalogEntries(
  input: Array<Partial<ModelCatalogEntry>>,
  region: BillingRegion = currentRegion()
): Promise<{ success: boolean; error?: string }> {
  const settings = await getBillingSettings(region);
  const deduped = new Map<string, ModelCatalogEntry>();
  for (const item of input || []) {
    const modelKey = String(item.modelKey || "").trim();
    if (!modelKey) continue;
    const fallback = makeBuiltinEntry(modelKey, region);
    const entry = buildCatalogEntry(
      {
        ...item,
        region,
        currency: item.currency || settings.defaultCurrency,
      },
      fallback
    );
    deduped.set(`${region}:${entry.modelKey}`, entry);
  }
  const payload = Array.from(deduped.values());

  try {
    if (isChinaRegion()) {
      await ensureCloudbaseCollection(COLLECTION);
      for (const item of payload) {
        const db = getDatabase();
        const existing = await db
          .collection(COLLECTION)
          .where({ model_key: item.modelKey, region })
          .limit(1)
          .get();
        const base = {
          model_key: item.modelKey,
          provider: item.provider,
          provider_model: item.providerModel,
          display_name: item.displayName,
          region: item.region,
          modality: item.modality,
          billing_mode: item.billingMode,
          currency: item.currency,
          input_price: item.inputPrice,
          output_price: item.outputPrice,
          pricing_unit: item.pricingUnit,
          pricing_rules: item.pricingRules,
          enabled: item.enabled,
          metadata: item.metadata || {},
          updated_at: new Date().toISOString(),
        };
        if (Array.isArray(existing?.data) && existing.data.length > 0) {
          await db.collection(COLLECTION).doc(existing.data[0]._id).update(base);
        } else {
          await db.collection(COLLECTION).add({
            ...base,
            created_at: new Date().toISOString(),
          });
        }
        await createSnapshot(item);
      }
      return { success: true };
    }

    const { error } = await supabaseAdmin.from("ai_model_catalog").upsert(
      payload.map((item) => ({
        model_key: item.modelKey,
        provider: item.provider,
        provider_model: item.providerModel,
        display_name: item.displayName,
        region: item.region,
        modality: item.modality,
        billing_mode: item.billingMode,
        currency: item.currency,
        input_price: item.inputPrice,
        output_price: item.outputPrice,
        pricing_unit: item.pricingUnit,
        pricing_rules: item.pricingRules,
        enabled: item.enabled,
        metadata: item.metadata || {},
      })),
      { onConflict: "model_key,region" }
    );
    if (error) return { success: false, error: error.message };
    await Promise.all(payload.map((item) => createSnapshot(item)));
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save model catalog",
    };
  }
}
