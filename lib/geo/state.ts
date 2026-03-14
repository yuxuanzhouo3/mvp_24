import { RegionType } from "@/lib/architecture-modules/core/types";
import { isChinaRegion } from "@/lib/config/region";

export const GEO_REGION_COOKIE = "geo_region";
export const GEO_COUNTRY_COOKIE = "geo_country";
export const GEO_CURRENCY_COOKIE = "geo_currency";
export const GEO_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const REGION_TYPES = new Set(Object.values(RegionType));

function getDefaultRegion() {
  return isChinaRegion() ? RegionType.CHINA : RegionType.USA;
}

function getDefaultCountryCode(region: RegionType) {
  return region === RegionType.CHINA ? "CN" : "US";
}

function getDefaultCurrency(region: RegionType) {
  return region === RegionType.CHINA ? "CNY" : "USD";
}

export function getFallbackGeoDescriptor() {
  const region = getDefaultRegion();
  return {
    region,
    countryCode: getDefaultCountryCode(region),
    currency: getDefaultCurrency(region),
  };
}

export function normalizeGeoRegion(
  value: unknown,
  fallback = getFallbackGeoDescriptor().region
): RegionType {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (!REGION_TYPES.has(normalized as RegionType)) {
    return fallback;
  }

  return normalized as RegionType;
}

export function normalizeGeoCountryCode(
  value: unknown,
  fallbackRegion = getFallbackGeoDescriptor().region
) {
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(normalized)) {
      return normalized;
    }
  }

  return getDefaultCountryCode(fallbackRegion);
}

export function buildGeoClientState(input?: {
  region?: unknown;
  countryCode?: unknown;
}) {
  const fallback = getFallbackGeoDescriptor();
  const region = normalizeGeoRegion(input?.region, fallback.region);
  const countryCode = normalizeGeoCountryCode(input?.countryCode, region);

  return {
    region,
    countryCode,
    isChina: region === RegionType.CHINA || countryCode === "CN",
    isLoading: false,
  };
}

export function parseGeoClientStateFromCookieString(cookieString?: string | null) {
  if (!cookieString) {
    return buildGeoClientState();
  }

  const cookieValues = new Map<string, string>();

  for (const chunk of cookieString.split(";")) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    cookieValues.set(key, decodeURIComponent(rawValue));
  }

  return buildGeoClientState({
    region: cookieValues.get(GEO_REGION_COOKIE),
    countryCode: cookieValues.get(GEO_COUNTRY_COOKIE),
  });
}
