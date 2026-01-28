// lib/architecture-modules/__tests__/geo-router.test.ts
import { geoRouter } from "../core/geo-router";
import { RegionType } from "../core/types";
import { ArchitectureError, ErrorType } from "../utils/error-handler";

// Mock fetch
global.fetch = jest.fn();

describe("GeoRouter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    geoRouter.clearCache();
  });

  describe("正常检测场景", () => {
    it("should detect China IP correctly", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "success", countryCode: "CN" }),
      });

      const result = await geoRouter.detect("1.1.1.1");

      expect(result.region).toBe(RegionType.CHINA);
      expect(result.currency).toBe("CNY");
      expect(result.paymentMethods).toEqual(["wechat", "alipay"]);
      expect(result.database).toBe("cloudbase");
    });

    it("should detect US IP correctly", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "success", countryCode: "US" }),
      });

      const result = await geoRouter.detect("8.8.8.8");

      expect(result.region).toBe(RegionType.USA);
      expect(result.currency).toBe("USD");
      expect(result.paymentMethods).toEqual(["stripe", "paypal"]);
      expect(result.database).toBe("supabase");
    });

    it("should detect European IP correctly", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "success", countryCode: "DE" }),
      });

      const result = await geoRouter.detect("192.168.1.1");

      expect(result.region).toBe(RegionType.EUROPE);
      expect(result.currency).toBe("EUR");
      expect(result.paymentMethods).toEqual([]); // 欧洲地区GDPR合规，禁用支付
      expect(result.authMethods).toEqual(["email"]); // 欧洲地区只允许邮箱认证
      expect(result.database).toBe("supabase");
      expect(result.gdprCompliant).toBe(true);
    });
  });

  describe("缓存功能", () => {
    it("should cache results", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "success", countryCode: "CN" }),
      });

      // First call
      await geoRouter.detect("1.1.1.1");
      // Second call should use cache
      await geoRouter.detect("1.1.1.1");

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("should respect cache TTL", async () => {
      // Mock Date.now to control time
      const originalDateNow = Date.now;
      let mockTime = 1000000000;

      global.Date.now = jest.fn(() => mockTime);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: "success", countryCode: "CN" }),
      });

      // First call
      await geoRouter.detect("1.1.1.1");

      // Advance time past TTL (1 hour = 3600000 ms)
      mockTime += 3600001;

      // Second call should not use cache
      await geoRouter.detect("1.1.1.1");

      expect(global.fetch).toHaveBeenCalledTimes(2);

      // Restore original Date.now
      global.Date.now = originalDateNow;
    });
  });

  describe("错误处理和降级", () => {
    it("should handle API failure gracefully", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "fail", message: "Invalid IP" }),
      });

      const result = await geoRouter.detect("invalid-ip");

      // Should return default overseas config
      expect(result.region).toBe(RegionType.USA);
      expect(result.database).toBe("supabase");
    });

    it("should handle network errors with retry", async () => {
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new TypeError("fetch failed")) // First attempt fails (network error, retryable)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: "success", countryCode: "US" }),
        }); // Second attempt succeeds

      const result = await geoRouter.detect("8.8.8.8");

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.region).toBe(RegionType.USA);
    });

    it("should handle timeout errors", async () => {
      // Mock fetch to immediately throw AbortError (simulating timeout)
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      (global.fetch as jest.Mock).mockRejectedValue(abortError);

      const result = await geoRouter.detect("timeout-ip");

      // Should fallback to default
      expect(result.region).toBe(RegionType.USA);
    }, 5000);

    it("should fallback to secondary service on primary failure", async () => {
      // Primary service fails with AbortError (simulating timeout)
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";

      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(abortError) // Primary fails
        .mockResolvedValueOnce({
          // Secondary succeeds
          ok: true,
          text: () => Promise.resolve("US"),
        });

      const result = await geoRouter.detect("fallback-test");

      // Verify that fallback worked and returned correct result
      expect(result.region).toBe(RegionType.USA);
      expect(result.countryCode).toBe("US");
    }, 5000);

    it("should use local detection as final fallback", async () => {
      // Both services fail
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Service down"));

      const result = await geoRouter.detect("192.168.1.1"); // Private IP

      // Should use local detection (defaults to China for private IPs)
      expect(result.region).toBe(RegionType.CHINA);
    });

    it("should handle invalid JSON response", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error("Invalid JSON")),
      });

      const result = await geoRouter.detect("invalid-json");

      // Should fallback gracefully
      expect(result.region).toBe(RegionType.USA);
    });

    it("should handle missing countryCode in response", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "success" }), // Missing countryCode
      });

      const result = await geoRouter.detect("missing-country");

      // Should fallback gracefully
      expect(result.region).toBe(RegionType.USA);
    });
  });

  describe("私有IP检测", () => {
    it("should detect private IPs correctly", async () => {
      // Mock all services to fail, forcing local detection
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Service down"));

      const result = await geoRouter.detect("192.168.1.1");

      // Private IP should default to China
      expect(result.region).toBe(RegionType.CHINA);
    });

    it("should handle public IPs with service failures", async () => {
      // Mock all services to fail
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Service down"));

      const result = await geoRouter.detect("8.8.8.8"); // Public IP

      // Public IP should default to USA when services fail
      expect(result.region).toBe(RegionType.USA);
    });
  });
});
