import {
  normalizeReleaseDate,
  resolveModelReleaseDate,
} from "@/lib/model-release-date";

describe("model release date helpers", () => {
  it("normalizes explicit ISO-like dates", () => {
    expect(normalizeReleaseDate("2026-03-14")).toBe("2026-03-14T00:00:00.000Z");
    expect(normalizeReleaseDate("20260314")).toBe("2026-03-14T00:00:00.000Z");
  });

  it("extracts compact YYMMDD tags", () => {
    expect(normalizeReleaseDate("260215")).toBe("2026-02-15T00:00:00.000Z");
    expect(normalizeReleaseDate("preview-260215")).toBe("2026-02-15T00:00:00.000Z");
  });

  it("resolves release date by priority", () => {
    expect(
      resolveModelReleaseDate({
        modelKey: "qwen3-max-2026-01-23",
        versionTag: "2025-12-01",
      })
    ).toBe("2025-12-01T00:00:00.000Z");
  });
});
