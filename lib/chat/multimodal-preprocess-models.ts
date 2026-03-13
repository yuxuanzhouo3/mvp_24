import type { ModelCatalogEntry } from "@/lib/billing/types";
import type { MultimodalAttachmentPayload } from "@/lib/chat/multimodal-types";

const IMAGE_HINTS =
  /(gemini|gpt-4o|gpt-4\.1|claude-3|claude-sonnet|pixtral|llava|4v|vision|vl|omni|multimodal)/i;
const AUDIO_HINTS =
  /(gemini|gpt-4o|audio|speech|asr|stt|transcrib|omni|multimodal)/i;
const VIDEO_HINTS =
  /(gemini|gpt-4o|video|vision|vl|omni|multimodal)/i;

const INTL_VISION_MODEL_PREFERENCES = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite-001",
  "gemini-2.0-flash-001",
  "gpt-4o-mini",
  "gpt-4.1-mini",
  "gpt-5-nano",
  "qwen3-omni-flash",
  "qwen3-omni-flash-2025-12-01",
] as const;

const INTL_AUDIO_MODEL_PREFERENCES = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-001",
  "gpt-4o-mini",
  "gpt-4.1-mini",
  "gpt-5-nano",
  "qwen3-omni-flash-2025-12-01",
  "qwen3-omni-flash",
] as const;

const INTL_TEXT_MODEL_PREFERENCES = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite-001",
  "gemini-2.0-flash-001",
  "gpt-5-nano",
  "gpt-4o-mini",
  "gpt-4.1-mini",
  "qwen-plus",
  "qwen3-omni-flash",
] as const;

const RETRYABLE_PREPROCESS_STATUS_CODES = new Set([
  400,
  403,
  404,
  408,
  409,
  422,
  429,
  500,
  502,
  503,
  504,
]);

const PREPROCESS_MODEL_ATTEMPT_LIMIT = 6;

export interface PreprocessAttachmentRequirements {
  hasImagePayload: boolean;
  hasAudioPayload: boolean;
  hasVideoPayload: boolean;
}

