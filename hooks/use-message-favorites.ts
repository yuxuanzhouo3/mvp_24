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
  const noCodeFence = (text || "").replace(/```[\s\S]*?```/g, " ");
  const noInlineCode = noCodeFence.replace(/`([^`]+)`/g, "$1");
  const noImages = noInlineCode.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  const noLinks = noImages.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  const noHeading = noLinks.replace(/^#{1,6}\s+/gm, "");
  const noQuote = noHeading.replace(/^>\s+/gm, "");
  const noList = noQuote.replace(/^\s*[-*+]\s+/gm, "");
  const noOrderedList = noList.replace(/^\s*\d+\.\s+/gm, "");
  const noEmphasis = noOrderedList.replace(/[*_~]+/g, "");
  const noLooseHash = noEmphasis.replace(/(^|\s)#+(?=\s|$)/g, " ");
  const cleaned = noLooseHash.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen) + "…";
}

export function setPendingFavoriteScroll(
  sessionId: string,
  anchorId: string,
  preview?: string
) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      "multigpt:pendingScroll:v1",
      JSON.stringify({ sessionId, anchorId, preview, ts: Date.now() })
    );
  } catch {
    // ignore
  }
}

export function peekPendingFavoriteScroll():
  | { sessionId: string; anchorId: string; preview?: string }
  | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem("multigpt:pendingScroll:v1");
    if (!raw) return null;
    const parsed = safeJsonParse<any>(raw, null);
    if (!parsed?.sessionId || !parsed?.anchorId) return null;
    return {
      sessionId: parsed.sessionId,
      anchorId: parsed.anchorId,
      preview: typeof parsed.preview === "string" ? parsed.preview : undefined,
    };
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
  | { sessionId: string; anchorId: string; preview?: string }
  | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem("multigpt:pendingScroll:v1");
    if (!raw) return null;
    const parsed = safeJsonParse<any>(raw, null);
    if (!parsed?.sessionId || !parsed?.anchorId) return null;
    window.sessionStorage.removeItem("multigpt:pendingScroll:v1");
    return {
      sessionId: parsed.sessionId,
      anchorId: parsed.anchorId,
      preview: typeof parsed.preview === "string" ? parsed.preview : undefined,
    };
  } catch {
    return null;
  }
}

export function rewriteFavoriteAnchor(
  sessionId: string,
  oldAnchorId: string,
  newAnchorId: string
) {
  if (typeof window === "undefined") return false;
  if (!sessionId || !oldAnchorId || !newAnchorId || oldAnchorId === newAnchorId) {
    return false;
  }
  try {
    const loaded = safeJsonParse<FavoriteMessageItem[]>(
      window.localStorage.getItem(STORAGE_KEY),
      []
    );
    if (!Array.isArray(loaded) || loaded.length === 0) return false;

    let changed = false;
    const next = loaded.map((item) => {
      if (item.sessionId === sessionId && item.anchorId === oldAnchorId) {
        changed = true;
        return {
          ...item,
          anchorId: newAnchorId,
          id: `${sessionId}:${newAnchorId}`,
        };
      }
      return item;
    });
    if (!changed) return false;

    const deduped = Array.from(
      new Map(next.map((item) => [item.id, item])).values()
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: deduped }));
    return true;
  } catch {
    return false;
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
    return [...items]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((item) => ({
        ...item,
        preview: normalizePreview(item.preview),
      }));
  }, [items]);

  return { items: sorted, isFavorite, toggle, remove };
}
