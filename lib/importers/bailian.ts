import type { BillingRule } from "@/lib/billing/types";

const BAILIAN_CONSOLE_PAGE_URL = "https://bailian.console.aliyun.com/cn-beijing/?tab=model#/model-market/all";
const BAILIAN_CONSOLE_ORIGIN = "https://bailian.console.aliyun.com";
const BAILIAN_GATEWAY_BASE_URL = "https://bailian-cs.console.aliyun.com/data/api.json";
const BAILIAN_GATEWAY_ACTION = "BroadScopeAspnGateway";
const BAILIAN_GATEWAY_PRODUCT = "sfm_bailian";
const BAILIAN_GATEWAY_REGION = "cn-beijing";
const BAILIAN_GATEWAY_PAYLOAD_VERSION = "1.0";
const DEFAULT_FRONTEND_VERSION = "3.5.191";
const FOUNDATION_MODELS_PAGE_SIZE = 50;
const PRICE_ROWS_PAGE_SIZE = 100;

const FOUNDATION_MODELS_API = "zeldaHttp.dashscopeModel./zelda/api/v1/modelCenter/listFoundationModels";
const PRICE_CATEGORIES_API = "zeldaHttp.dashscopeModel./zelda/api/v1/modelCenter/listModelPriceCategories";
const MODEL_PRICES_API = "zeldaHttp.dashscopeModel./zelda/api/v1/modelCenter/listModelPrices";

export interface BailianBillingImportItem {
  modelKey: string;
  provider: "dashscope";
  providerModel: string;
  displayName: string;
  modality: string;
  currency: "CNY";
  billingMode: "metered";
  pricingUnit: string;
  inputPrice: number;
  outputPrice: number;
  enabled: boolean;
  pricingRules: BillingRule[];
  metadata?: Record<string, unknown>;
}

export interface FetchBailianBillingImportItemsOptions {
  limit?: number;
  signal?: AbortSignal;
}

export interface FetchBailianBillingImportItemsResult {
  fetchedAt: string;
  totalAvailable: number;
  returned: number;
  sourcePageUrl: string;
  items: BailianBillingImportItem[];
}

interface ConsoleSession {
  frontendVersion: string;
  signal?: AbortSignal;
}

interface GatewayEnvelope<T> {
  successResponse?: boolean;
  requestId?: string;
  message?: string;
  data?: {
    success?: boolean;
    errorCode?: string;
    errorMsg?: string;
    api?: string;
    DataV2?: {
      ret?: string[];
      data?: {
        code?: string;
        success?: boolean;
        message?: string;
        data?: T;
      };
    };
  };
}

interface FoundationModelItem {
  model: string;
  name?: string;
  provider?: string;
  inferenceProvider?: string;
  docUrl?: string;
  description?: string;
  shortDescription?: string;
  scope?: string;
  needApply?: boolean;
  openSource?: boolean;
  modelAlias?: string;
  versionTag?: string;
  collectionTag?: string;
  capabilities?: string[];
  categories?: string[];
  features?: string[];
  permissions?: {
    inference?: boolean;
  };
  supports?: Record<string, boolean>;
  quota?: Record<string, unknown>;
  inferenceMetadata?: {
    request_modality?: string[];
    response_modality?: string[];
  };
}

interface FoundationModelsPage {
  total: number;
  pageNo: number;
  pageSize: number;
  list: FoundationModelItem[];
}

interface PriceCategoryItem {
  categoryLevel2: string;
  name: string;
  count: number;
}

interface PriceCategory {
  categoryLevel1: string;
  name: string;
  count: number;
  items?: PriceCategoryItem[];
}

interface ModelPriceValue {
  type: string;
  price: string;
  priceUnit: string;
  priceName?: string;
}

interface ModelPriceRow {
  itemCode: string;
  rangeName: string;
  priceUnit: string;
  prices: ModelPriceValue[];
}

interface ModelPricePage {
  total: number;
  pageNo: number;
  pageSize: number;
  list: ModelPriceRow[];
}

interface AggregatedPriceRows {
  categoryLevel1: string;
  categoryLevel2: string;
  rows: Array<ModelPriceRow & { batch: boolean }>;
}

