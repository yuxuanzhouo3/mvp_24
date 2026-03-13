import { createHash, createHmac } from "node:crypto";
import type { BillingRule } from "@/lib/billing/types";

const VOLCENGINE_MODEL_LIST_PAGE = "https://www.volcengine.com/docs/82379/1330310?lang=zh";
const VOLCENGINE_MODEL_PRICE_PAGE = "https://www.volcengine.com/docs/82379/1544106?lang=zh";
const VOLCENGINE_ARK_CONSOLE_PAGE = "https://console.volcengine.com/ark/region:ark+cn-beijing/model?groupType=ModelGroups&vendor=Bytedance&view=DEFAULT_VIEW";
const VOLCENGINE_ARK_OPENAPI_HOST = "ark.cn-beijing.volcengineapi.com";
const VOLCENGINE_ARK_OPENAPI_ENDPOINT = `https://${VOLCENGINE_ARK_OPENAPI_HOST}`;
const VOLCENGINE_ARK_REGION = "cn-beijing";
const VOLCENGINE_ARK_SERVICE = "ark";
const VOLCENGINE_ARK_VERSION = "2024-01-01";

export interface VolcengineBillingImportItem {
  modelKey: string;
  provider: "volcengine";
  providerModel: string;
  displayName: string;
  modality: string;
  currency: "CNY";
  inputPrice: number;
  outputPrice: number;
  enabled: boolean;
  pricingRules: BillingRule[];
  metadata?: Record<string, unknown>;
}

export interface FetchVolcengineBillingImportItemsOptions {
  limit?: number;
  signal?: AbortSignal;
}

export interface FetchVolcengineBillingImportItemsResult {
  fetchedAt: string;
  totalAvailable: number;
  returned: number;
  sourcePageUrl: string;
  items: VolcengineBillingImportItem[];
}

type ParsedCell = { text: string; colspan: number; rowspan: number };

type ModelSeed = {
  modelKey: string;
  providerModel: string;
  displayName: string;
  modality: string;
  metadata?: Record<string, unknown>;
};

type ArkFoundationModelRecord = {
  Name?: string;
  DisplayName?: string;
  VendorName?: string;
  Introduction?: string;
  Description?: string;
  AccessType?: string;
  FoundationModelTag?: {
    TaskTypes?: string[];
    Domains?: string[];
    Languages?: string[];
    CustomizedTags?: string[];
    UsedLibraries?: string[];
  };
};

type ArkListResult = {
  TotalCount?: number;
  PageNumber?: number;
  PageSize?: number;
  Items?: ArkFoundationModelRecord[];
};

// 火山引擎价格表 - 从官方文档手动维护
// 来源: https://www.volcengine.com/docs/82379/1544106
// 更新时间: 2026-03-13
// 注意: 火山引擎价格页面完全动态渲染，无法通过爬虫自动获取，需手动更新
const VOLCENGINE_PRICES: Record<string, { input: number; output: number; modality: string }> = {
  "doubao-seed-1.8": { input: 0.0004, output: 0.004, modality: "text" },
  "doubao-seed-1.6-vision": { input: 0.0004, output: 0.004, modality: "multimodal" },
  "doubao-seed-1.6-lite": { input: 0.00015, output: 0.0012, modality: "text" },
  "doubao-seed-1.6": { input: 0.0004, output: 0.004, modality: "text" },
  "doubao-seed-1.6-thinking": { input: 0.0004, output: 0.004, modality: "text" },
  "doubao-seed-1.6-flash": { input: 0.000075, output: 0.00075, modality: "text" },
  "doubao-1.5-thinking-pro": { input: 0.002, output: 0.008, modality: "text" },
  "doubao-1.5-thinking-vision-pro": { input: 0.0015, output: 0.0045, modality: "multimodal" },
  "doubao-seed-translation": { input: 0.0006, output: 0.0018, modality: "text" },
  "doubao-1.5-pro-32k": { input: 0.0004, output: 0.001, modality: "text" },
  "doubao-1.5-lite-32k": { input: 0.00015, output: 0.0003, modality: "text" },
  "doubao-pro-32k": { input: 0.0008, output: 0.002, modality: "text" },
  "doubao-lite-32k": { input: 0.0003, output: 0.0006, modality: "text" },
  "deepseek-v3.2": { input: 0.001, output: 0.0015, modality: "text" },
  "deepseek-v3.1": { input: 0.002, output: 0.006, modality: "text" },
  "deepseek-v3": { input: 0.001, output: 0.004, modality: "text" },
  "deepseek-r1": { input: 0.002, output: 0.008, modality: "text" },
  "kimi-k2": { input: 0.002, output: 0.008, modality: "text" },
};

