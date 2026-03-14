jest.mock("@/lib/cloudbase-service", () => ({
  getDatabase: jest.fn(),
}));

jest.mock("@/lib/config/region", () => ({
  isChinaRegion: jest.fn(() => false),
}));

jest.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {},
}));

jest.mock("@/lib/admin/cache", () => ({
  getCachedData: jest.fn(),
  setCachedData: jest.fn(),
}));

const catalogModule = require("@/lib/billing/catalog");

const { buildCatalogEntry, normalizePricingRules } = catalogModule;

describe("billing catalog pricing normalization", () => {
  it("forces token-based rules to use proportional rounding", () => {
    const rules = normalizePricingRules([
      { metricKey: "input_tokens", unitSize: 1000, price: 0.0004, rounding: "ceil" },
      { metricKey: "output_tokens", unitSize: 1000, price: 0.001 },
      { metricKey: "request_count", unitSize: 1, price: 2, rounding: "ceil" },
    ]);

    expect(rules).toEqual([
      { metricKey: "input_tokens", unitSize: 1000, price: 0.0004, rounding: "none", label: undefined },
      { metricKey: "output_tokens", unitSize: 1000, price: 0.001, rounding: "none", label: undefined },
      { metricKey: "request_count", unitSize: 1, price: 2, rounding: "ceil", label: undefined },
    ]);
  });

  it("rebuilds canonical input/output token rules from model prices", () => {
    const entry = buildCatalogEntry(
      {
        model_key: "x-ai/grok-4.1-fast",
        provider: "openrouter",
        provider_model: "x-ai/grok-4.1-fast",
        display_name: "xAI: Grok 4.1 Fast",
        region: "INTL",
        modality: "text",
        currency: "USD",
        input_price: 0.0004,
        output_price: 0.001,
        pricing_rules: [
          { metricKey: "input_tokens", unitSize: 1000, price: 0.0004, rounding: "ceil" },
          { metricKey: "output_tokens", unitSize: 1000, price: 0.001, rounding: "ceil" },
          { metricKey: "request_count", unitSize: 1, price: 5, rounding: "ceil" },
        ],
      },
      {
        modelKey: "x-ai/grok-4.1-fast",
        provider: "openrouter",
        providerModel: "x-ai/grok-4.1-fast",
        displayName: "xAI: Grok 4.1 Fast",
        region: "INTL",
        modality: "text",
        billingMode: "metered",
        currency: "USD",
        inputPrice: 0.0004,
        outputPrice: 0.001,
        pricingUnit: "per_1k_tokens",
        pricingRules: [],
        enabled: true,
        metadata: {},
      }
    );

    expect(entry.pricingRules).toEqual([
      { metricKey: "request_count", unitSize: 1, price: 5, rounding: "ceil", label: undefined },
      { metricKey: "input_tokens", unitSize: 1000, price: 0.0004, rounding: "none" },
      { metricKey: "output_tokens", unitSize: 1000, price: 0.001, rounding: "none" },
    ]);
  });

  it("preserves million-token pricing when the source unit is per_1m_tokens", () => {
    const entry = buildCatalogEntry(
      {
        model_key: "qwen-plus-2025-12-01",
        provider: "dashscope",
        provider_model: "qwen-plus-2025-12-01",
        display_name: "Qwen Plus",
        region: "CN",
        modality: "text",
        currency: "CNY",
        input_price: 0.5,
        output_price: 2,
        pricing_unit: "per_1m_tokens",
        pricing_rules: [],
      },
      {
        modelKey: "qwen-plus-2025-12-01",
        provider: "dashscope",
        providerModel: "qwen-plus-2025-12-01",
        displayName: "Qwen Plus",
        region: "CN",
        modality: "text",
        billingMode: "metered",
        currency: "CNY",
        inputPrice: 0.5,
        outputPrice: 2,
        pricingUnit: "per_1k_tokens",
        pricingRules: [],
        enabled: true,
        metadata: {},
      }
    );

    expect(entry.pricingUnit).toBe("per_1m_tokens");
    expect(entry.pricingRules).toEqual([
      { metricKey: "input_tokens", unitSize: 1_000_000, price: 0.5, rounding: "none" },
      { metricKey: "output_tokens", unitSize: 1_000_000, price: 2, rounding: "none" },
    ]);
  });

  it("normalizes release dates from importer metadata", () => {
    const entry = buildCatalogEntry(
      {
        model_key: "doubao-seed-2-0-lite-260215",
        provider: "volcengine",
        provider_model: "doubao-seed-2-0-lite-260215",
        display_name: "Doubao-Seed-2.0-lite",
        region: "CN",
        modality: "text",
        currency: "CNY",
        input_price: 0.6,
        output_price: 3.6,
        pricing_unit: "per_1m_tokens",
        pricing_rules: [],
        metadata: {
          source: "volcengine-curated",
          releaseTag: "260215",
        },
      },
      {
        modelKey: "doubao-seed-2-0-lite-260215",
        provider: "volcengine",
        providerModel: "doubao-seed-2-0-lite-260215",
        displayName: "Doubao-Seed-2.0-lite",
        region: "CN",
        modality: "text",
        billingMode: "metered",
        currency: "CNY",
        inputPrice: 0.6,
        outputPrice: 3.6,
        pricingUnit: "per_1m_tokens",
        pricingRules: [],
        enabled: true,
        metadata: {},
      }
    );

    expect(entry.releaseDate).toBe("2026-02-15T00:00:00.000Z");
    expect(entry.metadata?.releaseDate).toBe("2026-02-15T00:00:00.000Z");
  });

  it("repairs legacy Bailian rows using source price metadata", () => {
    const entry = buildCatalogEntry(
      {
        model_key: "qwen-plus-2025-12-01",
        provider: "dashscope",
        provider_model: "qwen-plus-2025-12-01",
        display_name: "Qwen Plus",
        region: "CN",
        modality: "text",
        currency: "CNY",
        input_price: 0.5,
        output_price: 2,
        pricing_unit: "per_unit",
        pricing_rules: [
          { metricKey: "input_tokens", unitSize: 1000, price: 0.5, rounding: "none" },
          { metricKey: "output_tokens", unitSize: 1000, price: 2, rounding: "none" },
        ],
        metadata: {
          source: "bailian-console",
          priceRows: [
            {
              priceUnit: "元/百万tokens",
              prices: [
                { type: "input_token", price: "0.5", priceUnit: "元/百万tokens" },
                { type: "output_token", price: "2", priceUnit: "元/百万tokens" },
              ],
            },
          ],
        },
      },
      {
        modelKey: "qwen-plus-2025-12-01",
        provider: "dashscope",
        providerModel: "qwen-plus-2025-12-01",
        displayName: "Qwen Plus",
        region: "CN",
        modality: "text",
        billingMode: "metered",
        currency: "CNY",
        inputPrice: 0.5,
        outputPrice: 2,
        pricingUnit: "per_1k_tokens",
        pricingRules: [],
        enabled: true,
        metadata: {},
      }
    );

    expect(entry.pricingUnit).toBe("per_1m_tokens");
    expect(entry.pricingRules).toEqual([
      { metricKey: "input_tokens", unitSize: 1_000_000, price: 0.5, rounding: "none" },
      { metricKey: "output_tokens", unitSize: 1_000_000, price: 2, rounding: "none" },
    ]);
  });
});
