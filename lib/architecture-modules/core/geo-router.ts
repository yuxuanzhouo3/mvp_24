// lib/architecture-modules/core/geo-router.ts - 核心地理路由器
import {
  getRegionFromCountryCode,
  getPaymentMethodsByRegion,
  getCurrencyByRegion,
  isEuropeanCountry,
} from "../utils/ip-detection";
import { RegionType, GeoResult } from "./types";
import {
  fetchWithTimeout,
  withRetry,
  FallbackHandler,
  classifyError,
  errorRecovery,
  ArchitectureError,
  ErrorType,
} from "../utils/error-handler";

export class GeoRouter {
  private cache = new Map<string, { result: GeoResult; timestamp: number }>();
  private pendingRequests = new Map<string, Promise<GeoResult>>();
  private readonly CACHE_TTL = 1000 * 60 * 60; // 1小时缓存
  private readonly REQUEST_TIMEOUT = 5000; // 5秒超时
  private readonly MAX_RETRIES = 2;

  /**
   * 检测IP并返回完整的地理路由配置
   */
  async detect(ip: string): Promise<GeoResult> {
    // 检查缓存
    const cached = this.cache.get(ip);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result;
    }

    // 检查是否有正在进行的请求
    const pending = this.pendingRequests.get(ip);
    if (pending) {
      return pending;
    }

    // 创建新的请求
    const requestPromise = this.performDetection(ip);
    this.pendingRequests.set(ip, requestPromise);

