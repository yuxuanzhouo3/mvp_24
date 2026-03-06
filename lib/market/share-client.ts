"use client";

export interface NativeSharePayload {
  url: string;
  text?: string;
}

export interface PosterSystemSharePayload {
  posterDataUrl: string;
  fileName: string;
  text?: string;
  fallbackUrl?: string;
  allowLinkFallback?: boolean;
}

const SHARE_POSTER_FILENAME_PREFIX = "__median_share_poster__";

type PostableBridge = {
  postMessage: (payload: string) => void;
};

type MedianShareBridge = {
  sharePage: (params: {
    url?: string;
    text?: string;
    optionalUrl?: string;
    optionalText?: string;
  }) => void;
  downloadFile?: (params: {
    url: string;
    filename?: string;
    open?: boolean;
  }) => Promise<any> | void;
};

declare global {
  interface Window {
    JSBridge?: PostableBridge;
    median?: {
      share?: MedianShareBridge;
    };
  }
}

function isAndroidDevice() {
  if (typeof window === "undefined") return false;
  return /Android/i.test(window.navigator.userAgent || "");
}

function isMobileDevice() {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent || "");
}

function hasMedianShareBridge() {
  if (typeof window === "undefined") return false;
  return typeof window.median?.share?.sharePage === "function";
}

function hasMedianDownloadFileBridge() {
  if (typeof window === "undefined") return false;
  return typeof window.median?.share?.downloadFile === "function";
}

function hasJsBridgePostMessage() {
  if (typeof window === "undefined") return false;
  return typeof window.JSBridge?.postMessage === "function";
}

export function isAndroidAppWebView() {
  if (!isAndroidDevice()) return false;
  return hasMedianShareBridge() || hasJsBridgePostMessage();
}

export function canNativeShare() {
  return isAndroidAppWebView();
}

function hasNavigatorShare() {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.share === "function";
}

export function canSystemSharePoster() {
  if (!isMobileDevice()) return false;
  return hasNavigatorShare() || canNativeShare();
}

export function nativeShareLink(payload: NativeSharePayload) {
  const url = String(payload.url || "").trim();
  if (!url) {
    throw new Error("Missing share url");
  }

  const text = String(payload.text || "").trim();

  if (!canNativeShare()) {
    throw new Error("Native share is unavailable");
  }

  if (hasMedianShareBridge()) {
    window.median!.share!.sharePage({
      url,
      text: text || undefined,
      optionalUrl: url,
      optionalText: text || undefined,
    });
    return;
  }

  if (hasJsBridgePostMessage()) {
    window.JSBridge!.postMessage(
      JSON.stringify({
        medianCommand: "median://share/sharePage",
        data: {
          url,
          text: text || undefined,
          optionalUrl: url,
          optionalText: text || undefined,
        },
      })
    );
    return;
  }

  throw new Error("Native share bridge is unavailable");
}

async function dataUrlToFile(dataUrl: string, fileName: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  if (typeof File !== "undefined") {
    return new File([blob], fileName, { type: blob.type || "image/png" });
  }
  return blob as any;
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return await response.blob();
}

export async function systemSharePoster(payload: PosterSystemSharePayload) {
  const posterDataUrl = String(payload.posterDataUrl || "").trim();
  if (!posterDataUrl) {
    throw new Error("Missing poster data");
  }

  const fileName = String(payload.fileName || "").trim() || "invite-poster.png";
  const text = String(payload.text || "").trim();
  const fallbackUrl = String(payload.fallbackUrl || "").trim();
  const allowLinkFallback = payload.allowLinkFallback === true;

  if (canNativeShare() && hasMedianDownloadFileBridge()) {
    const posterBlob = await dataUrlToBlob(posterDataUrl);
    const blobUrl = URL.createObjectURL(posterBlob);
    try {
      const result = window.median!.share!.downloadFile!({
        url: blobUrl,
        filename: `${SHARE_POSTER_FILENAME_PREFIX}${fileName}`,
        open: true,
      });
      if (result && typeof (result as Promise<any>).then === "function") {
        await result;
      }
      return;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  if (hasNavigatorShare()) {
    try {
      const posterFile = await dataUrlToFile(posterDataUrl, fileName);
      const nav = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
      };
      const files = [posterFile as File];

      if (typeof nav.canShare === "function" && !nav.canShare({ files })) {
        throw new Error("File share is unavailable");
      }

      await nav.share({ files });
      return;
    } catch {
      // Keep trying fallback behavior before giving up.
    }
  }

  if (canNativeShare() && fallbackUrl && allowLinkFallback) {
    nativeShareLink({
      url: fallbackUrl,
      text: text || undefined,
    });
    return;
  }

  throw new Error("Poster system share unavailable");
}
