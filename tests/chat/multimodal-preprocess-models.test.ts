import type { ModelCatalogEntry } from "@/lib/billing/types";

const helperModule = require("@/lib/chat/multimodal-preprocess-models");

const {
  buildPreprocessUnavailableMessage,
  resolveIntlPreprocessModelCandidates,
  resolvePreprocessBillingModelKey,
  summarizePreprocessRequirements,
} = helperModule;

function buildEntry(
  overrides: Partial<ModelCatalogEntry> & Pick<ModelCatalogEntry, "modelKey">,
): ModelCatalogEntry {
  return {
    modelKey: overrides.modelKey,
    provider: overrides.provider || "openrouter",
    providerModel: overrides.providerModel || overrides.modelKey,
    displayName: overrides.displayName || overrides.modelKey,
    region: overrides.region || "INTL",
    modality: overrides.modality || "text",
    billingMode: overrides.billingMode || "metered",
    currency: overrides.currency || "USD",
    inputPrice: overrides.inputPrice ?? 0,
    outputPrice: overrides.outputPrice ?? 0,
    pricingUnit: overrides.pricingUnit || "per_1k_tokens",
    pricingRules: overrides.pricingRules || [],
    enabled: overrides.enabled ?? true,
    metadata: overrides.metadata || {},
    updatedAt: overrides.updatedAt || null,
  };
}