function toNumber(value: unknown, fallback = 0) {
  const n = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toFixedNumber(value: number) {
  return Number(value.toFixed(8));
}

function extractFrontendVersion(html: string) {
  const versionMatch =
    html.match(/\/isipfe\/efm-fe\/(\d+\.\d+\.\d+)\/i18n-load-script\.js/i) ||
    html.match(/return\s+"(\d+\.\d+\.\d+)"\s*}/i);
  return versionMatch?.[1] || DEFAULT_FRONTEND_VERSION;
}

function normalizeCategoryLevel2(value: string) {
  return String(value || "").trim();
}

function makeLabel(priceName: string | undefined, rangeName: string, batch: boolean) {
  const parts = [priceName || "价格"];
  if (rangeName) parts.push(rangeName);
  if (batch) parts.push("批处理");
  return parts.join(" · ");
}

function mergeRules(existing: BillingRule[], incoming: BillingRule[]) {
  const seen = new Set(existing.map((item) => `${item.metricKey}:${item.unitSize}:${item.label || ""}:${item.price}`));
  for (const rule of incoming) {
    const key = `${rule.metricKey}:${rule.unitSize}:${rule.label || ""}:${rule.price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    existing.push(rule);
  }
}

function inferModalityFromCategory(categoryLevel1: string) {
  switch (categoryLevel1) {
    case "Image-Generation":
      return "image";
    case "Video-Generation":
      return "video";
    case "Audio-Generation":
      return "audio";
    case "Speech-Recognition":
      return "audio";
    case "Embeddings":
      return "embedding";
    case "Multimodal-Token":
      return "multimodal";
    case "Text-Generation":
    default:
      return "text";
  }
}

function inferModalityFromModel(model: FoundationModelItem | undefined, fallback: string) {
  if (fallback !== "text" && fallback !== "embedding") return fallback;

  const request = model?.inferenceMetadata?.request_modality ?? [];
  const response = model?.inferenceMetadata?.response_modality ?? [];
  const tokens = new Set([...request, ...response].map((item) => item.toLowerCase()));

  const hasImage = tokens.has("image");
  const hasAudio = tokens.has("audio");
  const hasVideo = tokens.has("video");
  const hasText = tokens.has("text");

  if ((hasImage || hasAudio || hasVideo) && (hasText || [hasImage, hasAudio, hasVideo].filter(Boolean).length > 1)) {
    return "multimodal";
  }
  if (hasVideo) return "video";
  if (hasAudio) return "audio";
  if (hasImage) return "image";
  if (tokens.has("text")) return fallback;
  return fallback;
}

function inferMetricKey(type: string) {
  const normalized = String(type || "").trim().toLowerCase();
  const predefined: Record<string, string> = {
    input_token: "input_tokens",
    output_token: "output_tokens",
    input_token_batch: "input_tokens",
    output_token_batch: "output_tokens",
    text_input_token: "input_tokens",
    purein_text_output_token: "output_tokens",
    multi_translate_text_output_token: "output_tokens",
    embedding_token: "input_tokens",
    image_number: "image_count",
    video_ratio: "video_output_seconds",
    content_duration: "audio_input_seconds",
    cosy_tts_number: "tts_characters",
    vision_input_token: "vision_input_tokens",
    audio_input_token: "audio_input_tokens",
    multi_output_token: "multi_output_tokens",
    input_token_cache: "input_tokens_cache",
    input_token_cache_creation_5m: "input_tokens_cache_creation_5m",
    input_token_cache_read: "input_tokens_cache_read",
    thinking_input_token: "thinking_input_tokens",
    thinking_output_token: "thinking_output_tokens",
    thinking_input_token_batch: "thinking_input_tokens_batch",
    thinking_output_token_batch: "thinking_output_tokens_batch",
    thinking_text_input_token: "thinking_text_input_tokens",
    thinking_audio_input_token: "thinking_audio_input_tokens",
    thinking_input_token_cache: "thinking_input_tokens_cache",
    thinking_input_token_cache_creation_5m: "thinking_input_tokens_cache_creation_5m",
    thinking_input_token_cache_read: "thinking_input_tokens_cache_read",
  };
  return predefined[normalized] || normalized;
}

function inferUnitSize(priceUnit: string) {
  const normalized = String(priceUnit || "").toLowerCase();
  if (normalized.includes("每百万token") || normalized.includes("per 1m token")) return 1_000_000;
  if (normalized.includes("每千token") || normalized.includes("per 1k token")) return 1_000;
  if (normalized.includes("每万字符")) return 10_000;
  if (normalized.includes("千次调用")) return 1_000;
  return 1;
}

function buildRulesFromRows(
  categoryLevel1: string,
  rows: Array<ModelPriceRow & { batch: boolean }>
) {
  const rules: BillingRule[] = [];
  for (const row of rows) {
    for (const price of row.prices || []) {
      const numericPrice = toNumber(price.price, -1);
      if (numericPrice < 0) continue;
      rules.push({
        metricKey: inferMetricKey(price.type),
        unitSize: inferUnitSize(price.priceUnit || row.priceUnit),
        price: toFixedNumber(numericPrice),
        rounding: "none",
        label: makeLabel(price.priceName, row.rangeName, row.batch),
      });
    }
  }

  if (categoryLevel1 === "Text-Generation") {
    rules.sort((a, b) => {
      const batchA = String(a.label || "").includes("批处理") ? 1 : 0;
      const batchB = String(b.label || "").includes("批处理") ? 1 : 0;
      if (batchA !== batchB) return batchA - batchB;
      return a.price - b.price;
    });
  }

  const deduped: BillingRule[] = [];
  mergeRules(deduped, rules);
  return deduped;
}

function isRepresentativeLabel(label: string | undefined) {
  const normalized = String(label || "");
  return !normalized.includes("批处理") && !normalized.includes("缓存") && !normalized.includes("推理");
}

function selectRepresentativePrice(
  rules: BillingRule[],
  preferredMetrics: string[],
  fallbackMatcher: (metricKey: string) => boolean
) {
  const preferred = rules
    .filter((rule) => preferredMetrics.includes(rule.metricKey) && isRepresentativeLabel(rule.label))
    .sort((a, b) => a.price - b.price)[0];
  if (preferred) return preferred;

  return rules
    .filter((rule) => fallbackMatcher(rule.metricKey) && isRepresentativeLabel(rule.label))
    .sort((a, b) => a.price - b.price)[0] || null;
}

function inferPricingUnit(modality: string, inputRule: BillingRule | null, outputRule: BillingRule | null) {
  const primary = inputRule || outputRule;
  if (!primary) return "per_unit";
  if ((primary.metricKey === "input_tokens" || primary.metricKey === "output_tokens") && primary.unitSize === 1000) {
    return "per_1k_tokens";
  }
  if (primary.metricKey === "image_count") return "per_image";
  if (primary.metricKey === "audio_input_seconds" || primary.metricKey === "video_output_seconds") {
    return "per_second";
  }
  if (primary.metricKey === "tts_characters" && primary.unitSize === 10000) return "per_10k_characters";
  if (modality === "embedding" && primary.unitSize === 1000) return "per_1k_tokens";
  return "per_unit";
}

async function createConsoleSession(options: FetchBailianBillingImportItemsOptions) {
  const response = await fetch(BAILIAN_CONSOLE_PAGE_URL, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "bailian-import-script/2.0",
    },
    cache: "no-store",
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`阿里百炼控制台页请求失败：${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  return {
    frontendVersion: extractFrontendVersion(html),
    signal: options.signal,
  } satisfies ConsoleSession;
}

function buildGatewayPayload(api: string, input: Record<string, unknown>) {
  return JSON.stringify({
    Api: api,
    V: BAILIAN_GATEWAY_PAYLOAD_VERSION,
    Data: {
      input,
      cornerstoneParam: {
        protocol: "V2",
        console: "ONE_CONSOLE",
        productCode: BAILIAN_GATEWAY_PRODUCT,
        switchUserType: 3,
        domain: "bailian.console.aliyun.com",
      },
    },
  });
}

function unwrapGatewayData<T>(payload: GatewayEnvelope<T>, api: string) {
  const data = payload?.data?.DataV2?.data;
  const success = payload?.successResponse && data?.success;
  if (success) return data?.data as T;

  const errorCode = payload?.data?.errorCode || data?.code || "UNKNOWN";
  const errorMsg =
    payload?.data?.errorMsg ||
    data?.message ||
    payload?.message ||
    payload?.data?.DataV2?.ret?.join("; ") ||
    "未知错误";

  throw new Error(`阿里百炼接口调用失败：${api} [${errorCode}] ${errorMsg}`);
}

async function gatewayRequest<T>(
  session: ConsoleSession,
  api: string,
  input: Record<string, unknown>
) {
  const url = new URL(BAILIAN_GATEWAY_BASE_URL);
  url.searchParams.set("action", BAILIAN_GATEWAY_ACTION);
  url.searchParams.set("product", BAILIAN_GATEWAY_PRODUCT);
  url.searchParams.set("api", api);
  url.searchParams.set("_v", session.frontendVersion);

  const body = new URLSearchParams({
    region: BAILIAN_GATEWAY_REGION,
    params: buildGatewayPayload(api, input),
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      origin: BAILIAN_CONSOLE_ORIGIN,
      referer: BAILIAN_CONSOLE_PAGE_URL,
      "user-agent": "bailian-import-script/2.0",
    },
    body,
    cache: "no-store",
    signal: session.signal,
  });

  if (!response.ok) {
    throw new Error(`阿里百炼网关请求失败：${response.status} ${response.statusText} (${api})`);
  }

  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`阿里百炼网关返回空响应：${api}`);
  }

  let payload: GatewayEnvelope<T>;
  try {
    payload = JSON.parse(text) as GatewayEnvelope<T>;
  } catch (error) {
    throw new Error(`阿里百炼网关返回了非 JSON 响应：${api}，${error instanceof Error ? error.message : "解析失败"}`);
  }

  return unwrapGatewayData(payload, api);
}

