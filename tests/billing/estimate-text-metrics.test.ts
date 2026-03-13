jest.mock("@/lib/ai/router", () => ({
  aiRouter: {
    getProviderForModel: jest.fn(async () => {
      throw new Error("provider unavailable in test");
    }),
  },
}));

const engineModule = require("@/lib/billing/engine");

const { estimateTextMetrics } = engineModule.default || engineModule;

describe("estimateTextMetrics", () => {
  it("uses a conservative reservation budget instead of the full model max", async () => {
    const metrics = await estimateTextMetrics({
      messages: [{ role: "user", content: "你好啊" }],
      modelKey: "unknown-model-for-test",
      maxTokens: 16000,
    });

    expect(metrics).toEqual({
      input_tokens: 1,
      output_tokens: 512,
      request_count: 1,
    });
  });

  it("still respects smaller caller maxTokens", async () => {
    const metrics = await estimateTextMetrics({
      messages: [{ role: "user", content: "hello" }],
      modelKey: "unknown-model-for-test",
      maxTokens: 256,
    });

    expect(metrics.output_tokens).toBe(256);
  });
});
