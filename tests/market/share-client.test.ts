import {
  canNativeShare,
  canSystemSharePoster,
  nativeShareLink,
} from "../../lib/market/share-client";

describe("market share client", () => {
  const originalWindow = (global as any).window;
  const originalNavigator = (global as any).navigator;

  afterEach(() => {
    if (typeof originalWindow === "undefined") {
      delete (global as any).window;
    } else {
      (global as any).window = originalWindow;
    }
    if (typeof originalNavigator === "undefined") {
      delete (global as any).navigator;
    } else {
      Object.defineProperty(global, "navigator", {
        value: originalNavigator,
        configurable: true,
      });
    }
    jest.restoreAllMocks();
  });

  it("reports native share available for android webview median bridge", () => {
    const sharePage = jest.fn();
    (global as any).window = {
      navigator: { userAgent: "Mozilla/5.0 (Linux; Android 14)" },
      median: {
        share: {
          sharePage,
        },
      },
    };

    expect(canNativeShare()).toBe(true);

    nativeShareLink({
      url: "https://example.com/r/abc?source=android_share",
      text: "invite",
    });

    expect(sharePage).toHaveBeenCalledWith({
      url: "https://example.com/r/abc?source=android_share",
      text: "invite",
      optionalUrl: "https://example.com/r/abc?source=android_share",
      optionalText: "invite",
    });
  });

  it("falls back to JSBridge when median share bridge is missing", () => {
    const postMessage = jest.fn();
    (global as any).window = {
      navigator: { userAgent: "Android 14" },
      JSBridge: { postMessage },
    };

    nativeShareLink({
      url: "https://example.com/r/abc?source=android_share",
      text: "invite",
    });

    expect(postMessage).toHaveBeenCalledTimes(1);
    const payload = postMessage.mock.calls[0][0];
    expect(String(payload)).toContain("median://share/sharePage");
    expect(String(payload)).toContain("android_share");
  });

  it("supports poster system share on mobile when navigator.share exists", () => {
    (global as any).window = {
      navigator: { userAgent: "iPhone" },
    };
    Object.defineProperty(global, "navigator", {
      value: {
        share: jest.fn(),
      },
      configurable: true,
    });

    expect(canSystemSharePoster()).toBe(true);
  });

  it("returns false for poster share on desktop without native or navigator share", () => {
    (global as any).window = {
      navigator: { userAgent: "Mozilla/5.0 (Macintosh)" },
    };
    Object.defineProperty(global, "navigator", {
      value: {},
      configurable: true,
    });

    expect(canSystemSharePoster()).toBe(false);
  });
});
