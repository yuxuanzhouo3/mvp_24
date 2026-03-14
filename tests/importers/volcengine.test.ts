const { fetchVolcengineBillingImportItems } = require("@/lib/importers/volcengine");

describe("volcengine curated import items", () => {
  it("returns only the curated Doubao Seed 2.0 models with million-token pricing", async () => {
    const result = await fetchVolcengineBillingImportItems();

    expect(result.items.map((item: any) => item.modelKey)).toEqual([
      "doubao-seed-2-0-pro-260215",
      "doubao-seed-2-0-lite-260215",
      "doubao-seed-2-0-mini-260215",
      "doubao-seed-2-0-code-preview-260215",
    ]);

    for (const item of result.items) {
      expect(item.provider).toBe("volcengine");
      expect(item.pricingUnit).toBe("per_1m_tokens");

      const inputRule = item.pricingRules.find((rule: any) => rule.metricKey === "input_tokens");
      const outputRule = item.pricingRules.find((rule: any) => rule.metricKey === "output_tokens");

      expect(inputRule?.unitSize).toBe(1_000_000);
      expect(outputRule?.unitSize).toBe(1_000_000);
    }

    const mini = result.items.find((item: any) => item.modelKey === "doubao-seed-2-0-mini-260215");
    expect(mini?.modality).toBe("multimodal");
    expect(mini?.metadata?.releaseDate).toBe("2026-02-15T00:00:00.000Z");

    const pro = result.items.find((item: any) => item.modelKey === "doubao-seed-2-0-pro-260215");
    const cacheRule = pro?.pricingRules.find(
      (rule: any) => rule.metricKey === "input_tokens_cache_read"
    );
    expect(cacheRule?.unitSize).toBe(1_000_000);
    expect(cacheRule?.price).toBe(0.64);
    expect(pro?.metadata?.releaseDate).toBe("2026-02-15T00:00:00.000Z");
  });
});