function getVolcenginePrice(modelKey: string) {
  const normalized = modelKey.toLowerCase();
  for (const [key, value] of Object.entries(VOLCENGINE_PRICES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }
  return null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&yen;/gi, "¥")
    .replace(/&middot;/gi, "·");
}

function stripHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function parseAttrNumber(attrs: string, key: string) {
  const match = attrs.match(new RegExp(`${key}=["']?(\\d+)`, "i"));
  return match ? Number.parseInt(match[1] || "1", 10) || 1 : 1;
}

function parseTableCells(rowHtml: string): ParsedCell[] {
  const cells: ParsedCell[] = [];
  const cellRegex = /<t[hd]\b([^>]*)>([\s\S]*?)<\/t[hd]>/gi;
  let match: RegExpExecArray | null;
  while ((match = cellRegex.exec(rowHtml))) {
    cells.push({
      text: stripHtml(match[2] || ""),
      colspan: Math.max(1, parseAttrNumber(match[1] || "", "colspan")),
      rowspan: Math.max(1, parseAttrNumber(match[1] || "", "rowspan")),
    });
  }
  return cells;
}

function parseTableMatrix(tableHtml: string): string[][] {
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const matrix: string[][] = [];
  const rowSpans = new Map<number, { text: string; remaining: number }>();
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(tableHtml))) {
    const row: string[] = [];
    let column = 0;
    const cells = parseTableCells(rowMatch[1] || "");

    const fillRowSpan = () => {
      while (rowSpans.has(column) && (row[column] === undefined || row[column] === "")) {
        const span = rowSpans.get(column)!;
        row[column] = span.text;
        span.remaining -= 1;
        if (span.remaining <= 0) rowSpans.delete(column);
        else rowSpans.set(column, span);
        column += 1;
      }
    };

    fillRowSpan();
    for (const cell of cells) {
      fillRowSpan();
      for (let i = 0; i < cell.colspan; i += 1) {
        row[column + i] = cell.text;
        if (cell.rowspan > 1) {
          rowSpans.set(column + i, { text: cell.text, remaining: cell.rowspan - 1 });
        }
      }
      column += cell.colspan;
    }

    for (const [index, span] of Array.from(rowSpans.entries()).sort((a, b) => a[0] - b[0])) {
      if (row[index] === undefined) {
        row[index] = span.text;
        span.remaining -= 1;
        if (span.remaining <= 0) rowSpans.delete(index);
        else rowSpans.set(index, span);
      }
    }

    matrix.push(row.map((cell) => String(cell || "").trim()));
  }

  return matrix.filter((row) => row.some((cell) => cell));
}

function normalizeHeader(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildHeaders(matrix: string[][]) {
  let headerRowCount = 0;
  for (let i = 0; i < Math.min(3, matrix.length); i += 1) {
    if (matrix[i]?.some((cell) => /模型|输入|输出|单价|价格|Token|图像|视频|音频/.test(cell))) {
      headerRowCount = i + 1;
    }
  }
  headerRowCount = Math.max(1, headerRowCount);
  const width = Math.max(...matrix.slice(0, headerRowCount).map((row) => row.length));
  const headers = Array.from({ length: width }, (_, index) => {
    const parts: string[] = [];
    for (let rowIndex = 0; rowIndex < headerRowCount; rowIndex += 1) {
      const cell = normalizeHeader(matrix[rowIndex]?.[index] || "");
      if (!cell) continue;
      if (parts[parts.length - 1] !== cell) parts.push(cell);
    }
    return parts.join(" ").trim();
  });
  return { headers, headerRowCount };
}

function findHeaderIndex(headers: string[], patterns: RegExp[]) {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
}

function extractModelKey(value: string) {
  const lines = value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const codeMatch = line.match(/[a-z][a-z0-9._/-]{2,}/i);
    if (codeMatch) return codeMatch[0].toLowerCase();
  }
  return (lines[0] || value).trim().toLowerCase().replace(/\s+/g, "-");
}