describe("multimodal preprocess model selection", () => {
  it("prefers low-cost strong image preprocess models over weaker defaults", () => {
    const candidates = resolveIntlPreprocessModelCandidates(
      [
        buildEntry({
          modelKey: "openai/gpt-5-nano",
          modality: "multimodal",
          inputPrice: 0.00005,
          outputPrice: 0.0004,
        }),
        buildEntry({
          modelKey: "google/gemini-2.5-flash-lite",
          modality: "multimodal",
          inputPrice: 0.00001,
          outputPrice: 0.00004,
        }),
        buildEntry({
          modelKey: "qwen3-omni-flash",
          modality: "multimodal",
          inputPrice: 0.000008,
          outputPrice: 0.000008,
        }),
      ],
      [
        {
          id: "img-1",
          name: "image.png",
          mimeType: "image/png",
          size: 1024,
          kind: "image",
          dataUrl: "data:image/png;base64,abc",
        },
      ],
    );

    expect(candidates.map((item: ModelCatalogEntry) => item.modelKey)).toEqual([
      "google/gemini-2.5-flash-lite",
      "openai/gpt-5-nano",
    ]);
  });

  it("filters audio preprocess candidates to models with audio capability", () => {
    const candidates = resolveIntlPreprocessModelCandidates(
      [
        buildEntry({
          modelKey: "openai/gpt-4.1-mini",
          modality: "text",
          inputPrice: 0.0002,
          outputPrice: 0.0008,
        }),
        buildEntry({
          modelKey: "google/gemini-2.5-flash-lite",
          modality: "multimodal",
          inputPrice: 0.00001,
          outputPrice: 0.00004,
          metadata: {
            inputModalities: ["text", "audio", "image"],
            outputModalities: ["text"],
          },
        }),
        buildEntry({
          modelKey: "openai/gpt-4o-mini",
          modality: "multimodal",
          inputPrice: 0.00015,
          outputPrice: 0.0006,
        }),
      ],
      [
        {
          id: "audio-1",
          name: "voice.m4a",
          mimeType: "audio/mp4",
          size: 2048,
          kind: "audio",
          dataUrl: "data:audio/mp4;base64,abc",
        },
      ],
    );

    expect(candidates.map((item: ModelCatalogEntry) => item.modelKey)).toEqual([
      "google/gemini-2.5-flash-lite",
      "openai/gpt-4o-mini",
    ]);
  });

  it("uses text-oriented ordering when there is no rich media payload", () => {
    const candidates = resolveIntlPreprocessModelCandidates(
      [
        buildEntry({
          modelKey: "openai/gpt-5-nano",
          modality: "multimodal",
          inputPrice: 0.00005,
          outputPrice: 0.0004,
        }),
        buildEntry({
          modelKey: "google/gemini-2.5-flash-lite",
          modality: "multimodal",
          inputPrice: 0.00001,
          outputPrice: 0.00004,
        }),
        buildEntry({
          modelKey: "x-ai/grok-4.1-fast",
          modality: "text",
          inputPrice: 0.0004,
          outputPrice: 0.001,
        }),
      ],
      [
        {
          id: "file-1",
          name: "doc.txt",
          mimeType: "text/plain",
          size: 128,
          kind: "file",
          textContent: "hello",
        },
      ],
    );

    expect(candidates.map((item: ModelCatalogEntry) => item.modelKey)).toEqual([
      "google/gemini-2.5-flash-lite",
      "openai/gpt-5-nano",
      "x-ai/grok-4.1-fast",
    ]);
  });

  it("returns no candidates when rich media exists but no compatible preprocess model is enabled", () => {
    const candidates = resolveIntlPreprocessModelCandidates(
      [
        buildEntry({
          modelKey: "x-ai/grok-4.1-fast",
          modality: "text",
          inputPrice: 0.0004,
          outputPrice: 0.001,
        }),
      ],
      [
        {
          id: "img-1",
          name: "image.png",
          mimeType: "image/png",
          size: 1024,
          kind: "image",
          dataUrl: "data:image/png;base64,abc",
        },
      ],
    );

    expect(candidates).toEqual([]);
  });

  it("filters out providerless INTL alias models that are not callable via OpenRouter", () => {
    const candidates = resolveIntlPreprocessModelCandidates(
      [
        buildEntry({
          modelKey: "gemini-2.5-flash-lite",
          modality: "multimodal",
          inputPrice: 0.00001,
          outputPrice: 0.00004,
        }),
        buildEntry({
          modelKey: "google/gemini-2.5-flash-lite",
          modality: "multimodal",
          inputPrice: 0.00001,
          outputPrice: 0.00004,
          metadata: {
            inputModalities: ["text", "image"],
            outputModalities: ["text"],
          },
        }),
        buildEntry({
          modelKey: "qwen3-omni-flash",
          modality: "multimodal",
          inputPrice: 0.000008,
          outputPrice: 0.000008,
        }),
      ],
      [
        {
          id: "img-1",
          name: "image.png",
          mimeType: "image/png",
          size: 1024,
          kind: "image",
          dataUrl: "data:image/png;base64,abc",
        },
      ],
    );

    expect(candidates.map((item: ModelCatalogEntry) => item.modelKey)).toEqual([
      "google/gemini-2.5-flash-lite",
    ]);
  });

  it("summarizes attachment requirements and keeps friendly failure text specific", () => {
    const attachments = [
      {
        id: "img-1",
        name: "image.png",
        mimeType: "image/png",
        size: 128,
        kind: "image" as const,
        dataUrl: "data:image/png;base64,abc",
      },
      {
        id: "video-1",
        name: "clip.mp4",
        mimeType: "video/mp4",
        size: 256,
        kind: "video" as const,
        dataUrl: "data:image/jpeg;base64,poster",
      },
    ];

    expect(summarizePreprocessRequirements(attachments)).toEqual({
      hasImagePayload: true,
      hasAudioPayload: false,
      hasVideoPayload: true,
    });
    expect(buildPreprocessUnavailableMessage(attachments)).toContain("图片/视频");
  });

  it("preserves provider-scoped billing keys while normalizing qwen aliases", () => {
    expect(resolvePreprocessBillingModelKey("google/gemini-2.5-flash-lite")).toBe(
      "google/gemini-2.5-flash-lite",
    );
    expect(resolvePreprocessBillingModelKey("openai/gpt-4o-mini")).toBe(
      "openai/gpt-4o-mini",
    );
    expect(resolvePreprocessBillingModelKey("openrouter/qwen3-omni-flash")).toBe(
      "qwen3-omni-flash",
    );
  });
});
