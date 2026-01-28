// lib/architecture-modules/utils/error-handler.ts - 错误处理工具
export enum ErrorType {
  NETWORK_ERROR = "NETWORK_ERROR",
  API_ERROR = "API_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  CONFIG_ERROR = "CONFIG_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export class ArchitectureError extends Error {
  constructor(
    message: string,
    public type: ErrorType,
    public code?: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = "ArchitectureError";
  }
}

/**
 * 创建带超时的fetch请求
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 5000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new ArchitectureError(
        `Request timeout after ${timeoutMs}ms`,
        ErrorType.TIMEOUT_ERROR,
        "TIMEOUT",
        true
      );
    }
    throw error;
  }
}

/**
 * 重试机制
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
  backoffMultiplier: number = 2
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // 如果不是可重试的错误，直接抛出
      if (error instanceof ArchitectureError && !error.retryable) {
        throw error;
      }

      // 如果是最后一次尝试，抛出错误
      if (attempt === maxRetries) {
        break;
      }

      // 等待后重试
      const delay = delayMs * Math.pow(backoffMultiplier, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * 降级处理策略
 */
export class FallbackHandler {
  private fallbacks: Array<() => Promise<any>> = [];

  addFallback(fallback: () => Promise<any>): void {
    this.fallbacks.push(fallback);
  }

  async executeWithFallbacks(): Promise<any> {
    let lastError: Error | undefined;

    for (const fallback of this.fallbacks) {
      try {
        return await fallback();
      } catch (error) {
        lastError = error as Error;
        console.warn("Fallback failed, trying next one:", error);

        // Record error for each failed fallback attempt
        const classifiedError = classifyError(error);
        errorRecovery.recordError("geo-detection", classifiedError);
      }
    }

    throw lastError!;
  }
}

/**
 * 错误分类器
 */
export function classifyError(error: unknown): ArchitectureError {
  if (error instanceof ArchitectureError) {
    return error;
  }

  if (error instanceof TypeError && error.message.includes("fetch")) {
    return new ArchitectureError(
      "Network connection failed",
      ErrorType.NETWORK_ERROR,
      "NETWORK_FAILED",
      true
    );
  }

  if (error instanceof Error) {
    if (
      error.message.includes("timeout") ||
      error.message.includes("TimeoutError")
    ) {
      return new ArchitectureError(
        "Request timeout",
        ErrorType.TIMEOUT_ERROR,
        "TIMEOUT",
        true
      );
    }

    if (error.message.includes("JSON") || error.message.includes("parse")) {
      return new ArchitectureError(
        "Invalid response format",
        ErrorType.API_ERROR,
        "INVALID_RESPONSE",
        false
      );
    }
  }

  return new ArchitectureError(
    error instanceof Error ? error.message : "Unknown error occurred",
    ErrorType.UNKNOWN_ERROR,
    "UNKNOWN",
    false
  );
}

/**
 * 错误恢复策略
 */
export class ErrorRecovery {
  private static instance: ErrorRecovery;
  private errorCounts = new Map<string, { count: number; lastError: Date }>();
  private readonly ERROR_THRESHOLD = 5;
  private readonly RESET_TIME = 1000 * 60 * 5; // 5分钟

  static getInstance(): ErrorRecovery {
    if (!ErrorRecovery.instance) {
      ErrorRecovery.instance = new ErrorRecovery();
    }
    return ErrorRecovery.instance;
  }

  recordError(service: string, error: Error): void {
    const key = `${service}:${error.message}`;
    const now = new Date(Date.now());
    const existing = this.errorCounts.get(key);

    if (
      existing &&
      now.getTime() - existing.lastError.getTime() > this.RESET_TIME
    ) {
      // 重置计数
      this.errorCounts.set(key, { count: 1, lastError: now });
    } else {
      const newCount = (existing?.count || 0) + 1;
      this.errorCounts.set(key, { count: newCount, lastError: now });
    }
  }

  isServiceDegraded(service: string): boolean {
    const serviceErrors = Array.from(this.errorCounts.entries())
      .filter(([key]) => key.startsWith(`${service}:`))
      .reduce((total, [, data]) => total + data.count, 0);

    return serviceErrors >= this.ERROR_THRESHOLD;
  }

  getServiceHealth(service: string): { healthy: boolean; errorCount: number } {
    const serviceErrors = Array.from(this.errorCounts.entries())
      .filter(([key]) => key.startsWith(`${service}:`))
      .reduce((total, [, data]) => total + data.count, 0);

    return {
      healthy: serviceErrors < this.ERROR_THRESHOLD,
      errorCount: serviceErrors,
    };
  }
}

export const errorRecovery = ErrorRecovery.getInstance();
