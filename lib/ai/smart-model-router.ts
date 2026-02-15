export const SMART_MODEL_ID = "smart-auto";
export const SMART_AGENT_ID = "smart-model";

export type SmartCollaborationMode =
  | "parallel"
  | "sequential"
  | "deep"
  | "graph"
  | "debate"
  | "synthesis"
  | "single";

export interface ResolveSmartModelInput {
  requestedModel?: string;
  message?: string;
  collaborationMode?: string;
  availableModels?: string[];
  fallbackModel?: string;
}

export interface ResolveSmartModelResult {
  model: string;
  routedFromSmart: boolean;
  reason: string;
}

const SMART_ALLOWED_MODELS = [
  "qwen3-max-2026-01-23",
  "qwen-plus-2025-12-01",
  "deepseek-v3.2",
] as const;

const SMART_ALLOWED_MODEL_SET = new Set<string>(SMART_ALLOWED_MODELS);

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function isSmartModel(model?: string): boolean {
  if (!model) return false;
  const normalized = normalize(model);
  return (
    normalized === SMART_MODEL_ID ||
    normalized === "smart" ||
    normalized === "auto"
  );
}

function isDirectMultimodalInput(message: string): boolean {
  const raw = message.trim();
  if (!raw) return false;

  return (
    /data:image\/[a-zA-Z0-9.+-]+;base64,/.test(raw) ||
    /data:audio\/[a-zA-Z0-9.+-]+;base64,/.test(raw) ||
    /(https?:\/\/\S+\.(png|jpg|jpeg|gif|webp|mp3|wav|m4a|ogg|aac|flac))/i.test(
      raw
    ) ||
    /!\[[^\]]*]\([^)]+\)/.test(raw)
  );
}

function containsKeyword(message: string, pattern: RegExp): boolean {
  return pattern.test(message);
}

function firstAvailable(
  candidates: string[],
  availableSet: Set<string>
): string | null {
  for (const model of candidates) {
    if (availableSet.has(model)) {
      return model;
    }
  }
  return null;
}

function normalizeMode(value?: string): SmartCollaborationMode | undefined {
  if (!value) return undefined;
  const mode = normalize(value);
  if (
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

export function resolveSmartModel(
  input: ResolveSmartModelInput
): ResolveSmartModelResult {
  const requestedModel = (input.requestedModel || "").trim();
  const message = input.message || "";
  const fallbackModel = (input.fallbackModel || "").trim();
  const availableModels = (input.availableModels || []).filter(
    (model) => typeof model === "string" && model.trim().length > 0
  );

  if (!isSmartModel(requestedModel)) {
    return {
      model: requestedModel || fallbackModel || availableModels[0] || "gpt-3.5-turbo",
      routedFromSmart: false,
      reason: "explicit_model",
    };
  }

  const mode = normalizeMode(input.collaborationMode);
  const text = message.toLowerCase();
  const smartAvailableModels = availableModels.filter((modelId) =>
    SMART_ALLOWED_MODEL_SET.has(modelId)
  );
  const smartAvailableSet = new Set(smartAvailableModels);

  if (smartAvailableModels.length === 0) {
    return {
      model: fallbackModel || availableModels[0] || "qwen-plus-2025-12-01",
      routedFromSmart: true,
      reason: "smart_models_unavailable_fallback",
    };
  }

  const isCodingTask = containsKeyword(
    text,
    /(代码|编程|开发|bug|修复|重构|算法|sql|typescript|javascript|python|java|go|rust|code|debug|refactor|api)/
  );
  const isResearchTask = containsKeyword(
    text,
    /(研究|调研|方案|对比|分析|论文|report|research|compare|analysis|strategy|架构)/
  );
  const isTranslationTask = containsKeyword(
    text,
    /(翻译|中译英|英译中|润色|rewrite|translate|proofread|grammar)/
  );
  const hasDirectMultimodal = isDirectMultimodalInput(message);

  const multimodalCandidates = ["qwen-plus-2025-12-01", "qwen3-max-2026-01-23", "deepseek-v3.2"];
  const codeCandidates = [
    "deepseek-v3.2",
    "qwen3-max-2026-01-23",
    "qwen-plus-2025-12-01",
  ];
  const qualityCandidates = [
    "qwen3-max-2026-01-23",
    "qwen-plus-2025-12-01",
    "deepseek-v3.2",
  ];
  const balancedCandidates = [
    "qwen-plus-2025-12-01",
    "qwen3-max-2026-01-23",
    "deepseek-v3.2",
  ];
  const speedCandidates = [
    "qwen-plus-2025-12-01",
    "deepseek-v3.2",
    "qwen3-max-2026-01-23",
  ];

  const candidateBuckets: { reason: string; models: string[] }[] = [];

  if (hasDirectMultimodal) {
    candidateBuckets.push({
      reason: "direct_multimodal_input",
      models: multimodalCandidates,
    });
  }

  if (mode === "graph" || mode === "deep" || mode === "synthesis") {
    candidateBuckets.push({
      reason: "complex_collaboration_mode",
      models: qualityCandidates,
    });
  } else if (mode === "parallel") {
    candidateBuckets.push({
      reason: "parallel_mode_balanced",
      models: balancedCandidates,
    });
  } else if (mode === "sequential") {
    candidateBuckets.push({
      reason: "sequential_mode_quality",
      models: qualityCandidates,
    });
  }

  if (isCodingTask) {
    candidateBuckets.push({ reason: "coding_intent", models: codeCandidates });
  }

  if (isTranslationTask) {
    candidateBuckets.push({
      reason: "translation_intent",
      models: speedCandidates,
    });
  }

  if (isResearchTask) {
    candidateBuckets.push({
      reason: "research_intent",
      models: qualityCandidates,
    });
  }

  candidateBuckets.push({ reason: "default_balanced", models: balancedCandidates });
  candidateBuckets.push({ reason: "default_quality", models: qualityCandidates });
  candidateBuckets.push({ reason: "default_speed", models: speedCandidates });

  for (const bucket of candidateBuckets) {
    const selected = firstAvailable(bucket.models, smartAvailableSet);
    if (selected) {
      return {
        model: selected,
        routedFromSmart: true,
        reason: bucket.reason,
      };
    }
  }

  return {
    model: smartAvailableModels[0] || fallbackModel || availableModels[0] || "qwen-plus-2025-12-01",
    routedFromSmart: true,
    reason: "fallback_smart_only_models",
  };
}
