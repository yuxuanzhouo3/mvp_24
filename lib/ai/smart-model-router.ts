import { resolveModelReleaseDate } from "@/lib/model-release-date";

export const SMART_MODEL_ID = "smart-auto";
export const SMART_AGENT_ID = "smart-model";

export type SmartCollaborationMode =
  | "normal"
  | "parallel"
  | "sequential"
  | "deep"
  | "graph"
  | "debate"
  | "synthesis"
  | "single";

type PriceLevel = "free" | "low" | "medium" | "high";

export interface SmartModelCandidate {
  model?: string;
  modelKey?: string;
  id?: string;
  name?: string;
  displayName?: string;
  provider?: string;
  releaseDate?: string | null;
  unitPrice?: number | null;
  inputPrice?: number | null;
  outputPrice?: number | null;
  pricingUnit?: string | null;
  pricingLevel?: PriceLevel;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ResolveSmartModelInput {
  requestedModel?: string;
  message?: string;
  collaborationMode?: string;
  availableModels?: string[];
  availableEntries?: SmartModelCandidate[];
  fallbackModel?: string;
  userPlan?: string | null;
}

export interface ResolveSmartModelResult {
  model: string;
  routedFromSmart: boolean;
  reason: string;
}

export interface ResolveSmartModelPlanResult {
  models: string[];
  routedFromSmart: boolean;
  reason: string;
}

const SMART_SINGLE_MODEL_POOL_SIZE = 5;
const SMART_RECENT_MODEL_MAX_MONTHS = 3;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function normalizedModelId(candidate: SmartModelCandidate): string {
  return String(candidate.model || candidate.modelKey || candidate.id || "").trim();
}

function normalizeMode(value?: string): SmartCollaborationMode | undefined {
  if (!value) return undefined;
  const mode = normalize(value);
  if (
    mode === "normal" ||
    mode === "parallel" ||
    mode === "sequential" ||
    mode === "deep" ||
    mode === "graph" ||
    mode === "debate" ||
    mode === "synthesis" ||
    mode === "single"
  ) {
    return mode;
  }
  return undefined;
}

function normalizePlan(value?: string | null): string {
  return String(value || "").trim().toLowerCase();
}

function isPaidPlan(value?: string | null): boolean {
  const normalized = normalizePlan(value);
  return normalized.length > 0 && normalized !== "free";
}

function normalizePricingUnitFactor(pricingUnit?: string | null) {
  const normalized = String(pricingUnit || "").trim().toLowerCase();
  if (normalized === "per_1m_tokens") return 1 / 1000;
  if (normalized === "per_10k_characters") return 1 / 10;
  return 1;
}

function resolveUnitPrice(candidate: SmartModelCandidate): number | null {
  if (typeof candidate.unitPrice === "number" && Number.isFinite(candidate.unitPrice)) {
    return Math.max(0, candidate.unitPrice);
  }

  const input =
    typeof candidate.inputPrice === "number" && Number.isFinite(candidate.inputPrice)
      ? candidate.inputPrice
      : null;
  const output =
    typeof candidate.outputPrice === "number" && Number.isFinite(candidate.outputPrice)
      ? candidate.outputPrice
      : null;

  if (input === null && output === null) {
    if (candidate.pricingLevel === "free") return 0;
    if (candidate.pricingLevel === "low") return 0.002;
    if (candidate.pricingLevel === "medium") return 0.02;
    if (candidate.pricingLevel === "high") return 0.2;
    return null;
  }

  const factor = normalizePricingUnitFactor(candidate.pricingUnit);
  return Math.max(0, (input || 0) + (output || 0)) * factor;
}

function monthsSinceRelease(releaseDate: string | null | undefined, now: Date) {
  if (!releaseDate) return null;
  const parsed = new Date(releaseDate);
  if (!Number.isFinite(parsed.getTime())) return null;
  const ms = Math.max(0, now.getTime() - parsed.getTime());
  return ms / (1000 * 60 * 60 * 24 * 30.4375);
}

function computeTimeScore(releaseDate: string | null | undefined, now: Date) {
  const months = monthsSinceRelease(releaseDate, now);
  if (months === null) return 5;
  return Math.max(5, Math.min(10, 10 - months / 3));
}

function isRecentEnough(releaseDate: string | null | undefined, now: Date) {
  const months = monthsSinceRelease(releaseDate, now);
  return months !== null && months <= SMART_RECENT_MODEL_MAX_MONTHS;
}

function getReleaseTimestamp(releaseDate: string | null | undefined): number {
  if (!releaseDate) return 0;
  const parsed = new Date(releaseDate);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
}

function computePriceScores(candidates: SmartModelCandidate[]) {
  const prices = candidates
    .map((candidate) => resolveUnitPrice(candidate))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (prices.length === 0) {
    return new Map<string, number>();
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const scores = new Map<string, number>();

  for (const candidate of candidates) {
    const modelId = normalizedModelId(candidate);
    if (!modelId) continue;
    const price = resolveUnitPrice(candidate);
    if (price === null) {
      scores.set(modelId, 5);
      continue;
    }
    if (max === min) {
      scores.set(modelId, 10);
      continue;
    }

    const normalized = (price - min) / (max - min);
    scores.set(modelId, Math.max(2, 10 - normalized * 8));
  }

  return scores;
}

function createScoredCandidates(
  candidates: SmartModelCandidate[],
  userPlan?: string | null
) {
  const now = new Date();
  const weights = isPaidPlan(userPlan)
    ? { time: 0.9, price: 0.1 }
    : { time: 0.85, price: 0.15 };
  const priceScores = computePriceScores(candidates);

  return candidates
    .map((candidate) => {
      const model = normalizedModelId(candidate);
      if (!model) return null;
      const releaseDate = resolveModelReleaseDate({
        releaseDate: candidate.releaseDate,
        modelKey: model,
        metadata: candidate.metadata || null,
      });
      const timeScore = computeTimeScore(releaseDate, now);
      const priceScore = priceScores.get(model) ?? 5;
      const unitPrice = resolveUnitPrice(candidate);
      const score = timeScore * weights.time + priceScore * weights.price;

      return {
        candidate,
        model,
        releaseDate,
        unitPrice,
        timeScore,
        priceScore,
        score,
      };
    })
    .filter(
      (
        item
      ): item is {
        candidate: SmartModelCandidate;
        model: string;
        releaseDate: string | null;
        unitPrice: number | null;
        timeScore: number;
        priceScore: number;
        score: number;
      } => item !== null
    )
    .sort((a, b) => {
      const aRelease = getReleaseTimestamp(a.releaseDate);
      const bRelease = getReleaseTimestamp(b.releaseDate);
      if (bRelease !== aRelease) return bRelease - aRelease;
      if (b.timeScore !== a.timeScore) return b.timeScore - a.timeScore;
      if (b.score !== a.score) return b.score - a.score;
      const aPrice = typeof a.unitPrice === "number" ? a.unitPrice : Number.POSITIVE_INFINITY;
      const bPrice = typeof b.unitPrice === "number" ? b.unitPrice : Number.POSITIVE_INFINITY;
      if (aPrice !== bPrice) return aPrice - bPrice;
      return a.model.localeCompare(b.model);
    });
}

function dedupeModels(models: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const model of models) {
    const normalized = String(model || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function pickSequentialModels(
  ranked: ReturnType<typeof createScoredCandidates>
): string[] {
  const cheap = [...ranked].sort((a, b) => {
    const aPrice = typeof a.unitPrice === "number" ? a.unitPrice : Number.POSITIVE_INFINITY;
    const bPrice = typeof b.unitPrice === "number" ? b.unitPrice : Number.POSITIVE_INFINITY;
    if (aPrice !== bPrice) return aPrice - bPrice;
    return b.score - a.score;
  })[0];

  const best = ranked.find((item) => item.model !== cheap?.model) || ranked[0];

  const cheapPrice =
    typeof cheap?.unitPrice === "number" ? cheap.unitPrice : 0;
  const bestPrice =
    typeof best?.unitPrice === "number" ? best.unitPrice : cheapPrice;
  const targetPrice = (cheapPrice + bestPrice) / 2;

  const middle =
    ranked
      .filter((item) => item.model !== cheap?.model && item.model !== best?.model)
      .sort((a, b) => {
        const aPrice =
          typeof a.unitPrice === "number" ? a.unitPrice : Number.POSITIVE_INFINITY;
        const bPrice =
          typeof b.unitPrice === "number" ? b.unitPrice : Number.POSITIVE_INFINITY;
        const aDistance = Math.abs(aPrice - targetPrice);
        const bDistance = Math.abs(bPrice - targetPrice);
        if (aDistance !== bDistance) return aDistance - bDistance;
        return b.score - a.score;
      })[0] || ranked.find((item) => item.model !== cheap?.model && item.model !== best?.model);

  const ordered = dedupeModels([
    cheap?.model || "",
    middle?.model || "",
    best?.model || "",
  ]);

  if (ordered.length >= 3) return ordered.slice(0, 3);

  for (const item of ranked) {
    if (ordered.length >= 3) break;
    if (!ordered.includes(item.model)) {
      ordered.push(item.model);
    }
  }

  return ordered.slice(0, 3);
}

function pickWeightedSingleModel(
  ranked: ReturnType<typeof createScoredCandidates>,
  poolSize = SMART_SINGLE_MODEL_POOL_SIZE
): string {
  const pool = ranked.slice(0, Math.max(1, poolSize));
  if (pool.length === 0) return "";
  if (pool.length === 1) return pool[0]?.model || "";

  const weightedPool = pool.map((item, index) => {
    const priceFactor = 1 + (Math.max(item.priceScore, 0) / 10) * 0.35;
    return {
      model: item.model,
      // Release date is the dominant factor; price only nudges weights slightly.
      weight: Math.pow(pool.length - index, 3) * priceFactor,
    };
  });

  const totalWeight = weightedPool.reduce((sum, item) => sum + item.weight, 0);
  if (!(totalWeight > 0)) {
    return pool[0]?.model || "";
  }

  let threshold = Math.random() * totalWeight;
  for (const item of weightedPool) {
    threshold -= item.weight;
    if (threshold <= 0) {
      return item.model;
    }
  }

  return weightedPool[weightedPool.length - 1]?.model || pool[0]?.model || "";
}

function normalizeCandidates(
  input: ResolveSmartModelInput
): SmartModelCandidate[] {
  const fromEntries = Array.isArray(input.availableEntries)
    ? input.availableEntries
    : [];

  if (fromEntries.length > 0) {
    return fromEntries.filter((candidate) => {
      const model = normalizedModelId(candidate);
      if (!model || normalize(model) === SMART_MODEL_ID) return false;
      return candidate.enabled !== false;
    });
  }

  return (input.availableModels || [])
    .map((model) => ({ model, enabled: true }))
    .filter((candidate) => normalizedModelId(candidate).length > 0);
}

export function isSmartModel(model?: string): boolean {
  if (!model) return false;
  const normalized = normalize(model);
  return normalized === SMART_MODEL_ID || normalized === "smart" || normalized === "auto";
}

export function resolveSmartModelPlan(
  input: ResolveSmartModelInput
): ResolveSmartModelPlanResult {
  const requestedModel = (input.requestedModel || "").trim();
  const fallbackModel = (input.fallbackModel || "").trim();
  const candidates = normalizeCandidates(input);
  const availableSet = new Set(candidates.map((candidate) => normalizedModelId(candidate)));
  const fallbackList = dedupeModels([
    fallbackModel,
    ...candidates.map((candidate) => normalizedModelId(candidate)),
    ...(input.availableModels || []),
  ]);

  if (!isSmartModel(requestedModel)) {
    if (requestedModel && (availableSet.size === 0 || availableSet.has(requestedModel))) {
      return {
        models: [requestedModel || fallbackList[0] || "gpt-3.5-turbo"],
        routedFromSmart: false,
        reason: "explicit_model",
      };
    }

    return {
      models: [fallbackList[0] || "gpt-3.5-turbo"],
      routedFromSmart: false,
      reason: "explicit_model_unavailable_fallback",
    };
  }

  const mode = normalizeMode(input.collaborationMode);
  const now = new Date();
  const recentCandidates = candidates.filter((candidate) => {
    const releaseDate = resolveModelReleaseDate({
      releaseDate: candidate.releaseDate,
      modelKey: normalizedModelId(candidate),
      metadata: candidate.metadata || null,
    });
    return isRecentEnough(releaseDate, now);
  });
  const scopedCandidates = recentCandidates.length > 0 ? recentCandidates : candidates;

  if (scopedCandidates.length === 0) {
    return {
      models: [fallbackList[0] || "gpt-3.5-turbo"],
      routedFromSmart: true,
      reason: "smart_candidates_unavailable_fallback",
    };
  }

  const ranked = createScoredCandidates(scopedCandidates, input.userPlan);
  if (ranked.length === 0) {
    return {
      models: [fallbackList[0] || "gpt-3.5-turbo"],
      routedFromSmart: true,
      reason: "smart_scoring_failed_fallback",
    };
  }

  if (mode === "parallel") {
    return {
      models: ranked.slice(0, 3).map((item) => item.model),
      routedFromSmart: true,
      reason: isPaidPlan(input.userPlan)
        ? "parallel_top3_scored_paid"
        : "parallel_top3_scored_free",
    };
  }

  if (mode === "sequential") {
    return {
      models: pickSequentialModels(ranked),
      routedFromSmart: true,
      reason: isPaidPlan(input.userPlan)
        ? "sequential_cheap_mid_best_paid"
        : "sequential_cheap_mid_best_free",
    };
  }

  const singleModel =
    pickWeightedSingleModel(ranked, SMART_SINGLE_MODEL_POOL_SIZE) ||
    ranked[0]?.model ||
    fallbackList[0] ||
    "gpt-3.5-turbo";

  return {
    models: [singleModel],
    routedFromSmart: true,
    reason: isPaidPlan(input.userPlan)
      ? "single_top5_release_first_weighted_random_paid"
      : "single_top5_release_first_weighted_random_free",
  };
}

export function resolveSmartModel(
  input: ResolveSmartModelInput
): ResolveSmartModelResult {
  const plan = resolveSmartModelPlan(input);
  return {
    model: plan.models[0] || input.fallbackModel || input.availableModels?.[0] || "gpt-3.5-turbo",
    routedFromSmart: plan.routedFromSmart,
    reason: plan.reason,
  };
}
