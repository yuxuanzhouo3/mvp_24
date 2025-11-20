// lib/architecture-modules/__tests__/integration.test.ts - 集成测试
import { geoRouter } from "../core/geo-router";
import { createEnvironmentLoader } from "../config/env-loader";
import { createDatabaseConnector } from "../layers/data-storage/adapter";
import { paymentRouter } from "../layers/third-party/payment/router";
import { RegionType } from "../core/types";
import { errorRecovery } from "../utils/error-handler";

// Mock fetch globally
global.fetch = jest.fn();

describe("Architecture Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    geoRouter.clearCache();
  });

  describe("完整地理检测到配置加载流程", () => {
    it("should complete full flow for China region", async () => {
      // Mock IP detection
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "success", countryCode: "CN" }),
      });

      // Mock environment variables
      process.env.APP_URL = "https://test-app.com";
      process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID = "test-cloudbase-id";

      const ip = "1.1.1.1";

      // 1. 地理检测
      const geoResult = await geoRouter.detect(ip);
      expect(geoResult.region).toBe(RegionType.CHINA);
      expect(geoResult.database).toBe("cloudbase");

      // 2. 环境配置加载
      const envLoader = await createEnvironmentLoader(ip);
      const config = envLoader.load();
      expect(config.WECHAT_CLOUDBASE_ID).toBe("test-cloudbase-id");

      // 3. 数据库连接器创建
      const dbConnector = createDatabaseConnector(geoResult.database, {
        type: geoResult.database,
        envId: config.WECHAT_CLOUDBASE_ID,
      });
      expect(dbConnector).toBeDefined();

      // 清理环境变量
      delete process.env.APP_URL;
      delete process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID;
    });

    it("should complete full flow for US region", async () => {
      // Mock IP detection
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "success", countryCode: "US" }),
      });

      // Mock environment variables
      process.env.APP_URL = "https://test-app.com";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

      const ip = "8.8.8.8";

      // 1. 地理检测
      const geoResult = await geoRouter.detect(ip);
      expect(geoResult.region).toBe(RegionType.USA);
      expect(geoResult.database).toBe("supabase");

      // 2. 环境配置加载
      const envLoader = await createEnvironmentLoader(ip);
      const config = envLoader.load();
      expect(config.SUPABASE_URL).toBe("https://test.supabase.co");
      expect(config.SUPABASE_ANON_KEY).toBe("test-anon-key");

      // 3. 数据库连接器创建
      const dbConnector = createDatabaseConnector(geoResult.database, {
        type: geoResult.database,
        connectionString: config.SUPABASE_URL,
      });
      expect(dbConnector).toBeDefined();

      // 清理环境变量
      delete process.env.APP_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    });

    it("should handle Europe region with GDPR compliance", async () => {
      // Mock IP detection
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "success", countryCode: "DE" }),
      });

      const ip = "192.168.1.1";

      // 1. 地理检测
      const geoResult = await geoRouter.detect(ip);
      expect(geoResult.region).toBe(RegionType.EUROPE);
      expect(geoResult.gdprCompliant).toBe(true);
      expect(geoResult.paymentMethods).toEqual([]); // GDPR: no payments
      expect(geoResult.authMethods).toEqual(["email"]); // GDPR: email only

      // 2. 支付路由器应该拒绝欧洲地区的支付
      const paymentMethods = paymentRouter.getAvailableMethods(
        geoResult.region
      );
      expect(paymentMethods).toEqual([]);
    });
  });

  describe("错误恢复和降级处理", () => {
    it("should recover from service failures", async () => {
      // Mock primary service failure
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error("Primary service down"))
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve("US"),
        });

      const ip = "8.8.8.8";
      const result = await geoRouter.detect(ip);

      // Should still get a result via fallback
      expect(result.region).toBe(RegionType.USA);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("should track service health", async () => {
      // Mock multiple failures
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Service down"));

      // Make multiple calls to trigger error tracking
      for (let i = 0; i < 6; i++) {
        const result = await geoRouter.detect(`8.8.8.${i}`); // Public IPs
        // Should return default result on failure
        expect(result.region).toBe(RegionType.USA);
      }

      // Check if service is marked as degraded
      const health = errorRecovery.getServiceHealth("geo-detection");
      expect(health.errorCount).toBeGreaterThan(5);
      expect(health.healthy).toBe(false);
    });

    it("should handle configuration errors gracefully", async () => {
      // Mock successful IP detection
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "success", countryCode: "CN" }),
      });

      // No environment variables set - should throw due to missing APP_URL
      const envLoader = await createEnvironmentLoader("1.1.1.1");

      expect(() => envLoader.load()).toThrow();
      // But the error should be descriptive about APP_URL requirement
      try {
        envLoader.load();
      } catch (error) {
        expect((error as Error).message).toContain("APP_URL is required");
      }
    });

    it("should automatically detect Vercel URL", async () => {
      // Mock successful IP detection
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "success", countryCode: "US" }),
      });

      // Set Vercel environment variables
      process.env.VERCEL_URL = "my-app.vercel.app";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

      const envLoader = await createEnvironmentLoader("8.8.8.8");
      const config = envLoader.load();

      // Should automatically use Vercel URL
      expect(config.APP_URL).toBe("https://my-app.vercel.app");

      // Clean up
      delete process.env.VERCEL_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    });

    it("should use localhost in development", async () => {
      // Mock successful IP detection
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "success", countryCode: "US" }),
      });

      // Set development environment
      (process.env as any).NODE_ENV = "development";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

      const envLoader = await createEnvironmentLoader("8.8.8.8");
      const config = envLoader.load();

      // Should use localhost in development
      expect(config.APP_URL).toBe("http://localhost:3000");

      // Clean up
      delete (process.env as any).NODE_ENV;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    });
  });

  describe("缓存一致性", () => {
    it("should maintain cache across different operations", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: "success", countryCode: "CN" }),
      });

      const ip = "1.1.1.1";

      // First detection
      await geoRouter.detect(ip);

      // Second detection should use cache
      await geoRouter.detect(ip);

      // Environment loader should also use cached geo result
      const envLoader = await createEnvironmentLoader(ip);

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("并发处理", () => {
    it("should handle concurrent requests correctly", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: "success", countryCode: "US" }),
      });

      const ip = "8.8.8.8";
      const promises = Array(5)
        .fill(null)
        .map(() => geoRouter.detect(ip));

      const results = await Promise.all(promises);

      // All results should be the same
      results.forEach((result) => {
        expect(result.region).toBe(RegionType.USA);
      });

      // But fetch should only be called once due to caching
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("边界情况", () => {
    it("should handle invalid IP addresses", async () => {
      // Mock all services to fail
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Invalid IP"));

      const result = await geoRouter.detect("invalid-ip-address");

      // Should fallback to default
      expect(result.region).toBe(RegionType.USA);
    });

    it("should handle empty responses", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await geoRouter.detect("empty-response");

      // Should fallback gracefully
      expect(result.region).toBe(RegionType.USA);
    });

    it("should handle malformed JSON", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error("Malformed JSON")),
      });

      const result = await geoRouter.detect("malformed-json");

      // Should fallback gracefully
      expect(result.region).toBe(RegionType.USA);
    });
  });
});