async function fetchFoundationModels(session: ConsoleSession) {
  const models = new Map<string, FoundationModelItem & { sourceOrder: number }>();
  let pageNo = 1;
  let sourceOrder = 0;

  while (true) {
    const page = await gatewayRequest<FoundationModelsPage>(session, FOUNDATION_MODELS_API, {
      pageNo,
      pageSize: FOUNDATION_MODELS_PAGE_SIZE,
      name: "",
      providers: [],
      inferenceProviders: [],
      features: [],
      group: false,
      capabilities: [],
      contextWindows: [],
      queryPermissions: true,
      queryApplyStatus: true,
      queryActivationStatus: true,
      queryPrice: true,
      supports: { inference: true },
    });

    for (const item of page.list || []) {
      const modelKey = String(item.model || "").trim();
      if (!modelKey || models.has(modelKey)) continue;
      sourceOrder += 1;
      models.set(modelKey, { ...item, sourceOrder });
    }

    if (!page.list?.length || page.pageNo * page.pageSize >= page.total) break;
    pageNo += 1;
  }

  return models;
}

async function fetchPriceCategories(session: ConsoleSession) {
  const categories = await gatewayRequest<PriceCategory[]>(session, PRICE_CATEGORIES_API, {
    region: BAILIAN_GATEWAY_REGION,
    itemCode: "",
  });

  return (categories || [])
    .filter((category) => toNumber(category.count, 0) > 0)
    .map((category) => ({
      ...category,
      items: (category.items || []).filter((item) => toNumber(item.count, 0) > 0),
    }));
}

