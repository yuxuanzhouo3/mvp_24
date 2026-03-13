/**
 * OpenRouter model importer.
 *
 * How the data source was discovered:
 * 1. The public models page is `https://openrouter.ai/models?order=most-popular`.
 * 2. That page requests `https://openrouter.ai/api/frontend/models/find?...`.
 * 3. The `order` query parameter matches the page's sort dropdown.
 * 4. The response returns `data.models` in the same order that the page renders.
 * 5. Text pricing lives on each model's `endpoint.pricing`, `endpoint.variable_pricings`,
 *    and `endpoint.pricing_json` fields.
 * 6. For tiered pricing, this script keeps the highest visible text input/output price.
 *
 * Why this is useful for your backend:
 * - You can import this file as a module and call `fetchOpenRouterModels()` on a schedule.
 * - You can switch `order` to `newest` if you want to sync newly listed models first.
 * - The output is already normalized for storage: rank, slug, pricing, modalities, source fields.
 *
 * Run examples:
 * - `node --experimental-strip-types ./scripts/openrouter-import.ts`
 * - `node --experimental-strip-types ./scripts/openrouter-import.ts --order newest --limit 50`
 * - `node --experimental-strip-types ./scripts/openrouter-import.ts --format csv --out ./openrouter-models.csv`
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const OPENROUTER_MODELS_PAGE = 'https://openrouter.ai/models';
const OPENROUTER_MODELS_FIND_API = 'https://openrouter.ai/api/frontend/models/find';

export const OPENROUTER_SORT_ORDERS = [
  'most-popular',
  'newest',
  'top-weekly',
  'pricing-low-to-high',
  'pricing-high-to-low',
  'context-high-to-low',
  'throughput-high-to-low',
  'latency-low-to-high',
] as const;

export type OpenRouterSortOrder = (typeof OPENROUTER_SORT_ORDERS)[number];

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface OpenRouterPricingLineItem {
  type?: string;
  value?: string | number;
}

interface OpenRouterPricing {
  prompt?: string | number;
  completion?: string | number;
  completions?: string | number;
  line_items?: OpenRouterPricingLineItem[];
  [key: string]: unknown;
}

interface OpenRouterVariablePricing {
  type?: string;
  threshold?: string | number;
  prompt?: string | number;
  completion?: string | number;
  completions?: string | number;
  [key: string]: unknown;
}

interface OpenRouterEndpoint {
  id?: string;
  name?: string;
  context_length?: number;
  provider_name?: string;
  provider_slug?: string;
  pricing?: OpenRouterPricing;
  pricing_json?: Record<string, string | number>;
  variable_pricings?: OpenRouterVariablePricing[];
  limit_rpm?: number;
  limit_rpd?: number;
  is_free?: boolean;
}

interface OpenRouterModel {
  slug: string;
  permaslug?: string;
  name: string;
  short_name?: string;
  author?: string;
  description?: string;
  context_length?: number;
  created_at?: string;
  updated_at?: string;
  input_modalities?: string[];
  output_modalities?: string[];
  group?: string;
  endpoint?: OpenRouterEndpoint | null;
}

interface OpenRouterModelsFindPayload {
  data?: {
    models?: OpenRouterModel[];
    analytics?: Record<string, JsonValue>;
    categories?: JsonValue[];
  };
}

interface PriceCandidate {
  source: string;
  exact: string;
}

export interface ImportedOpenRouterModel {
  rank: number;
  order: OpenRouterSortOrder;
  slug: string;
  permaslug: string | null;
  name: string;
  shortName: string | null;
  author: string | null;
  description: string | null;
  group: string | null;
  providerName: string | null;
  providerSlug: string | null;
  contextLength: number | null;
  endpointContextLength: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  inputModalities: string[];
  outputModalities: string[];
  inputPriceUsdPerToken: string;
  outputPriceUsdPerToken: string;
  inputPriceUsdPerMillionTokens: string;
  outputPriceUsdPerMillionTokens: string;
  inputPriceSource: string;
  outputPriceSource: string;
  pricingTier: 'base' | 'highest-tier';
  isFree: boolean;
  limitRpm: number | null;
  limitRpd: number | null;
  sourceListUrl: string;
  sourceApiUrl: string;
  rawPricing?: OpenRouterPricing | null;
  rawVariablePricings?: OpenRouterVariablePricing[];
}

export interface FetchOpenRouterModelsOptions {
  order?: OpenRouterSortOrder;
  limit?: number;
  includeRawPricing?: boolean;
  signal?: AbortSignal;
}

export interface FetchOpenRouterModelsResult {
  fetchedAt: string;
  order: OpenRouterSortOrder;
  totalAvailable: number;
  returned: number;
  sourcePageUrl: string;
  sourceApiUrl: string;
  models: ImportedOpenRouterModel[];
}

export interface OpenRouterBillingImportItem {
  modelKey: string;
  provider: string;
  providerModel: string;
  displayName: string;
  modality: string;
  currency: string;
  inputPrice: number;
  outputPrice: number;
  enabled: boolean;
  pricingRules: Array<{
    metricKey: string;
    unitSize: number;
    price: number;
    label: string;
  }>;
  metadata?: Record<string, unknown>;
}

interface CliOptions {
  order: OpenRouterSortOrder;
  limit?: number;
  format: 'json' | 'csv';
  out?: string;
  includeRawPricing: boolean;
}

export async function fetchOpenRouterModels(
  options: FetchOpenRouterModelsOptions = {},
): Promise<FetchOpenRouterModelsResult> {
  const order = options.order ?? 'most-popular';

  if (!OPENROUTER_SORT_ORDERS.includes(order)) {
    throw new Error(`Unsupported order: ${order}`);
  }

  const sourceApiUrl = new URL(OPENROUTER_MODELS_FIND_API);
  sourceApiUrl.searchParams.set('order', order);

  const response = await fetch(sourceApiUrl, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'user-agent': 'openrouter-import-script/1.0',
    },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as OpenRouterModelsFindPayload;
  const allModels = payload.data?.models ?? [];
  const selectedModels =
    typeof options.limit === 'number' ? allModels.slice(0, Math.max(0, options.limit)) : allModels;

  const normalizedModels = selectedModels.map((model, index) =>
    normalizeModel({
      model,
      rank: index + 1,
      order,
      sourceApiUrl: sourceApiUrl.toString(),
      includeRawPricing: options.includeRawPricing ?? false,
    }),
  );

  return {
    fetchedAt: new Date().toISOString(),
    order,
    totalAvailable: allModels.length,
    returned: normalizedModels.length,
    sourcePageUrl: `${OPENROUTER_MODELS_PAGE}?order=${order}`,
    sourceApiUrl: sourceApiUrl.toString(),
    models: normalizedModels,
  };
}

function normalizeModel(args: {
  model: OpenRouterModel;
  rank: number;
  order: OpenRouterSortOrder;
  sourceApiUrl: string;
  includeRawPricing: boolean;
}): ImportedOpenRouterModel {
  const { model, rank, order, sourceApiUrl, includeRawPricing } = args;
  const endpoint = model.endpoint ?? null;
  const { input, output } = resolveHighestTextPricing(endpoint);
  const sourceListUrl = `${OPENROUTER_MODELS_PAGE}?order=${order}`;

  return {
    rank,
    order,
    slug: model.slug,
    permaslug: model.permaslug ?? null,
    name: model.name,
    shortName: model.short_name ?? null,
    author: model.author ?? null,
    description: model.description ?? null,
    group: model.group ?? null,
    providerName: endpoint?.provider_name ?? null,
    providerSlug: endpoint?.provider_slug ?? null,
    contextLength: numberOrNull(model.context_length),
    endpointContextLength: numberOrNull(endpoint?.context_length),
    createdAt: model.created_at ?? null,
    updatedAt: model.updated_at ?? null,
    inputModalities: Array.isArray(model.input_modalities) ? model.input_modalities : [],
    outputModalities: Array.isArray(model.output_modalities) ? model.output_modalities : [],
    inputPriceUsdPerToken: input.exact,
    outputPriceUsdPerToken: output.exact,
    inputPriceUsdPerMillionTokens: shiftDecimalString(input.exact, 6),
    outputPriceUsdPerMillionTokens: shiftDecimalString(output.exact, 6),
    inputPriceSource: input.source,
    outputPriceSource: output.source,
    pricingTier:
      input.source === 'pricing.prompt' &&
      (output.source === 'pricing.completion' || output.source === 'pricing.completions')
        ? 'base'
        : 'highest-tier',
    isFree: Boolean(endpoint?.is_free) || (input.exact === '0' && output.exact === '0'),
    limitRpm: numberOrNull(endpoint?.limit_rpm),
    limitRpd: numberOrNull(endpoint?.limit_rpd),
    sourceListUrl,
    sourceApiUrl,
    ...(includeRawPricing
      ? {
          rawPricing: endpoint?.pricing ?? null,
          rawVariablePricings: endpoint?.variable_pricings ?? [],
        }
      : {}),
  };
}

function resolveHighestTextPricing(endpoint: OpenRouterEndpoint | null): {
  input: PriceCandidate;
  output: PriceCandidate;
} {
  const inputCandidates: PriceCandidate[] = [];
  const outputCandidates: PriceCandidate[] = [];

  const pricing = endpoint?.pricing;
  const variablePricings = endpoint?.variable_pricings ?? [];
  const pricingJson = endpoint?.pricing_json ?? {};

  addCandidate(inputCandidates, 'pricing.prompt', pricing?.prompt);
  addCandidate(outputCandidates, 'pricing.completion', pricing?.completion ?? pricing?.completions);

  for (const [index, variablePricing] of variablePricings.entries()) {
    addCandidate(inputCandidates, `variable_pricings[${index}].prompt`, variablePricing.prompt);
    addCandidate(
      outputCandidates,
      `variable_pricings[${index}].completion`,
      variablePricing.completion ?? variablePricing.completions,
    );
  }

  for (const [index, lineItem] of (pricing?.line_items ?? []).entries()) {
    const type = String(lineItem.type ?? '').toLowerCase();
    const value = lineItem.value;

    if (isInputThresholdLineItem(type)) {
      addCandidate(inputCandidates, `pricing.line_items[${index}].${type}`, value);
    }

    if (isOutputThresholdLineItem(type)) {
      addCandidate(outputCandidates, `pricing.line_items[${index}].${type}`, value);
    }
  }

  for (const [key, value] of Object.entries(pricingJson)) {
    const normalizedKey = key.toLowerCase();

    if (shouldIgnorePricingJsonKey(normalizedKey)) {
      continue;
    }

    if (isInputPricingJsonKey(normalizedKey)) {
      addCandidate(inputCandidates, `pricing_json.${key}`, value);
      continue;
    }

    if (isOutputPricingJsonKey(normalizedKey)) {
      addCandidate(outputCandidates, `pricing_json.${key}`, value);
    }
  }

  return {
    input: selectHighestCandidate(inputCandidates, 'pricing.prompt'),
    output: selectHighestCandidate(outputCandidates, 'pricing.completion'),
  };
}

function isInputThresholdLineItem(type: string): boolean {
  return /above_threshold/.test(type) && /(input|prompt)/.test(type) && !/cache|audio|image|video/.test(type);
}

function isOutputThresholdLineItem(type: string): boolean {
  return /above_threshold/.test(type) && /(output|completion)/.test(type) && !/cache/.test(type);
}

function shouldIgnorePricingJsonKey(key: string): boolean {
  return /cache|audio|image|video|search|request|reasoning|storage|guidelines_violation/.test(key);
}

function isInputPricingJsonKey(key: string): boolean {
  return /prompt_tokens|text_input_tokens/.test(key);
}

function isOutputPricingJsonKey(key: string): boolean {
  return /completion_tokens/.test(key);
}

function addCandidate(list: PriceCandidate[], source: string, value: string | number | undefined): void {
  const exact = toPlainDecimalString(value);

  if (exact === null) {
    return;
  }

  list.push({ source, exact });
}

function selectHighestCandidate(candidates: PriceCandidate[], fallbackSource: string): PriceCandidate {
  if (candidates.length === 0) {
    return { source: fallbackSource, exact: '0' };
  }

  return candidates.reduce((highest, current) =>
    compareDecimalStrings(current.exact, highest.exact) > 0 ? current : highest,
  );
}

function toPlainDecimalString(value: string | number | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  let raw = String(value).trim().toLowerCase();

  if (!raw || raw === '.') {
    return null;
  }

  if (raw.startsWith('+')) {
    raw = raw.slice(1);
  }

  if (!/^\d*\.?\d*(e[+-]?\d+)?$/.test(raw)) {
    return null;
  }

  const [coefficient, exponentText] = raw.split('e');
  const exponent = exponentText ? Number.parseInt(exponentText, 10) : 0;
  const [integerPartRaw, fractionalPartRaw = ''] = coefficient.split('.');
  const integerPart = integerPartRaw === '' ? '0' : integerPartRaw;
  const digits = `${integerPart}${fractionalPartRaw}`;

  if (!/^[0-9]+$/.test(digits)) {
    return null;
  }

  const decimalIndex = integerPart.length + exponent;
  let result: string;

  if (decimalIndex <= 0) {
    result = `0.${'0'.repeat(Math.abs(decimalIndex))}${digits}`;
  } else if (decimalIndex >= digits.length) {
    result = `${digits}${'0'.repeat(decimalIndex - digits.length)}`;
  } else {
    result = `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  }

  return normalizePlainDecimalString(result);
}

function normalizePlainDecimalString(value: string): string {
  const [integerPartRaw, fractionalPartRaw = ''] = value.split('.');
  const integerPart = integerPartRaw.replace(/^0+(?=\d)/, '') || '0';
  const fractionalPart = fractionalPartRaw.replace(/0+$/, '');
  return fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart;
}

function compareDecimalStrings(left: string, right: string): number {
  const normalizedLeft = normalizePlainDecimalString(left);
  const normalizedRight = normalizePlainDecimalString(right);

  const [leftInteger, leftFractional = ''] = normalizedLeft.split('.');
  const [rightInteger, rightFractional = ''] = normalizedRight.split('.');

  if (leftInteger.length !== rightInteger.length) {
    return leftInteger.length > rightInteger.length ? 1 : -1;
  }

  if (leftInteger !== rightInteger) {
    return leftInteger > rightInteger ? 1 : -1;
  }

  const maxFractionLength = Math.max(leftFractional.length, rightFractional.length);
  const paddedLeftFraction = leftFractional.padEnd(maxFractionLength, '0');
  const paddedRightFraction = rightFractional.padEnd(maxFractionLength, '0');

  if (paddedLeftFraction === paddedRightFraction) {
    return 0;
  }

  return paddedLeftFraction > paddedRightFraction ? 1 : -1;
}

function shiftDecimalString(value: string, places: number): string {
  const normalized = normalizePlainDecimalString(value);
  const [integerPart, fractionalPart = ''] = normalized.split('.');
  const digits = `${integerPart}${fractionalPart}`;
  const decimalIndex = integerPart.length + places;

  if (decimalIndex <= 0) {
    return normalizePlainDecimalString(`0.${'0'.repeat(Math.abs(decimalIndex))}${digits}`);
  }

  if (decimalIndex >= digits.length) {
    return normalizePlainDecimalString(`${digits}${'0'.repeat(decimalIndex - digits.length)}`);
  }

  return normalizePlainDecimalString(`${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`);
}

function numberOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function toCsv(result: FetchOpenRouterModelsResult): string {
  const headers = [
    'rank',
    'order',
    'slug',
    'permaslug',
    'name',
    'shortName',
    'author',
    'group',
    'providerName',
    'providerSlug',
    'contextLength',
    'endpointContextLength',
    'createdAt',
    'updatedAt',
    'inputModalities',
    'outputModalities',
    'inputPriceUsdPerToken',
    'outputPriceUsdPerToken',
    'inputPriceUsdPerMillionTokens',
    'outputPriceUsdPerMillionTokens',
    'inputPriceSource',
    'outputPriceSource',
    'pricingTier',
    'isFree',
    'limitRpm',
    'limitRpd',
    'sourceListUrl',
    'sourceApiUrl',
  ] as const;

  const lines = [headers.join(',')];

  for (const model of result.models) {
    const row = headers.map((header) => {
      const value = model[header];
      if (Array.isArray(value)) {
        return csvEscape(value.join('|'));
      }
      return csvEscape(value === null || value === undefined ? '' : String(value));
    });
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function parseCliArgs(argv: string[]): CliOptions {
  const cliOptions: CliOptions = {
    order: 'most-popular',
    format: 'json',
    includeRawPricing: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--order': {
        const value = argv[index + 1] as OpenRouterSortOrder | undefined;
        if (!value || !OPENROUTER_SORT_ORDERS.includes(value)) {
          throw new Error(`--order must be one of: ${OPENROUTER_SORT_ORDERS.join(', ')}`);
        }
        cliOptions.order = value;
        index += 1;
        break;
      }
      case '--limit': {
        const value = argv[index + 1];
        const parsed = Number.parseInt(value ?? '', 10);
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw new Error('--limit must be a non-negative integer');
        }
        cliOptions.limit = parsed;
        index += 1;
        break;
      }
      case '--format': {
        const value = argv[index + 1];
        if (value !== 'json' && value !== 'csv') {
          throw new Error('--format must be json or csv');
        }
        cliOptions.format = value;
        index += 1;
        break;
      }
      case '--out': {
        const value = argv[index + 1];
        if (!value) {
          throw new Error('--out requires a file path');
        }
        cliOptions.out = value;
        index += 1;
        break;
      }
      case '--include-raw-pricing': {
        cliOptions.includeRawPricing = true;
        break;
      }
      case '--help':
      case '-h': {
        printHelp();
        process.exit(0);
      }
      default: {
        throw new Error(`Unknown argument: ${arg}`);
      }
    }
  }

  return cliOptions;
}

function printHelp(): void {
  console.log(`
Usage:
  node --experimental-strip-types ./scripts/openrouter-import.ts [options]

Options:
  --order <value>               Sort order. Default: most-popular
  --limit <number>              Limit the number of returned models
  --format <json|csv>           Output format. Default: json
  --out <path>                  Write output to a file instead of stdout
  --include-raw-pricing         Include raw pricing objects in JSON output
  --help                        Show this help message

Orders:
  ${OPENROUTER_SORT_ORDERS.join('\n  ')}
`);
}

export async function runOpenRouterImportCli(): Promise<void> {
  const cliOptions = parseCliArgs(process.argv.slice(2));
  const result = await fetchOpenRouterModels({
    order: cliOptions.order,
    limit: cliOptions.limit,
    includeRawPricing: cliOptions.includeRawPricing,
  });

  const serialized = cliOptions.format === 'csv' ? toCsv(result) : `${JSON.stringify(result, null, 2)}\n`;

  if (!cliOptions.out) {
    process.stdout.write(serialized);
    return;
  }

  const outputPath = resolve(cliOptions.out);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, 'utf8');
  process.stdout.write(`Wrote ${result.returned} models to ${outputPath}\n`);
}

const isMainModule = process.argv[1] && resolve(process.argv[1]).endsWith('openrouter-import.ts');

if (isMainModule) {
  runOpenRouterImportCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}


function toFixedPrice(value: string): number {
  const parsed = Number(value || '0');
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(8));
}

function inferBillingModality(model: ImportedOpenRouterModel): string {
  const output = Array.isArray(model.outputModalities) ? model.outputModalities.join('|').toLowerCase() : '';
  const input = Array.isArray(model.inputModalities) ? model.inputModalities.join('|').toLowerCase() : '';
  const modalities = `${input}|${output}`;
  if (modalities.includes('video')) return 'video';
  if (modalities.includes('audio')) return 'audio';
  if (modalities.includes('image')) return 'image';
  if (modalities.includes('multimodal')) return 'multimodal';
  return 'text';
}

export function buildOpenRouterBillingImportItems(
  result: FetchOpenRouterModelsResult,
): OpenRouterBillingImportItem[] {
  return result.models.map((model) => {
    const inputPrice = toFixedPrice(shiftDecimalString(model.inputPriceUsdPerMillionTokens, -3));
    const outputPrice = toFixedPrice(shiftDecimalString(model.outputPriceUsdPerMillionTokens, -3));
    const pricingRules =
      inputPrice === 0 && outputPrice === 0
        ? []
        : [
            {
              metricKey: 'input_tokens',
              unitSize: 1000,
              price: inputPrice,
              label: 'USD/1K input tokens',
            },
            {
              metricKey: 'output_tokens',
              unitSize: 1000,
              price: outputPrice,
              label: 'USD/1K output tokens',
            },
          ];

    return {
      modelKey: model.slug,
      provider: 'openrouter',
      providerModel: model.slug,
      displayName: model.name,
      modality: inferBillingModality(model),
      currency: 'USD',
      inputPrice,
      outputPrice,
      enabled: true,
      pricingRules,
      metadata: {
        source: 'openrouter',
        openrouterOrder: result.order,
        openrouterRank: model.rank,
        inputModalities: model.inputModalities,
        outputModalities: model.outputModalities,
        providerName: model.providerName,
        providerSlug: model.providerSlug,
        sourceApiUrl: result.sourceApiUrl,
        sourceListUrl: result.sourcePageUrl,
        fetchedAt: result.fetchedAt,
      },
    };
  });
}

export async function fetchOpenRouterBillingImportItems(
  options: FetchOpenRouterModelsOptions = {},
): Promise<{
  fetchedAt: string;
  order: OpenRouterSortOrder;
  totalAvailable: number;
  returned: number;
  items: OpenRouterBillingImportItem[];
}> {
  const result = await fetchOpenRouterModels(options);
  return {
    fetchedAt: result.fetchedAt,
    order: result.order,
    totalAvailable: result.totalAvailable,
    returned: result.returned,
    items: buildOpenRouterBillingImportItems(result),
  };
}
