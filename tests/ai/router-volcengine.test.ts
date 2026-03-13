describe("AIRouter volcengine registration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_DEPLOYMENT_REGION: "CN",
      VOLCENGINE_API_KEY: "test-volcengine-key",
    };
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.OPENROUTER_API;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("routes curated Doubao models to the volcengine provider", async () => {
    const { aiRouter } = require("@/lib/ai/router");

    const provider = await aiRouter.getProviderForModel("doubao-seed-2-0-lite-260215");

    expect(provider.name).toBe("volcengine");
    expect(provider.models).toContain("doubao-seed-2-0-lite-260215");
  });
});
