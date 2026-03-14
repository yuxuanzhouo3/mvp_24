jest.mock("@/lib/admin/cache", () => ({
  getCachedData: jest.fn(() => null),
  setCachedData: jest.fn(),
}));

jest.mock("@/lib/importers/openrouter", () => ({
  fetchOpenRouterModels: jest.fn(async () => ({ models: [] })),
}));

jest.mock("@/lib/billing/catalog", () => ({
  listModelCatalogEntries: jest.fn(),
}));

import { listModelCatalogEntries } from "@/lib/billing/catalog";
import {
  getDefaultRuntimeModel,
  isChatSelectableRuntimeModel,
  listEnabledRuntimeModels,
} from "@/lib/ai/runtime-models";

const mockedListModelCatalogEntries = jest.mocked(listModelCatalogEntries);

describe("runtime-models", () => {
  beforeEach(() => {
    mockedListModelCatalogEntries.mockReset();
  });

  it("prefers Doubao Seed 2.0 Lite as the CN default model when available", async () => {
    mockedListModelCatalogEntries.mockResolvedValue([
      {
        modelKey: "qwen3-omni-flash",
        displayName: "Qwen Omni Flash",
        provider: "dashscope",
        enabled: true,
      },
      {
        modelKey: "doubao-seed-2-0-lite-260215",
        displayName: "Doubao-Seed-2.0-lite",
        provider: "volcengine",
        enabled: true,
      },
    ] as any);

    await expect(getDefaultRuntimeModel("CN")).resolves.toBe("doubao-seed-2-0-lite-260215");

    const models = await listEnabledRuntimeModels("CN");
    expect(models[0]?.modelKey).toBe("doubao-seed-2-0-lite-260215");
  });

  it("falls back to Doubao Seed 2.0 Lite for CN when the catalog is empty", async () => {
    mockedListModelCatalogEntries.mockResolvedValue([]);

    await expect(getDefaultRuntimeModel("CN")).resolves.toBe("doubao-seed-2-0-lite-260215");
  });

  it("filters chat runtime models down to text and multimodal candidates", async () => {
    mockedListModelCatalogEntries.mockResolvedValue([
      {
        modelKey: "whisper-asr",
        displayName: "Whisper ASR",
        provider: "openrouter",
        enabled: true,
        modality: "audio",
      },
      {
        modelKey: "video-understanding-pro",
        displayName: "Video Understanding Pro",
        provider: "openrouter",
        enabled: true,
        modality: "video",
      },
      {
        modelKey: "whisper-transcription-text",
        displayName: "Whisper Transcription Text",
        provider: "openrouter",
        enabled: true,
        modality: "text",
      },
      {
        modelKey: "chat-text-pro",
        displayName: "Chat Text Pro",
        provider: "openrouter",
        enabled: true,
        modality: "text",
      },
      {
        modelKey: "vision-chat-pro",
        displayName: "Vision Chat Pro",
        provider: "openrouter",
        enabled: true,
        modality: "multimodal",
      },
      {
        modelKey: "qwen-vl-ocr",
        displayName: "Qwen VL OCR",
        provider: "dashscope",
        enabled: true,
        modality: "multimodal",
      },
    ] as any);

    const models = await listEnabledRuntimeModels("INTL");

    expect(models.map((item) => item.modelKey)).toEqual([
      "chat-text-pro",
      "vision-chat-pro",
    ]);
    expect(
      isChatSelectableRuntimeModel({
        modelKey: "whisper-transcription-text",
        displayName: "Whisper Transcription Text",
        provider: "openrouter",
        enabled: true,
        modality: "text",
      } as any)
    ).toBe(false);
    expect(
      isChatSelectableRuntimeModel({
        modelKey: "qwen-vl-ocr",
        displayName: "Qwen VL OCR",
        provider: "dashscope",
        enabled: true,
        modality: "multimodal",
      } as any)
    ).toBe(false);
  });
});
