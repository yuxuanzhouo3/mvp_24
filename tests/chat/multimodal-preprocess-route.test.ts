import { NextRequest } from "next/server";

const createCompletion = jest.fn();
const authorizeCreditUsage = jest.fn();
const settleCreditUsage = jest.fn();
const releaseCreditUsageReservation = jest.fn();
const estimateTextMetrics = jest.fn();
const buildCreditReservationErrorPayload = jest.fn();
const seedWalletForPlan = jest.fn();
const consumeQuota = jest.fn();
const getPlanMediaLimits = jest.fn();
const getWalletStats = jest.fn();
const resolveIntlUserPlan = jest.fn();
const listModelCatalogEntries = jest.fn();

jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: (...args: unknown[]) => createCompletion(...args),
      },
    },
  })),
}));

jest.mock("@cloudbase/node-sdk", () => ({
  init: jest.fn(() => ({
    database: () => ({
      collection: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({
              get: jest.fn(async () => ({ data: [] })),
            }),
          }),
          limit: () => ({
            get: jest.fn(async () => ({ data: [] })),
          }),
        }),
      }),
    }),
  })),
}));

jest.mock("@/lib/auth-utils", () => ({
  extractTokenFromHeader: jest.fn(() => ({ token: "test-token", error: null })),
  verifyAuthToken: jest.fn(async () => ({
    success: true,
    userId: "route-test-user",
    user: {
      id: "route-test-user",
      email: "route@example.com",
      user_metadata: {},
    },
    region: "INTL",
  })),
}));

jest.mock("@/lib/config/region", () => ({
  isChinaRegion: jest.fn(() => false),
}));

jest.mock("@/lib/user-plan", () => ({
  resolveIntlUserPlan: (...args: unknown[]) => resolveIntlUserPlan(...args),
}));

jest.mock("@/services/wallet", () => ({
  seedWalletForPlan: (...args: unknown[]) => seedWalletForPlan(...args),
  consumeQuota: (...args: unknown[]) => consumeQuota(...args),
  getPlanMediaLimits: (...args: unknown[]) => getPlanMediaLimits(...args),
  getWalletStats: (...args: unknown[]) => getWalletStats(...args),
}));

jest.mock("@/lib/billing/engine", () => ({
  authorizeCreditUsage: (...args: unknown[]) => authorizeCreditUsage(...args),
  buildCreditReservationErrorPayload: (...args: unknown[]) =>
    buildCreditReservationErrorPayload(...args),
  estimateTextMetrics: (...args: unknown[]) => estimateTextMetrics(...args),
  releaseCreditUsageReservation: (...args: unknown[]) =>
    releaseCreditUsageReservation(...args),
  settleCreditUsage: (...args: unknown[]) => settleCreditUsage(...args),
}));

jest.mock("@/lib/billing/catalog", () => ({
  listModelCatalogEntries: (...args: unknown[]) => listModelCatalogEntries(...args),
}));

