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
});