function toLowerText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getModelAlias(value: string): string {
  const normalized = toLowerText(value);
  if (!normalized) return "";
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

function getMetadataModalities(entry: ModelCatalogEntry): Set<string> {
  const values = new Set<string>();
  const metadata = entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {};
  const candidateArrays = [
    (metadata as any).inputModalities,
    (metadata as any).outputModalities,
    (metadata as any).capabilities,
  ];

  for (const candidate of candidateArrays) {
    if (!Array.isArray(candidate)) continue;
    for (const item of candidate) {
      const normalized = toLowerText(item);
      if (normalized) values.add(normalized);
    }
  }

  const modality = toLowerText(entry.modality);
  if (modality) values.add(modality);
  return values;
}

function hasAnyToken(haystack: Set<string>, patterns: RegExp[]): boolean {
  for (const token of haystack) {
    if (patterns.some((pattern) => pattern.test(token))) {
      return true;
    }
  }
  return false;
}

function supportsImageInput(entry: ModelCatalogEntry): boolean {
  const metadataTokens = getMetadataModalities(entry);
  if (
    hasAnyToken(metadataTokens, [
      /image/,
      /vision/,
      /multimodal/,
      /omni/,
      /video/,
    ])
  ) {
    return true;
  }

  const text = `${entry.modelKey} ${entry.displayName}`.toLowerCase();
  return IMAGE_HINTS.test(text);
}

function supportsAudioInput(entry: ModelCatalogEntry): boolean {
  const metadataTokens = getMetadataModalities(entry);
  if (
    hasAnyToken(metadataTokens, [
      /audio/,
      /speech/,
      /stt/,
      /asr/,
      /multimodal/,
      /omni/,
    ])
  ) {
    return true;
  }

  const text = `${entry.modelKey} ${entry.displayName}`.toLowerCase();
  return AUDIO_HINTS.test(text);
}

function supportsVideoInput(entry: ModelCatalogEntry): boolean {
  const metadataTokens = getMetadataModalities(entry);
  if (hasAnyToken(metadataTokens, [/video/])) {
    return true;
  }

  const text = `${entry.modelKey} ${entry.displayName}`.toLowerCase();
  return VIDEO_HINTS.test(text) || supportsImageInput(entry);
}

function totalTokenPrice(entry: ModelCatalogEntry): number {
  return Math.max(0, Number(entry.inputPrice || 0)) + Math.max(0, Number(entry.outputPrice || 0));
}

function getOpenRouterRank(entry: ModelCatalogEntry): number {
  const rank = Number((entry.metadata as any)?.openrouterRank || 0);
  return Number.isFinite(rank) && rank > 0 ? rank : Number.MAX_SAFE_INTEGER;
}

function getPreferenceRank(
  entry: ModelCatalogEntry,
  requirements: PreprocessAttachmentRequirements,
): number {
  const alias = getModelAlias(entry.modelKey);
  const preferredList = requirements.hasAudioPayload
    ? INTL_AUDIO_MODEL_PREFERENCES
    : requirements.hasImagePayload || requirements.hasVideoPayload
      ? INTL_VISION_MODEL_PREFERENCES
      : INTL_TEXT_MODEL_PREFERENCES;
  const rank = preferredList.findIndex((value) => value === alias);
  return rank >= 0 ? rank : Number.MAX_SAFE_INTEGER;
}

function compareCandidateModels(
  left: ModelCatalogEntry,
  right: ModelCatalogEntry,
  requirements: PreprocessAttachmentRequirements,
): number {
  const preferenceRankDelta =
    getPreferenceRank(left, requirements) - getPreferenceRank(right, requirements);
  if (preferenceRankDelta !== 0) return preferenceRankDelta;

  const priceDelta = totalTokenPrice(left) - totalTokenPrice(right);
  if (priceDelta !== 0) return priceDelta;

  const scopedDelta = Number(!left.modelKey.includes("/")) - Number(!right.modelKey.includes("/"));
  if (scopedDelta !== 0) return scopedDelta;

  const popularityDelta = getOpenRouterRank(left) - getOpenRouterRank(right);
  if (popularityDelta !== 0) return popularityDelta;

  return String(left.modelKey).localeCompare(String(right.modelKey));
}

function isCompatibleCandidate(
  entry: ModelCatalogEntry,
  requirements: PreprocessAttachmentRequirements,
): boolean {
  if (entry.enabled === false) return false;
  if (entry.region === "INTL" && !entry.modelKey.includes("/")) return false;
  if (requirements.hasAudioPayload && !supportsAudioInput(entry)) return false;
  if (requirements.hasImagePayload && !supportsImageInput(entry)) return false;
  if (requirements.hasVideoPayload && !supportsVideoInput(entry)) return false;
  return true;
}

function dedupeCandidates(entries: ModelCatalogEntry[]): ModelCatalogEntry[] {
  const seen = new Set<string>();
  const result: ModelCatalogEntry[] = [];

  for (const entry of entries) {
    const alias = getModelAlias(entry.modelKey) || toLowerText(entry.modelKey);
    if (!alias || seen.has(alias)) continue;
    seen.add(alias);
    result.push(entry);
  }

  return result;
}

export function summarizePreprocessRequirements(
  attachments: MultimodalAttachmentPayload[],
): PreprocessAttachmentRequirements {
  return {
    hasImagePayload: attachments.some(
      (item) => item.kind === "image" && typeof item.dataUrl === "string" && item.dataUrl.length > 0,
    ),
    hasAudioPayload: attachments.some(
      (item) => item.kind === "audio" && typeof item.dataUrl === "string" && item.dataUrl.length > 0,
    ),
    hasVideoPayload: attachments.some(
      (item) => item.kind === "video" && typeof item.dataUrl === "string" && item.dataUrl.length > 0,
    ),
  };
}

export function resolveIntlPreprocessModelCandidates(
  entries: ModelCatalogEntry[],
  attachments: MultimodalAttachmentPayload[],
): ModelCatalogEntry[] {
  const requirements = summarizePreprocessRequirements(attachments);
  const needsRichMedia =
    requirements.hasImagePayload ||
    requirements.hasAudioPayload ||
    requirements.hasVideoPayload;
  const enabledEntries = entries.filter((entry) => entry.enabled !== false);
  const compatible = enabledEntries.filter((entry) =>
    isCompatibleCandidate(entry, requirements),
  );
  if (needsRichMedia && compatible.length === 0) {
    return [];
  }
  const pool = compatible.length > 0 ? compatible : enabledEntries;

  return dedupeCandidates(
    [...pool].sort((left, right) => compareCandidateModels(left, right, requirements)),
  ).slice(0, PREPROCESS_MODEL_ATTEMPT_LIMIT);
}

export function resolvePreprocessBillingModelKey(modelKey: string): string {
  const trimmed = String(modelKey || "").trim();
  if (!trimmed) return "qwen3-omni-flash";

  const normalized = trimmed.toLowerCase();
  if (normalized.endsWith("/qwen3-omni-flash-2025-12-01")) {
    return "qwen3-omni-flash-2025-12-01";
  }
  if (normalized.endsWith("/qwen3-omni-flash")) {
    return "qwen3-omni-flash";
  }

  return trimmed;
}

export function shouldRetryPreprocessModel(error: unknown): boolean {
  const status = Number((error as any)?.status || 0);
  if (RETRYABLE_PREPROCESS_STATUS_CODES.has(status)) return true;

  const message = [
    (error as any)?.message,
    (error as any)?.error?.message,
    (error as any)?.cause?.message,
  ]
    .map((item) => (typeof item === "string" ? item : ""))
    .join(" ")
    .toLowerCase();

  return /not available in your region|unsupported|does not support|unknown model|model not found|no endpoint|vision|image_url|input_audio|multimodal/.test(
    message,
  ) || /empty content/.test(
    message,
  );
}

export function buildPreprocessUnavailableMessage(
  attachments: MultimodalAttachmentPayload[],
): string {
  const requirements = summarizePreprocessRequirements(attachments);
  const mediaTypes = [
    requirements.hasImagePayload ? "图片" : "",
    requirements.hasVideoPayload ? "视频" : "",
    requirements.hasAudioPayload ? "音频" : "",
  ].filter(Boolean);

  const mediaLabel = mediaTypes.length > 0 ? mediaTypes.join("/") : "多模态";
  return `${mediaLabel}预处理服务暂时不可用，请稍后重试，或改用文字描述继续提问。`;
}