async function fetchPriceRowsForCategory(
  session: ConsoleSession,
  categoryLevel1: string,
  categoryLevel2: string,
  batch: boolean
) {
  const rows: Array<ModelPriceRow & { batch: boolean }> = [];
  let pageNo = 1;

  while (true) {
    const page = await gatewayRequest<ModelPricePage>(session, MODEL_PRICES_API, {
      region: BAILIAN_GATEWAY_REGION,
      categoryLevel1,
      categoryLevel2,
      itemCode: "",
      batch,
      pageNo,
      pageSize: PRICE_ROWS_PAGE_SIZE,
    });

    for (const row of page.list || []) {
      rows.push({ ...row, batch });
    }

    if (!page.list?.length || page.pageNo * page.pageSize >= page.total) break;
    pageNo += 1;
  }

  return rows;
}

async function fetchAllPriceRows(session: ConsoleSession) {
  const categories = await fetchPriceCategories(session);
  const rowsByModel = new Map<string, AggregatedPriceRows>();

  for (const category of categories) {
    const subCategories = category.items?.length
      ? category.items.map((item) => normalizeCategoryLevel2(item.categoryLevel2))
      : [""];
    const batchModes = category.categoryLevel1 === "Text-Generation" ? [false, true] : [false];

    for (const categoryLevel2 of subCategories) {
      for (const batch of batchModes) {
        const rows = await fetchPriceRowsForCategory(session, category.categoryLevel1, categoryLevel2, batch);
        for (const row of rows) {
          const modelKey = String(row.itemCode || "").trim();
          if (!modelKey) continue;

          const existing = rowsByModel.get(modelKey);
          if (!existing) {
            rowsByModel.set(modelKey, {
              categoryLevel1: category.categoryLevel1,
              categoryLevel2,
              rows: [row],
            });
            continue;
          }

          existing.rows.push(row);
          if (!existing.categoryLevel2 && categoryLevel2) existing.categoryLevel2 = categoryLevel2;
        }
      }
    }
  }

  return rowsByModel;
}

