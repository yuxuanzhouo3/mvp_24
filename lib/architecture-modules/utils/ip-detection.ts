/**
 * IP 地理位置检测与国家分类库
 *
 * 功能：
 * 1. 定义欧洲国家列表（EU + EEA + UK + CH）
 * 2. 定义主流市场国家
 * 3. 区域分类函数
 * 4. 语言识别函数
 */

// 欧洲国家代码列表（EU + EEA + UK + CH）
export const EUROPEAN_COUNTRIES = [
  // EU 成员国 (27个)
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  // EEA 非 EU 成员
  "IS",
  "LI",
  "NO",
  // 英国（脱欧后仍需遵守部分GDPR）
  "GB",
  // 瑞士（虽非EU但数据保护法类似）
  "CH",
];

// 主流市场国家
export const TARGET_MARKETS = {
  CHINA: "CN",
  USA: "US",
  INDIA: "IN",
  SINGAPORE: "SG",
};

// 区域分类类型
export type Region =
  | "china"
  | "usa"
  | "india"
  | "singapore"
  | "europe"
  | "other";

// 语言类型
export type Language = "zh" | "en";

/**
 * 根据国家代码获取区域分类
 */
export function getRegionFromCountryCode(countryCode: string): Region {
  if (countryCode === TARGET_MARKETS.CHINA) return "china";
  if (countryCode === TARGET_MARKETS.USA) return "usa";
  if (countryCode === TARGET_MARKETS.INDIA) return "india";
  if (countryCode === TARGET_MARKETS.SINGAPORE) return "singapore";
  if (EUROPEAN_COUNTRIES.includes(countryCode)) return "europe";
  return "other";
}

/**
 * 根据区域获取默认语言
 */
export function getDefaultLanguage(region: Region): Language {
  if (region === "china") return "zh";
  return "en";
}

/**
 * 检查是否为欧洲国家
 */
export function isEuropeanCountry(countryCode: string): boolean {
  return EUROPEAN_COUNTRIES.includes(countryCode);
}

/**
 * 检查是否为中国
 */
export function isChinaCountry(countryCode: string): boolean {
  return countryCode === TARGET_MARKETS.CHINA;
}

/**
 * 获取区域的支付方式
 */
export function getPaymentMethodsByRegion(region: Region): string[] {
  switch (region) {
    case "china":
      return ["wechat", "alipay"]; // 按照源项目逻辑，中国地区使用微信支付和支付宝
    case "usa":
    case "india":
    case "singapore":
    case "other":
      return ["stripe", "paypal"];
    case "europe":
      return []; // 欧洲地区屏蔽支付
    default:
      return ["stripe", "paypal"];
  }
}

/**
 * 获取区域的货币
 */
export function getCurrencyByRegion(region: Region): string {
  switch (region) {
    case "china":
      return "CNY";
    case "usa":
      return "USD";
    case "india":
      return "INR";
    case "singapore":
      return "SGD";
    case "europe":
      return "EUR";
    default:
      return "USD";
  }
}
