import { checkHealth } from "../lib/health";

describe("health check", () => {
  it("returns ok and uptime", () => {
    const res = checkHealth();
    expect(res).toBeDefined();
    // @ts-ignore
    expect(res.status).toBe("ok");
    // @ts-ignore
    expect(typeof res.uptime).toBe("number");
    // @ts-ignore
    expect(typeof res.version).toBe("string");
  });
});