function sortItems(items: BailianBillingImportItem[], foundationModels: Map<string, FoundationModelItem & { sourceOrder: number }>) {
  return [...items].sort((a, b) => {
    const orderA = foundationModels.get(a.modelKey)?.sourceOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = foundationModels.get(b.modelKey)?.sourceOrder ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.modelKey.localeCompare(b.modelKey);
  });
}

export async function fetchBailianBillingImportItems(
  options: FetchBailianBillingImportItemsOptions = {}
): Promise<FetchBailianBillingImportItemsResult> {
  const session = await createConsoleSession(options);
  const [foundationModels, priceRowsByModel] = await Promise.all([
    fetchFoundationModels(session),
    fetchAllPriceRows(session),
  ]);

  const items: BailianBillingImportItem[] = [];

  for (const [modelKey, aggregated] of priceRowsByModel.entries()) {
    const metadata = foundationModels.get(modelKey);
    const baseModality = inferModalityFromCategory(aggregated.categoryLevel1);
    const modality = inferModalityFromModel(metadata, baseModality);
    const pricingRules = buildRulesFromRows(aggregated.categoryLevel1, aggregated.rows);

    const inputRule = selectRepresentativePrice(
      pricingRules,
      ["input_tokens"],
      (metricKey) => metricKey.includes("input")
    );
    const outputRule = selectRepresentativePrice(
      pricingRules,
      ["output_tokens"],
      (metricKey) => metricKey.includes("output") || metricKey === "image_count" || metricKey.endsWith("_seconds") || metricKey === "tts_characters"
    );

    items.push({
      modelKey,
      provider: "dashscope",
      providerModel: modelKey,
      displayName: metadata?.name || modelKey,
      modality,
      currency: "CNY",
      billingMode: "metered",
      pricingUnit: inferPricingUnit(modality, inputRule, outputRule),
      inputPrice: inputRule ? toFixedNumber(inputRule.price) : 0,
      outputPrice: outputRule ? toFixedNumber(outputRule.price) : 0,
      enabled: true,
      pricingRules,
      metadata: {
        source: "bailian-console",
        sourcePageUrl: BAILIAN_CONSOLE_PAGE_URL,
        sourceRegion: "CN",
        sourceApi: {
          models: FOUNDATION_MODELS_API,
          priceCategories: PRICE_CATEGORIES_API,
          prices: MODEL_PRICES_API,
        },
        sourceVersion: session.frontendVersion,
        categoryLevel1: aggregated.categoryLevel1,
        categoryLevel2: aggregated.categoryLevel2 || null,
        docUrl: metadata?.docUrl || null,
        description: metadata?.shortDescription || metadata?.description || null,
        scope: metadata?.scope || null,
        needApply: metadata?.needApply ?? null,
        openSource: metadata?.openSource ?? null,
        modelAlias: metadata?.modelAlias || null,
        versionTag: metadata?.versionTag || null,
        collectionTag: metadata?.collectionTag || null,
        capabilities: metadata?.capabilities || [],
        categories: metadata?.categories || [],
        features: metadata?.features || [],
        permissions: metadata?.permissions || {},
        supports: metadata?.supports || {},
        quota: metadata?.quota || {},
        requestModality: metadata?.inferenceMetadata?.request_modality || [],
        responseModality: metadata?.inferenceMetadata?.response_modality || [],
        priceRows: aggregated.rows.map((row) => ({
          batch: row.batch,
          rangeName: row.rangeName,
          priceUnit: row.priceUnit,
          prices: row.prices || [],
        })),
      },
    });
  }

  const filteredItems = items.filter((item) => item.inputPrice > 0 && item.outputPrice > 0);
  const allItems = sortItems(filteredItems, foundationModels);
  const limitedItems =
    typeof options.limit === "number" ? allItems.slice(0, Math.max(0, options.limit)) : allItems;

  return {
    fetchedAt: new Date().toISOString(),
    totalAvailable: allItems.length,
    returned: limitedItems.length,
    sourcePageUrl: BAILIAN_CONSOLE_PAGE_URL,
    items: limitedItems,
  };
}
