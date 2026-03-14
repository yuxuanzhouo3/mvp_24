import {
  resolveSmartModel,
  resolveSmartModelPlan,
  SMART_MODEL_ID,
} from "@/lib/ai/smart-model-router";

describe("smart-model-router", () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-14T00:00:00.000Z"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const isoDaysAgo = (days: number) =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const isoMonthsAgo = (months: number) => {
    const value = new Date(Date.now());
    value.setUTCMonth(value.getUTCMonth() - months);
    return value.toISOString();
  };

  const buildCandidates = () => [
    {
      model: "cheap-old",
      releaseDate: isoMonthsAgo(14),
      unitPrice: 0.001,
    },
    {
      model: "balanced-mid",
      releaseDate: isoMonthsAgo(5),
      unitPrice: 0.01,
    },
    {
      model: "premium-new",
      releaseDate: isoDaysAgo(4),
      unitPrice: 0.05,
    },
    {
      model: "new-low",
      releaseDate: isoMonthsAgo(2),
      unitPrice: 0.003,
    },
  ];

  it("keeps explicit models unchanged", () => {
    const candidates = buildCandidates();
    expect(
      resolveSmartModel({
        requestedModel: "balanced-mid",
        availableEntries: candidates,
      })
    ).toEqual({
      model: "balanced-mid",
      routedFromSmart: false,
      reason: "explicit_model",
    });
  });

  it("falls back when an explicit model is outside the allowed chat pool", () => {
    const candidates = buildCandidates();
    expect(
      resolveSmartModel({
        requestedModel: "qwen-vl-ocr",
        availableEntries: candidates,
        fallbackModel: "balanced-mid",
      })
    ).toEqual({
      model: "balanced-mid",
      routedFromSmart: false,
      reason: "explicit_model_unavailable_fallback",
    });
  });

  it("prefers the newest models even for free users", () => {
    jest.spyOn(Math, "random").mockReturnValue(0);
    const candidates = buildCandidates();
    const result = resolveSmartModel({
      requestedModel: SMART_MODEL_ID,
      collaborationMode: "normal",
      availableEntries: candidates,
      userPlan: "free",
    });

    expect(result.model).toBe("premium-new");
    expect(result.routedFromSmart).toBe(true);
  });

  it("prefers newer models for paid users", () => {
    jest.spyOn(Math, "random").mockReturnValue(0);
    const paidCandidates = [
      {
        model: "cheap-old",
        releaseDate: isoMonthsAgo(14),
        unitPrice: 0.001,
      },
      {
        model: "balanced-mid",
        releaseDate: isoMonthsAgo(5),
        unitPrice: 0.01,
      },
      {
        model: "premium-new",
        releaseDate: isoDaysAgo(4),
        unitPrice: 0.03,
      },
      {
        model: "ultra-expensive",
        releaseDate: isoMonthsAgo(4),
        unitPrice: 0.08,
      },
    ];
    const result = resolveSmartModel({
      requestedModel: SMART_MODEL_ID,
      collaborationMode: "normal",
      availableEntries: paidCandidates,
      userPlan: "pro",
    });

    expect(result.model).toBe("premium-new");
    expect(result.routedFromSmart).toBe(true);
  });

  it("samples only within the top 5 ranked models for single-model auto mode", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.999999);
    const candidates = Array.from({ length: 12 }, (_, index) => ({
      model: `rank-${index + 1}`,
      releaseDate: isoDaysAgo(index + 1),
      unitPrice: 0.005 + index * 0.001,
    }));

    const result = resolveSmartModel({
      requestedModel: SMART_MODEL_ID,
      collaborationMode: "normal",
      availableEntries: candidates,
      userPlan: "free",
    });

    expect(result.model).toBe("rank-5");
    expect(result.model).not.toBe("rank-6");
    expect(result.model).not.toBe("rank-12");
  });

  it("keeps newer models ahead of cheaper older models", () => {
    const result = resolveSmartModelPlan({
      requestedModel: SMART_MODEL_ID,
      collaborationMode: "parallel",
      availableEntries: [
        {
          model: "older-cheap",
          releaseDate: isoMonthsAgo(6),
          unitPrice: 0.0001,
        },
        {
          model: "newer-expensive",
          releaseDate: isoDaysAgo(10),
          unitPrice: 0.08,
        },
        {
          model: "mid",
          releaseDate: isoMonthsAgo(2),
          unitPrice: 0.01,
        },
      ],
      userPlan: "free",
    });

    expect(result.models).toEqual(["newer-expensive", "mid"]);
    expect(result.models).not.toContain("older-cheap");
  });

  it("filters out models older than 3 months from smart auto candidates", () => {
    const result = resolveSmartModelPlan({
      requestedModel: SMART_MODEL_ID,
      collaborationMode: "parallel",
      availableEntries: [
        {
          model: "fresh-a",
          releaseDate: isoDaysAgo(5),
          unitPrice: 0.02,
        },
        {
          model: "fresh-b",
          releaseDate: isoMonthsAgo(2),
          unitPrice: 0.01,
        },
        {
          model: "stale-c",
          releaseDate: isoMonthsAgo(4),
          unitPrice: 0.0001,
        },
      ],
      userPlan: "free",
    });

    expect(result.models).toEqual(["fresh-a", "fresh-b"]);
    expect(result.models).not.toContain("stale-c");
  });

  it("still uses price as a tie-breaker when release dates are equally recent", () => {
    const sameReleaseDate = isoDaysAgo(14);
    const result = resolveSmartModelPlan({
      requestedModel: SMART_MODEL_ID,
      collaborationMode: "parallel",
      availableEntries: [
        {
          model: "same-date-expensive",
          releaseDate: sameReleaseDate,
          unitPrice: 0.08,
        },
        {
          model: "same-date-cheap",
          releaseDate: sameReleaseDate,
          unitPrice: 0.005,
        },
        {
          model: "same-date-mid",
          releaseDate: sameReleaseDate,
          unitPrice: 0.02,
        },
      ],
      userPlan: "free",
    });

    expect(result.models).toEqual([
      "same-date-cheap",
      "same-date-mid",
      "same-date-expensive",
    ]);
  });

  it("selects top 3 models in parallel mode", () => {
    const candidates = buildCandidates();
    const result = resolveSmartModelPlan({
      requestedModel: SMART_MODEL_ID,
      collaborationMode: "parallel",
      availableEntries: candidates,
      userPlan: "pro",
    });

    expect(result.models).toEqual(["premium-new", "new-low"]);
  });

  it("selects cheap, mid, best for sequential mode", () => {
    const candidates = buildCandidates();
    const result = resolveSmartModelPlan({
      requestedModel: SMART_MODEL_ID,
      collaborationMode: "sequential",
      availableEntries: candidates,
      userPlan: "free",
    });

    expect(result.models).toEqual(["new-low", "premium-new"]);
  });
});
