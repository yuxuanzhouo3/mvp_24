// lib/architecture-modules/__tests__/error-handler.test.ts - 错误处理测试
import {
  fetchWithTimeout,
  withRetry,
  FallbackHandler,
  classifyError,
  errorRecovery,
  ArchitectureError,
  ErrorType,
} from "../utils/error-handler";

describe("Error Handler Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetchWithTimeout", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should resolve successfully within timeout", async () => {
      const mockResponse = { ok: true, data: "success" };
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const result = await fetchWithTimeout("http://example.com", {}, 5000);

      expect(result).toBe(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "http://example.com",
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it("should reject on timeout", async () => {
      // Mock fetch to throw AbortError (simulating timeout)
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      global.fetch = jest.fn().mockRejectedValue(abortError);

      const promise = fetchWithTimeout("http://example.com", {}, 100);

      await expect(promise).rejects.toThrow(ArchitectureError);
      await expect(promise).rejects.toMatchObject({
        type: ErrorType.TIMEOUT_ERROR,
        retryable: true,
      });
    }, 1000);
  });

  describe("withRetry", () => {
    it("should resolve on first attempt", async () => {
      const operation = jest.fn().mockResolvedValue("success");

      const result = await withRetry(operation, 3, 100);

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should retry on failure and succeed", async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error("fail1"))
        .mockRejectedValueOnce(new Error("fail2"))
        .mockResolvedValueOnce("success");

      const result = await withRetry(operation, 3, 100);

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it("should fail after max retries", async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(new Error("persistent failure"));

      await expect(withRetry(operation, 2, 100)).rejects.toThrow(
        "persistent failure"
      );
      expect(operation).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it("should not retry non-retryable errors", async () => {
      const error = new ArchitectureError(
        "fatal error",
        ErrorType.CONFIG_ERROR,
        "FATAL",
        false
      );
      const operation = jest.fn().mockRejectedValue(error);

      await expect(withRetry(operation, 3, 100)).rejects.toThrow(error);
      expect(operation).toHaveBeenCalledTimes(1); // No retries
    });
  });

  describe("FallbackHandler", () => {
    it("should use first successful fallback", async () => {
      const handler = new FallbackHandler();

      const fallback1 = jest.fn().mockRejectedValue(new Error("fail1"));
      const fallback2 = jest.fn().mockResolvedValue("success2");
      const fallback3 = jest.fn().mockResolvedValue("success3");

      handler.addFallback(fallback1);
      handler.addFallback(fallback2);
      handler.addFallback(fallback3);

      const result = await handler.executeWithFallbacks();

      expect(result).toBe("success2");
      expect(fallback1).toHaveBeenCalledTimes(1);
      expect(fallback2).toHaveBeenCalledTimes(1);
      expect(fallback3).not.toHaveBeenCalled();
    });

    it("should fail if all fallbacks fail", async () => {
      const handler = new FallbackHandler();

      const fallback1 = jest.fn().mockRejectedValue(new Error("fail1"));
      const fallback2 = jest.fn().mockRejectedValue(new Error("fail2"));

      handler.addFallback(fallback1);
      handler.addFallback(fallback2);

      await expect(handler.executeWithFallbacks()).rejects.toThrow("fail2");
      expect(fallback1).toHaveBeenCalledTimes(1);
      expect(fallback2).toHaveBeenCalledTimes(1);
    });
  });

  describe("classifyError", () => {
    it("should return ArchitectureError as-is", () => {
      const originalError = new ArchitectureError(
        "test",
        ErrorType.API_ERROR,
        "TEST"
      );
      const result = classifyError(originalError);

      expect(result).toBe(originalError);
    });

    it("should classify network errors", () => {
      const networkError = new TypeError("Failed to fetch");
      const result = classifyError(networkError);

      expect(result).toBeInstanceOf(ArchitectureError);
      expect(result.type).toBe(ErrorType.NETWORK_ERROR);
      expect(result.retryable).toBe(true);
    });

    it("should classify timeout errors", () => {
      const timeoutError = new Error("TimeoutError");
      const result = classifyError(timeoutError);

      expect(result).toBeInstanceOf(ArchitectureError);
      expect(result.type).toBe(ErrorType.TIMEOUT_ERROR);
      expect(result.retryable).toBe(true);
    });

    it("should classify unknown errors", () => {
      const unknownError = new Error("Something went wrong");
      const result = classifyError(unknownError);

      expect(result).toBeInstanceOf(ArchitectureError);
      expect(result.type).toBe(ErrorType.UNKNOWN_ERROR);
      expect(result.retryable).toBe(false);
    });
  });

  describe("ErrorRecovery", () => {
    it("should track error counts", () => {
      const error = new Error("test error");

      errorRecovery.recordError("test-service", error);
      errorRecovery.recordError("test-service", error);

      const health = errorRecovery.getServiceHealth("test-service");
      expect(health.errorCount).toBe(2);
      expect(health.healthy).toBe(true); // Still healthy (under threshold)
    });

    it("should mark service as degraded", () => {
      const error = new Error("test error");

      // Record 6 errors (above threshold of 5)
      for (let i = 0; i < 6; i++) {
        errorRecovery.recordError("degraded-service", error);
      }

      const health = errorRecovery.getServiceHealth("degraded-service");
      expect(health.errorCount).toBe(6);
      expect(health.healthy).toBe(false);
    });

    it("should reset error count after time window", () => {
      const error = new Error("test error");

      // Mock Date.now to control time
      const originalDateNow = Date.now;
      let mockTime = 1000000000;

      global.Date.now = jest.fn(() => mockTime);

      errorRecovery.recordError("time-service", error);

      // Advance time past reset window (5 minutes = 300000 ms)
      mockTime += 300001;

      errorRecovery.recordError("time-service", error);

      const health = errorRecovery.getServiceHealth("time-service");
      expect(health.errorCount).toBe(1); // Should be reset

      global.Date.now = originalDateNow;
    });
  });
});