function inferModality(text: string) {
  const value = text.toLowerCase();
  if (/视频|video/.test(value)) return "video";
  if (/图像|图片|image/.test(value)) return "image";
  if (/语音|音频|speech|audio|tts|asr/.test(value)) return "audio";
  if (/向量|embedding/.test(value)) return "embedding";
  if (/多模态|vision|vl/.test(value)) return "multimodal";
  return "text";
}

function parsePriceCandidates(value: string) {
  return Array.from(value.matchAll(/(\d+(?:\.\d+)?)\s*元/g))
    .map((match) => Number.parseFloat(match[1] || "0"))
    .filter((price) => Number.isFinite(price) && price >= 0);
}

function toPer1k(value: number, header: string) {
  if (/每百万/.test(header)) return Number((value / 1000).toFixed(6));
  return Number(value.toFixed(6));
}

function parsePrice(value: string, header: string) {
  const candidates = parsePriceCandidates(value);
  if (!candidates.length) return null;
  return toPer1k(Math.min(...candidates), header);
}

function parseModelSeedsFromHtml(html: string): ModelSeed[] {
  const seeds = new Map<string, ModelSeed>();
  const text = stripHtml(html);
  const modelRegex = /(doubao|seed|skylark|deepseek|qwen|kimi|glm|claude|gemini|gpt)[a-z0-9._/-]*/gi;
  let match: RegExpExecArray | null;
  while ((match = modelRegex.exec(text))) {
    const modelKey = String(match[0] || "").toLowerCase();
    if (!modelKey || seeds.has(modelKey)) continue;
    const start = Math.max(0, match.index - 40);
    const end = Math.min(text.length, match.index + modelKey.length + 80);
    const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
    seeds.set(modelKey, {
      modelKey,
      providerModel: modelKey,
      displayName: modelKey,
      modality: inferModality(snippet),
      metadata: { source: "volcengine-docs" },
    });
  }
  return Array.from(seeds.values());
}

function buildRules(modality: string, inputPrice: number, outputPrice: number): BillingRule[] {
  const rules: BillingRule[] = [];
  if (inputPrice > 0) {
    rules.push({
      metricKey: modality === "image" ? "image_count" : modality === "video" ? "video_output_seconds" : modality === "audio" ? "audio_output_seconds" : "input_tokens",
      unitSize: modality === "image" ? 1 : modality === "video" || modality === "audio" ? 1 : 1000,
      price: inputPrice,
      label: modality === "image" ? "CNY/张" : modality === "video" ? "CNY/秒" : modality === "audio" ? "CNY/秒" : "CNY/1K 输入Token",
    });
  }
  if (outputPrice > 0) {
    rules.push({
      metricKey: modality === "image" ? "image_count" : modality === "video" ? "video_output_seconds" : modality === "audio" ? "audio_output_seconds" : "output_tokens",
      unitSize: modality === "image" ? 1 : modality === "video" || modality === "audio" ? 1 : 1000,
      price: outputPrice,
      label: modality === "image" ? "CNY/张" : modality === "video" ? "CNY/秒" : modality === "audio" ? "CNY/秒" : "CNY/1K 输出Token",
    });
  }
  return rules;
}

