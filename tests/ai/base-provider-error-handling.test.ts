const { BaseAIProvider } = require("@/lib/ai/providers/base-provider");

class TestProvider extends BaseAIProvider {
  name = "test";
  models = ["test-model"];
  defaultModel = "test-model";

  getModelInfo() {
    return null;
  }

  async chat() {
    throw new Error("not implemented");
  }

  async *chatStream() {
    throw new Error("not implemented");
  }

  countTokens() {
    return 0;
  }

  normalize(error: unknown) {
    return this.handleError(error);
  }
}

describe("BaseAIProvider.handleError", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_DEPLOYMENT_REGION: "CN",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("maps Volcengine ModelNotOpen to a friendly activation error", () => {
    const provider = new TestProvider();
    const rawError = Object.assign(
      new Error(
        "404 Your account has not activated the model doubao-seed-2-0-code-preview-260215. Please activate the model service in the Ark Console."
      ),
      {
        status: 404,
        code: "ModelNotOpen",
        error: {
          code: "ModelNotOpen",
          message:
            "Your account has not activated the model doubao-seed-2-0-code-preview-260215. Please activate the model service in the Ark Console.",
        },
      }
    );

    const normalized = provider.normalize(rawError);

    expect(normalized.code).toBe("model_not_activated");
    expect(normalized.statusCode).toBe(403);
    expect(normalized.message).toContain("尚未开通");
  });
});
