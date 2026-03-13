export const MODEL_FAVORITES_EVENT = "model-favorites-changed";

function getStorageKey(userId?: string | null) {
  return `model-favorites:${userId || "guest"}`;
}

export function getStoredModelFavorites(userId?: string | null): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function setStoredModelFavorites(ids: string[], userId?: string | null) {
  if (typeof window === "undefined") return;
  const unique = Array.from(new Set(ids.map((item) => String(item || "").trim()).filter(Boolean)));
  window.localStorage.setItem(getStorageKey(userId), JSON.stringify(unique));
  window.dispatchEvent(new CustomEvent(MODEL_FAVORITES_EVENT, { detail: { ids: unique, userId: userId || null } }));
}

export function toggleStoredModelFavorite(modelId: string, userId?: string | null) {
  const current = getStoredModelFavorites(userId);
  const normalized = String(modelId || "").trim();
  if (!normalized) return current;
  const next = current.includes(normalized)
    ? current.filter((item) => item !== normalized)
    : [normalized, ...current];
  setStoredModelFavorites(next, userId);
  return next;
}
