"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type FavoriteMessageRole = "user" | "assistant";

export interface FavoriteMessageItem {
  id: string;
  sessionId: string;
  anchorId: string;
  role: FavoriteMessageRole;
  preview: string;
  createdAt: number;
}

const STORAGE_KEY = "multigpt:favorites:messages:v1";
const CHANGE_EVENT = "multigpt:favorites:messages:changed:v1";

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizePreview(text: string, maxLen = 80) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen) + "…";
}

export function setPendingFavoriteScroll(sessionId: string, anchorId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      "multigpt:pendingScroll:v1",
      JSON.stringify({ sessionId, anchorId, ts: Date.now() })
    );
  } catch {
    // ignore
  }
}

export function peekPendingFavoriteScroll():
  | { sessionId: string; anchorId: string }
  | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem("multigpt:pendingScroll:v1");
    if (!raw) return null;
    const parsed = safeJsonParse<any>(raw, null);
    if (!parsed?.sessionId || !parsed?.anchorId) return null;
    return { sessionId: parsed.sessionId, anchorId: parsed.anchorId };
  } catch {
    return null;
  }
}

export function clearPendingFavoriteScroll() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem("multigpt:pendingScroll:v1");
  } catch {
    // ignore
  }
}

export function consumePendingFavoriteScroll():
  | { sessionId: string; anchorId: string }
  | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem("multigpt:pendingScroll:v1");
    if (!raw) return null;
    const parsed = safeJsonParse<any>(raw, null);
    if (!parsed?.sessionId || !parsed?.anchorId) return null;
    window.sessionStorage.removeItem("multigpt:pendingScroll:v1");
    return { sessionId: parsed.sessionId, anchorId: parsed.anchorId };
  } catch {
    return null;
  }
}

export function useMessageFavorites() {
  const [items, setItems] = useState<FavoriteMessageItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loaded = safeJsonParse<FavoriteMessageItem[]>(
      window.localStorage.getItem(STORAGE_KEY),
      []
    );
    setItems(Array.isArray(loaded) ? loaded : []);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = safeJsonParse<FavoriteMessageItem[]>(e.newValue, []);
      setItems(Array.isArray(next) ? next : []);
    };

    // In the same tab, `storage` won't fire. Broadcast changes explicitly.
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<FavoriteMessageItem[]>;
      const next = ce.detail;
      if (!Array.isArray(next)) return;
      setItems(next);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, []);

  const persist = useCallback((next: FavoriteMessageItem[]) => {
    setItems(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
    } catch {
      // ignore
    }
  }, []);

  const isFavorite = useCallback(
    (id: string) => {
      return items.some((i) => i.id === id);
    },
    [items]
  );

  const toggle = useCallback(
    (item: Omit<FavoriteMessageItem, "preview" | "createdAt"> & { preview: string }) => {
      const exists = items.find((i) => i.id === item.id);
      if (exists) {
        persist(items.filter((i) => i.id !== item.id));
        return;
      }
      const next: FavoriteMessageItem = {
        ...item,
        preview: normalizePreview(item.preview),
        createdAt: Date.now(),
      };
      persist([next, ...items]);
    },
    [items, persist]
  );

  const remove = useCallback(
    (id: string) => {
      if (!items.some((i) => i.id === id)) return;
      persist(items.filter((i) => i.id !== id));
    },
    [items, persist]
  );

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => b.createdAt - a.createdAt);
  }, [items]);

  return { items: sorted, isFavorite, toggle, remove };
}