function scorePriceMatch(modelKey: string, displayName: string, sample: string) {
  const key = modelKey.toLowerCase();
  const name = displayName.toLowerCase();
  const content = sample.toLowerCase();
  let score = 0;
  if (content.includes(key)) score += 10;
  const nameTokens = name.split(/[^a-z0-9\u4e00-\u9fa5]+/i).filter((token) => token.length >= 2);
  for (const token of nameTokens.slice(0, 4)) {
    if (content.includes(token)) score += 2;
  }
  return score;
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmacBuffer(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function toAmzDate(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, shortDate: iso.slice(0, 8) };
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildCanonicalQuery(params: Record<string, string>) {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(params[key] || "")}`)
    .join("&");
}

function resolveArkCredentials() {
  const accessKeyId = process.env.VOLCENGINE_ARK_ACCESS_KEY_ID || process.env.VOLCENGINE_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.VOLCENGINE_ARK_SECRET_ACCESS_KEY || process.env.VOLCENGINE_SECRET_ACCESS_KEY || "";
  const sessionToken = process.env.VOLCENGINE_ARK_SESSION_TOKEN || process.env.VOLCENGINE_SESSION_TOKEN || undefined;
  if (!accessKeyId || !secretAccessKey) return null;
  return { accessKeyId, secretAccessKey, sessionToken };
}

async function callArkOpenApi<T>(
  action: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  const credentials = resolveArkCredentials();
  if (!credentials) {
    throw new Error("VOLCENGINE_ARK_CREDENTIALS_MISSING");
  }

  const query = buildCanonicalQuery({ Action: action, Version: VOLCENGINE_ARK_VERSION });
  const payload = JSON.stringify(body || {});
  const payloadHash = sha256Hex(payload);
  const { amzDate, shortDate } = toAmzDate();
  const signedHeaderNames = ["host", "x-content-sha256", "x-date"];
  const canonicalHeaderEntries: Array<[string, string]> = [
    ["host", VOLCENGINE_ARK_OPENAPI_HOST],
    ["x-content-sha256", payloadHash],
    ["x-date", amzDate],
  ];

  if (credentials.sessionToken) {
    signedHeaderNames.push("x-security-token");
    canonicalHeaderEntries.push(["x-security-token", credentials.sessionToken]);
  }

  canonicalHeaderEntries.sort((a, b) => a[0].localeCompare(b[0]));
  const canonicalHeaders = canonicalHeaderEntries.map(([key, value]) => `${key}:${String(value).trim()}\n`).join("");
  const signedHeaders = signedHeaderNames.sort().join(";");
  const canonicalRequest = ["POST", "/", query, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${shortDate}/${VOLCENGINE_ARK_REGION}/${VOLCENGINE_ARK_SERVICE}/request`;
  const stringToSign = ["HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = hmacBuffer(credentials.secretAccessKey, shortDate);
  const kRegion = hmacBuffer(kDate, VOLCENGINE_ARK_REGION);
  const kService = hmacBuffer(kRegion, VOLCENGINE_ARK_SERVICE);
  const kSigning = hmacBuffer(kService, "request");
  const signature = hmacHex(kSigning, stringToSign);

  const res = await fetch(`${VOLCENGINE_ARK_OPENAPI_ENDPOINT}/?${query}`, {
    method: "POST",
    headers: {
      Host: VOLCENGINE_ARK_OPENAPI_HOST,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Date": amzDate,
      "X-Content-Sha256": payloadHash,
      ...(credentials.sessionToken ? { "X-Security-Token": credentials.sessionToken } : {}),
      Authorization: `HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: payload,
    cache: "no-store",
    signal,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Ark ${action} 请求失败：${res.status} ${res.statusText}${errorText ? ` - ${errorText.slice(0, 200)}` : ""}`);
  }

  return (await res.json()) as T;
}

async function listArkFoundationModels(signal?: AbortSignal): Promise<ModelSeed[]> {
  const items: ArkFoundationModelRecord[] = [];
  let pageNumber = 1;
  let totalCount = 0;

  while (pageNumber <= 1 || items.length < totalCount) {
    const response = await callArkOpenApi<{ Result?: ArkListResult }>(
      "ListFoundationModels",
      { PageNumber: pageNumber, PageSize: 100 },
      signal
    );
    const result = response?.Result || {};
    totalCount = Number(result.TotalCount || 0);
    const pageItems = Array.isArray(result.Items) ? result.Items : [];
    items.push(...pageItems);
    if (!pageItems.length || pageItems.length < Number(result.PageSize || 100)) break;
    pageNumber += 1;
  }

  const deduped = new Map<string, ModelSeed>();
  for (const item of items) {
    const providerModel = String(item.Name || "").trim();
    const displayName = String(item.DisplayName || item.Name || "").trim();
    const vendorName = String(item.VendorName || "").trim();
    const modalityText = [
      displayName,
      providerModel,
      item.Introduction,
      item.Description,
      ...(item.FoundationModelTag?.TaskTypes || []),
      ...(item.FoundationModelTag?.Domains || []),
      ...(item.FoundationModelTag?.CustomizedTags || []),
      ...(item.FoundationModelTag?.UsedLibraries || []),
    ]
      .filter(Boolean)
      .join(" ");
    const modelKey = extractModelKey(`${providerModel}\n${displayName}`);
    if (!modelKey) continue;
    if (!deduped.has(modelKey)) {
      deduped.set(modelKey, {
        modelKey,
        providerModel: providerModel || modelKey,
        displayName: vendorName && displayName && !displayName.includes(vendorName) ? `${vendorName}: ${displayName}` : displayName || providerModel || modelKey,
        modality: inferModality(modalityText),
        metadata: {
          source: "volcengine-ark-api",
          vendorName: vendorName || null,
          accessType: item.AccessType || null,
        },
      });
    }
  }

  return Array.from(deduped.values());
}

function mergeSeeds(primary: ModelSeed[], fallback: ModelSeed[]) {
  const merged = new Map<string, ModelSeed>();
  for (const seed of [...primary, ...fallback]) {
    if (!seed.modelKey) continue;
    const existing = merged.get(seed.modelKey);
    if (!existing) {
      merged.set(seed.modelKey, seed);
      continue;
    }
    merged.set(seed.modelKey, {
      modelKey: existing.modelKey,
      providerModel: existing.providerModel || seed.providerModel,
      displayName: existing.displayName && existing.displayName !== existing.modelKey ? existing.displayName : seed.displayName,
      modality: existing.modality !== "text" ? existing.modality : seed.modality,
      metadata: { ...(seed.metadata || {}), ...(existing.metadata || {}) },
    });
  }
  return Array.from(merged.values());
}

export async function fetchVolcengineBillingImportItems(
  options: FetchVolcengineBillingImportItemsOptions = {}
): Promise<FetchVolcengineBillingImportItemsResult> {
  const [listRes, arkSeedsResult] = await Promise.all([
    fetch(VOLCENGINE_MODEL_LIST_PAGE, {
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "volcengine-import-script/1.0" },
      signal: options.signal,
      cache: "no-store",
    }),
    listArkFoundationModels(options.signal)
      .then((items) => ({ ok: true as const, items }))
      .catch((error) => ({ ok: false as const, items: [] as ModelSeed[], error })),
  ]);

  if (!listRes.ok) throw new Error(`火山引擎模型列表抓取失败：${listRes.status} ${listRes.statusText}`);

  const listHtml = await listRes.text();
  const docSeeds = parseModelSeedsFromHtml(listHtml);
  const seeds = mergeSeeds(arkSeedsResult.items, docSeeds);

  const items = seeds
    .map((seed, index) => {
      const priceData = getVolcenginePrice(seed.modelKey);
      const modality = priceData?.modality || seed.modality;
      const inputPrice = priceData?.input || 0;
      const outputPrice = priceData?.output || 0;

      return {
        modelKey: seed.modelKey,
        provider: "volcengine" as const,
        providerModel: seed.providerModel || seed.modelKey,
        displayName: seed.displayName || seed.modelKey,
        modality,
        currency: "CNY" as const,
        inputPrice,
        outputPrice,
        enabled: true,
        pricingRules: buildRules(modality, inputPrice, outputPrice),
        metadata: {
          ...(seed.metadata || {}),
          source: arkSeedsResult.ok ? "volcengine-ark-api+manual" : "volcengine-manual",
          sourceListUrl: VOLCENGINE_MODEL_LIST_PAGE,
          sourcePriceUrl: VOLCENGINE_MODEL_PRICE_PAGE,
          sourceConsoleUrl: VOLCENGINE_ARK_CONSOLE_PAGE,
          sourceApiHost: arkSeedsResult.ok ? VOLCENGINE_ARK_OPENAPI_HOST : null,
          sourceOrder: index + 1,
          priceSource: priceData ? "manual" : "none",
          arkApiEnabled: arkSeedsResult.ok,
          arkApiError: arkSeedsResult.ok
            ? null
            : arkSeedsResult.error instanceof Error
              ? arkSeedsResult.error.message
              : "ARK API unavailable",
        },
      };
    })
    .filter((item) => item.inputPrice > 0 && item.outputPrice > 0);

  const deduped = new Map<string, VolcengineBillingImportItem>();
  for (const item of items) {
    if (!item.modelKey) continue;
    const existing = deduped.get(item.modelKey);
    if (!existing) {
      deduped.set(item.modelKey, item);
      continue;
    }
    const existingPriced = existing.inputPrice > 0 || existing.outputPrice > 0;
    const currentPriced = item.inputPrice > 0 || item.outputPrice > 0;
    if (!existingPriced && currentPriced) {
      deduped.set(item.modelKey, item);
    }
  }

  const allItems = Array.from(deduped.values());
  const limited = typeof options.limit === "number" ? allItems.slice(0, Math.max(0, options.limit)) : allItems;

  return {
    fetchedAt: new Date().toISOString(),
    totalAvailable: allItems.length,
    returned: limited.length,
    sourcePageUrl: arkSeedsResult.ok ? VOLCENGINE_ARK_CONSOLE_PAGE : VOLCENGINE_MODEL_LIST_PAGE,
    items: limited,
  };
}