    try {
      const result = await requestPromise;

      // 缓存结果
      this.cache.set(ip, { result, timestamp: Date.now() });

      return result;
    } catch (error) {
      // 所有fallback都失败，记录错误用于监控
      const classifiedError = classifyError(error);
      console.error(
        "Geo detection failed with all fallbacks:",
        classifiedError
      );
      errorRecovery.recordError("geo-detection", classifiedError);

      // 返回默认配置作为最后的降级
      const defaultResult = this.getDefaultGeoResult();
      // 缓存默认结果（短期）
      this.cache.set(ip, { result: defaultResult, timestamp: Date.now() });
      return defaultResult;
    } finally {
      // 清理待处理的请求
      this.pendingRequests.delete(ip);
    }
  }

  private async performDetection(ip: string): Promise<GeoResult> {
    const fallbackHandler = new FallbackHandler();

    // 主检测服务 - 使用 ipapi.co JSON API
    fallbackHandler.addFallback(async () => {
      return await withRetry(
        () => this.detectWithPrimaryService(ip),
        this.MAX_RETRIES,
        1000
      );
    });

    // 备用检测服务 - 使用 ip-api.com
    fallbackHandler.addFallback(async () => {
      return await withRetry(
        () => this.detectWithFallbackService(ip),
        this.MAX_RETRIES,
        2000
      );
    });

    // 第三个备用服务 - 使用 ipinfo.io（如果有API密钥）
    fallbackHandler.addFallback(async () => {
      return await this.detectWithThirdFallback(ip);
    });

    // 本地检测（最后的降级）
    fallbackHandler.addFallback(async () => {
      return this.detectLocally(ip);
    });

    // 执行所有fallback，如果都失败则抛出错误
    return await fallbackHandler.executeWithFallbacks();
  }

  /**
   * 使用主IP检测服务
   */
  private async detectWithPrimaryService(ip: string): Promise<GeoResult> {
    try {
      // 如果 IP 为空或无效，直接使用本地检测
      if (!ip || ip === "" || ip === "::1" || ip === "127.0.0.1") {
        console.log("Empty or localhost IP, using local detection");
        return this.detectLocally(ip);
      }

      // 使用 ipapi.co 的 JSON API，更加稳定
      const response = await fetchWithTimeout(
        `https://ipapi.co/${ip}/json/`,
        {},
        this.REQUEST_TIMEOUT
      );

      if (!response.ok) {
        throw new ArchitectureError(
          `HTTP ${response.status}: ${response.statusText}`,
          ErrorType.API_ERROR,
          "HTTP_ERROR",
          true
        );
      }

      const data = await response.json();

      // 检查API错误响应
      if (data.error) {
        throw new ArchitectureError(
          `IP detection failed: ${data.reason || data.error}`,
          ErrorType.API_ERROR,
          "API_FAILED",
          false
        );
      }

      // 验证必需字段
      if (!data.country_code || !data.country_name) {
        throw new ArchitectureError(
          "Invalid response: missing country_code or country_name",
          ErrorType.VALIDATION_ERROR,
          "INVALID_RESPONSE",
          false
        );
      }

      return this.buildGeoResult(data.country_code);
    } catch (error) {
      // 重新抛出已分类的错误
      if (error instanceof ArchitectureError) {
        throw error;
      }
      throw classifyError(error);
    }
  }

  /**
   * 使用备用IP检测服务
   */
  private async detectWithFallbackService(ip: string): Promise<GeoResult> {
    try {
      // 如果 IP 为空或无效，直接使用本地检测
      if (!ip || ip === "" || ip === "::1" || ip === "127.0.0.1") {
        console.log("Empty or localhost IP, using local detection");
        return this.detectLocally(ip);
      }

      // 使用 ip-api.com 作为备用服务，使用更稳定的端点
      const response = await fetchWithTimeout(
        `http://ip-api.com/json/${ip}`,
        {},
        this.REQUEST_TIMEOUT
      );

      if (!response.ok) {
        throw new ArchitectureError(
          `Fallback service HTTP ${response.status}`,
          ErrorType.API_ERROR,
          "FALLBACK_HTTP_ERROR",
          true
        );
      }

      const data = await response.json();

      if (data.status === "fail") {
        throw new ArchitectureError(
          `Fallback IP detection failed: ${data.message}`,
          ErrorType.API_ERROR,
          "FALLBACK_API_FAILED",
          false
        );
      }

      if (!data.countryCode) {
        throw new ArchitectureError(
          "Invalid fallback response: missing countryCode",
          ErrorType.VALIDATION_ERROR,
          "FALLBACK_INVALID_RESPONSE",
          false
        );
      }

      return this.buildGeoResult(data.countryCode);
    } catch (error) {
      if (error instanceof ArchitectureError) {
        throw error;
      }
      throw classifyError(error);
    }
  }

  /**
   * 使用第三个备用IP检测服务
   */
  private async detectWithThirdFallback(ip: string): Promise<GeoResult> {
    try {
      // 如果 IP 为空或无效，直接使用本地检测
      if (!ip || ip === "" || ip === "::1" || ip === "127.0.0.1") {
        console.log("Empty or localhost IP, using local detection");
        return this.detectLocally(ip);
      }

      // 使用 ipinfo.io 作为第三个备用服务（免费版）
      const response = await fetchWithTimeout(
        `https://ipinfo.io/${ip}/json`,
        {},
        this.REQUEST_TIMEOUT
      );

      if (!response.ok) {
        throw new ArchitectureError(
          `Third fallback service HTTP ${response.status}`,
          ErrorType.API_ERROR,
          "THIRD_FALLBACK_HTTP_ERROR",
          true
        );
      }

      const data = await response.json();

      // ipinfo.io 返回的字段名为 "country" (ISO 2-letter code)
      // 示例响应: { "ip": "8.8.8.8", "city": "Mountain View", "region": "California", "country": "US", ... }
      const countryCode = data.country;

      if (!countryCode) {
        console.error(
          "ipinfo.io response missing country field:",
          JSON.stringify(data)
        );
        throw new ArchitectureError(
          `Invalid third fallback response: missing country. Response: ${JSON.stringify(
            data
          )}`,
          ErrorType.VALIDATION_ERROR,
          "THIRD_FALLBACK_INVALID_RESPONSE",
          false
        );
      }

      return this.buildGeoResult(countryCode);
    } catch (error) {
      if (error instanceof ArchitectureError) {
        throw error;
      }
      throw classifyError(error);
    }
  }

  /**
   * 本地检测（最后的降级策略）
   */
  private detectLocally(ip: string): GeoResult {
    // 简单的本地IP范围检测
    if (this.isPrivateIP(ip)) {
      // 内网IP，默认为中国（开发环境）
      return this.buildGeoResult("CN");
    }

    if (this.isLikelyChineseIP(ip)) {
      return this.buildGeoResult("CN");
    }

    // 默认海外
    return this.buildGeoResult("US");
  }

  /**
   * 构建地理结果
   */
  private buildGeoResult(countryCode: string): GeoResult {
    const region = this.mapToRegionType(getRegionFromCountryCode(countryCode));

    return {
      region,
      countryCode,
      currency: getCurrencyByRegion(region),
      paymentMethods: getPaymentMethodsByRegion(region),
      authMethods: this.getAuthMethods(region),
      database: region === RegionType.CHINA ? "cloudbase" : "supabase",
      deployment: region === RegionType.CHINA ? "tencent" : "vercel",
      gdprCompliant: isEuropeanCountry(countryCode),
    };
  }

  /**
   * 检查是否为私有IP
   */
  private isPrivateIP(ip: string): boolean {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4) return false;

    // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    return (
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    );
  }

  /**
   * 简单的中国IP范围检测（示例实现）
   */
  private isLikelyChineseIP(ip: string): boolean {
    // 这是一个简化的实现，实际应该使用更完整的IP库
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4) return false;

    // 常见的美国IP段（简化判断）
    // 8.8.8.0/24 (Google DNS), 208.67.222.0/24 (OpenDNS), etc.
    if (parts[0] === 8 && parts[1] === 8) return false; // Google DNS
    if (parts[0] === 208 && parts[1] === 67) return false; // OpenDNS

    // 中国常见IP段示例（实际应用中应该使用专业的IP地理库）
    // 这里只是示例，实际应该使用完整的IP地理数据库
    return false; // 为了测试简化，暂时返回false
  }

  /**
   * 获取认证方法 - 按照源项目逻辑
   */
  private getAuthMethods(region: RegionType): string[] {
    switch (region) {
      case RegionType.CHINA:
        return ["wechat", "email"];
      case RegionType.EUROPE:
        return ["email"]; // 欧洲地区GDPR合规，只允许邮箱认证
      default:
        return ["google", "email"];
    }
  }

  /**
   * 映射到RegionType枚举
   */
  private mapToRegionType(region: string): RegionType {
    switch (region) {
      case "china":
        return RegionType.CHINA;
      case "usa":
        return RegionType.USA;
      case "europe":
        return RegionType.EUROPE;
      case "india":
        return RegionType.INDIA;
      case "singapore":
        return RegionType.SINGAPORE;
      default:
        return RegionType.OTHER;
    }
  }

  /**
   * 获取默认地理结果（海外）
   */
  private getDefaultGeoResult(): GeoResult {
    return {
      region: RegionType.USA,
      countryCode: "US",
      currency: "USD",
      paymentMethods: ["stripe", "paypal"],
      authMethods: ["google", "email"],
      database: "supabase",
      deployment: "vercel",
      gdprCompliant: false,
    };
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// 导出单例实例
export const geoRouter = new GeoRouter();