describe("multimodal preprocess route", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.NEXT_PUBLIC_DEPLOYMENT_REGION = "INTL";
    process.env.OPENROUTER_API = "test-openrouter-key";
    process.env.DASHSCOPE_API_KEY = "test-dashscope-key";
    process.env.VOLCENGINE_API_KEY = "test-volcengine-key";

    createCompletion.mockReset();
    authorizeCreditUsage.mockReset();
    settleCreditUsage.mockReset();
    releaseCreditUsageReservation.mockReset();
    estimateTextMetrics.mockReset();
    buildCreditReservationErrorPayload.mockReset();
    seedWalletForPlan.mockReset();
    consumeQuota.mockReset();
    getPlanMediaLimits.mockReset();
    getWalletStats.mockReset();
    resolveIntlUserPlan.mockReset();
    listModelCatalogEntries.mockReset();

    resolveIntlUserPlan.mockResolvedValue("free");
    seedWalletForPlan.mockResolvedValue(undefined);
    consumeQuota.mockResolvedValue({ success: true });
    getPlanMediaLimits.mockResolvedValue({
      imageLimit: 100,
      videoLimit: 10,
    });
    getWalletStats.mockResolvedValue({
      monthly: { image: 100, video: 10 },
      addon: { image: 0, video: 0 },
      total: { image: 100, video: 10 },
    });
    estimateTextMetrics.mockResolvedValue({
      input_tokens: 200,
      output_tokens: 400,
      request_count: 1,
    });
    authorizeCreditUsage.mockResolvedValue({
      success: true,
      requestId: "reservation-1",
      reservedCredits: 1,
      computation: { credits: 1 },
      wallet: {},
    });
    settleCreditUsage.mockResolvedValue({
      success: true,
      requestId: "reservation-1",
      chargedCredits: 1,
      releasedCredits: 0,
    });
    releaseCreditUsageReservation.mockResolvedValue({
      success: true,
      requestId: "reservation-1",
      releasedCredits: 1,
    });
    buildCreditReservationErrorPayload.mockReturnValue({
      error: "reservation failed",
    });

    const { isChinaRegion } = require("@/lib/config/region");
    isChinaRegion.mockReturnValue(false);
  });

  it("falls back to the next preprocess model and settles credits with the actual model used", async () => {
    listModelCatalogEntries.mockResolvedValue([
      {
        modelKey: "google/gemini-2.5-flash-lite",
        provider: "google",
        providerModel: "google/gemini-2.5-flash-lite",
        displayName: "Gemini 2.5 Flash Lite",
        region: "INTL",
        modality: "multimodal",
        billingMode: "metered",
        currency: "USD",
        inputPrice: 0.00001,
        outputPrice: 0.00004,
        pricingUnit: "per_1k_tokens",
        pricingRules: [],
        enabled: true,
        metadata: {
          inputModalities: ["text", "image", "audio"],
          outputModalities: ["text"],
        },
      },
      {
        modelKey: "openai/gpt-4o-mini",
        provider: "openai",
        providerModel: "openai/gpt-4o-mini",
        displayName: "GPT-4o mini",
        region: "INTL",
        modality: "multimodal",
        billingMode: "metered",
        currency: "USD",
        inputPrice: 0.00015,
        outputPrice: 0.0006,
        pricingUnit: "per_1k_tokens",
        pricingRules: [],
        enabled: true,
        metadata: {
          inputModalities: ["text", "image", "audio"],
          outputModalities: ["text"],
        },
      },
    ]);

    createCompletion
      .mockRejectedValueOnce({
        status: 403,
        message: "This model is not available in your region.",
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "这是一张社交媒体截图，主体是在转述 Anthropic 关于 Pete Hegseth 言论的声明。",
            },
          },
        ],
        usage: {
          prompt_tokens: 321,
          completion_tokens: 123,
          total_tokens: 444,
        },
      });

    const { POST } = require("@/app/api/chat/multimodal-preprocess/route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/chat/multimodal-preprocess", {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: "请总结截图内容。",
          attachments: [
            {
              id: "image-1",
              name: "screen.png",
              mimeType: "image/png",
              size: 1024,
              kind: "image",
              dataUrl: "data:image/png;base64,abc",
            },
          ],
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.summary).toContain("社交媒体截图");
    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(createCompletion.mock.calls[0][0].model).toBe("google/gemini-2.5-flash-lite");
    expect(createCompletion.mock.calls[1][0].model).toBe("openai/gpt-4o-mini");
    expect(authorizeCreditUsage.mock.calls[0][0].modelKey).toBe(
      "google/gemini-2.5-flash-lite",
    );
    expect(settleCreditUsage.mock.calls[0][0].modelKey).toBe("openai/gpt-4o-mini");
  });

  it("uses CN catalog candidates with provider fallback compatibility layers", async () => {
    const { isChinaRegion } = require("@/lib/config/region");
    isChinaRegion.mockReturnValue(true);
    process.env.NEXT_PUBLIC_DEPLOYMENT_REGION = "CN";

    listModelCatalogEntries.mockResolvedValue([
      {
        modelKey: "qwen3-omni-flash",
        provider: "dashscope",
        providerModel: "qwen3-omni-flash",
        displayName: "Qwen3 Omni Flash",
        region: "CN",
        modality: "multimodal",
        billingMode: "metered",
        currency: "CNY",
        inputPrice: 0.000008,
        outputPrice: 0.000008,
        pricingUnit: "per_1k_tokens",
        pricingRules: [],
        enabled: true,
        metadata: {
          requestModality: ["text", "image"],
          responseModality: ["text"],
        },
      },
      {
        modelKey: "doubao-seed-1.6-vision",
        provider: "volcengine",
        providerModel: "ep-vision-1",
        displayName: "Doubao Seed 1.6 Vision",
        region: "CN",
        modality: "multimodal",
        billingMode: "metered",
        currency: "CNY",
        inputPrice: 0.0004,
        outputPrice: 0.004,
        pricingUnit: "per_1k_tokens",
        pricingRules: [],
        enabled: true,
        metadata: {
          requestModality: ["text", "image"],
          responseModality: ["text"],
        },
      },
    ]);

    createCompletion
      .mockRejectedValueOnce({
        status: 503,
        message: "Model busy",
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "这是一个网页截图，主要内容是关于产品价格和公告信息。",
            },
          },
        ],
        usage: {
          prompt_tokens: 210,
          completion_tokens: 90,
          total_tokens: 300,
        },
      });

    const { POST } = require("@/app/api/chat/multimodal-preprocess/route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/chat/multimodal-preprocess", {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: "总结一下这张图。",
          attachments: [
            {
              id: "image-1",
              name: "screen.png",
              mimeType: "image/png",
              size: 1024,
              kind: "image",
              dataUrl: "data:image/png;base64,abc",
            },
          ],
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.summary).toContain("网页截图");
    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(createCompletion.mock.calls[0][0].model).toBe("qwen3-omni-flash");
    expect(createCompletion.mock.calls[1][0].model).toBe("ep-vision-1");
    expect(authorizeCreditUsage.mock.calls[0][0].modelKey).toBe("qwen3-omni-flash");
    expect(settleCreditUsage.mock.calls[0][0].modelKey).toBe("doubao-seed-1.6-vision");
  });
});
