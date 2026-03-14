"use client";

export type UsagePayload = {
  used: number;
  limit: number;
  remaining?: number;
  plan: string;
  credits: {
    balance: number;
    monthlyGrant: number;
    dailyCap: number;
    spentThisMonth: number;
    spentToday: number;
    remainingThisMonth: number;
    monthlyGrantBalance: number;
    rechargeBalance: number;
    bonusBalance: number;
  };
  multimodal?: {
    image: { used: number; limit: number; remaining: number };
    videoAudio: { used: number; limit: number; remaining: number };
  } | null;
};

const DEFAULT_MAX_AGE_MS = 15_000;

let cachedUsage: UsagePayload | null = null;
let cachedAt = 0;
let cachedAuthToken: string | null = null;
let inflightUsageRequest: Promise<UsagePayload> | null = null;

const usageListeners = new Set<() => void>();

function notifyUsageListeners() {
  usageListeners.forEach((listener) => listener());
}

function resetUsageCache(shouldNotify: boolean) {
  cachedUsage = null;
  cachedAt = 0;
  cachedAuthToken = null;

  if (shouldNotify) {
    notifyUsageListeners();
  }
}

function hasFreshUsage(authToken: string, maxAgeMs: number) {
  if (!cachedUsage || !cachedAuthToken || cachedAuthToken !== authToken) {
    return false;
  }

  return Date.now() - cachedAt <= maxAgeMs;
}

async function requestUserUsage(
  authToken: string,
  options?: { forceRefresh?: boolean; maxAgeMs?: number }
): Promise<UsagePayload> {
  const forceRefresh = Boolean(options?.forceRefresh);
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;

  if (!forceRefresh && hasFreshUsage(authToken, maxAgeMs)) {
    return cachedUsage as UsagePayload;
  }

  if (cachedAuthToken && cachedAuthToken !== authToken) {
    resetUsageCache(true);
  }

  if (inflightUsageRequest) {
    return inflightUsageRequest;
  }

  inflightUsageRequest = fetch("/api/user/usage", {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch usage (${response.status})`);
      }

      const payload = (await response.json()) as UsagePayload;
      cachedUsage = payload;
      cachedAuthToken = authToken;
      cachedAt = Date.now();
      notifyUsageListeners();
      return payload;
    })
    .finally(() => {
      inflightUsageRequest = null;
    });

  return inflightUsageRequest;
}

export function getUserUsageSnapshot() {
  return cachedUsage;
}

export function subscribeToUserUsage(listener: () => void) {
  usageListeners.add(listener);

  return () => {
    usageListeners.delete(listener);
  };
}

export async function ensureUserUsageLoaded(
  authToken: string,
  options?: { forceRefresh?: boolean; maxAgeMs?: number }
) {
  return requestUserUsage(authToken, options);
}

export async function refreshUserUsage(authToken: string) {
  return requestUserUsage(authToken, {
    forceRefresh: true,
    maxAgeMs: 0,
  });
}

export function clearUserUsageCache() {
  resetUsageCache(true);
}
