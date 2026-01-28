import { checkHealth } from "../../lib/health";

describe("Health API Integration", () => {
  it("should return health status via checkHealth function", () => {
    const result = checkHealth();

    expect(result).toHaveProperty("status", "ok");
    expect(result).toHaveProperty("uptime");
    expect(typeof result.uptime).toBe("number");
    expect(result).toHaveProperty("time");
    expect(result).toHaveProperty("version");
  });
});
