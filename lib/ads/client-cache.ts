export const AD_POSITIONS = [
  "top",
  "bottom",
  "left",
  "right",
  "sidebar",
  "bottom-left",
  "bottom-right",
] as const;

export type AdvertisementPosition = (typeof AD_POSITIONS)[number];

export interface Advertisement {
  id: string;
  title: string;
  position: AdvertisementPosition;
  media_type: "image" | "video";
  media_url: string;
  target_url: string | null;
  priority: number;
}

export type AdvertisementBatch = Record<AdvertisementPosition, Advertisement[]>;

const AD_BATCH_QUERY = AD_POSITIONS.join(",");
const AD_POLL_INTERVAL_MS = 15_000;

let cachedAdvertisementBatch: AdvertisementBatch | null = null;
let inflightAdvertisementRequest: Promise<AdvertisementBatch> | null = null;
let advertisementPollTimer: ReturnType<typeof window.setInterval> | null = null;

const advertisementListeners = new Set<() => void>();

function isAdvertisementPosition(value: string): value is AdvertisementPosition {
  return AD_POSITIONS.includes(value as AdvertisementPosition);
}

function createEmptyAdvertisementBatch(): AdvertisementBatch {
  return {
    top: [],
    bottom: [],
    left: [],
    right: [],
    sidebar: [],
    "bottom-left": [],
    "bottom-right": [],
  };
}

function normalizeAdvertisementBatch(input: unknown): AdvertisementBatch {
  const batch = createEmptyAdvertisementBatch();
  if (!Array.isArray(input)) {
    return batch;
  }

  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const position = typeof (item as any).position === "string"
      ? (item as any).position
      : "";
    if (!isAdvertisementPosition(position)) continue;

    batch[position].push({
      id: String((item as any).id || ""),
      title: String((item as any).title || ""),
      position,
      media_type: (item as any).media_type === "video" ? "video" : "image",
      media_url: String((item as any).media_url || ""),
      target_url:
        typeof (item as any).target_url === "string"
          ? (item as any).target_url
          : null,
      priority: Number((item as any).priority || 0),
    });
  }

  return batch;
}

function notifyAdvertisementListeners() {
  advertisementListeners.forEach((listener) => listener());
}

async function requestAdvertisementBatch(
  forceRefresh = false
): Promise<AdvertisementBatch> {
  if (!forceRefresh && cachedAdvertisementBatch) {
    return cachedAdvertisementBatch;
  }

  if (inflightAdvertisementRequest) {
    return inflightAdvertisementRequest;
  }

  inflightAdvertisementRequest = fetch(
    `/api/advertisements?positions=${encodeURIComponent(AD_BATCH_QUERY)}`,
    {
      cache: "no-store",
    }
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load advertisements (${response.status})`);
      }

      const payload = await response.json();
      const batch = normalizeAdvertisementBatch(payload?.data);
      cachedAdvertisementBatch = batch;
      notifyAdvertisementListeners();
      return batch;
    })
    .finally(() => {
      inflightAdvertisementRequest = null;
    });

  return inflightAdvertisementRequest;
}

async function refreshAdvertisementBatchInBackground() {
  try {
    await requestAdvertisementBatch(true);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[ads] failed to refresh advertisement batch:", error);
    }
  }
}

function startAdvertisementPolling() {
  if (typeof window === "undefined" || advertisementPollTimer !== null) {
    return;
  }

  advertisementPollTimer = window.setInterval(() => {
    void refreshAdvertisementBatchInBackground();
  }, AD_POLL_INTERVAL_MS);
}

function stopAdvertisementPollingIfIdle() {
  if (advertisementListeners.size > 0 || advertisementPollTimer === null) {
    return;
  }

  window.clearInterval(advertisementPollTimer);
  advertisementPollTimer = null;
}

export function getAdvertisementBatchSnapshot() {
  return cachedAdvertisementBatch;
}

export function subscribeToAdvertisementBatch(listener: () => void) {
  advertisementListeners.add(listener);
  startAdvertisementPolling();

  return () => {
    advertisementListeners.delete(listener);
    stopAdvertisementPollingIfIdle();
  };
}

export async function ensureAdvertisementBatchLoaded(
  options?: { forceRefresh?: boolean }
) {
  return requestAdvertisementBatch(Boolean(options?.forceRefresh));
}
