/**
 * 平台检测工具
 * 用于识别应用是在浏览器还是套壳 App 中运行
 */

export type PlatformType = 'web' | 'ios-app' | 'android-app' | 'desktop-app' | 'unknown';

export interface PlatformInfo {
  type: PlatformType;
  isApp: boolean;
  isWeb: boolean;
  isMobile: boolean;
  isDesktop: boolean;
}

/**
 * 检测当前运行平台
 */
export function detectPlatform(): PlatformInfo {
  if (typeof window === 'undefined') {
    return {
      type: 'unknown',
      isApp: false,
      isWeb: false,
      isMobile: false,
      isDesktop: false,
    };
  }

  const ua = navigator.userAgent.toLowerCase();
  const isStandalone = (window.navigator as any).standalone === true; // iOS PWA
  const isInAppBrowser = checkInAppBrowser();

  // 1. 检测桌面端套壳 (Electron, Tauri, etc.)
  if (checkDesktopApp(ua)) {
    return {
      type: 'desktop-app',
      isApp: true,
      isWeb: false,
      isMobile: false,
      isDesktop: true,
    };
  }

  // 2. 检测 iOS 套壳
  if (checkIOSApp(ua, isStandalone)) {
    return {
      type: 'ios-app',
      isApp: true,
      isWeb: false,
      isMobile: true,
      isDesktop: false,
    };
  }

  // 3. 检测 Android 套壳
  if (checkAndroidApp(ua, isInAppBrowser)) {
    return {
      type: 'android-app',
      isApp: true,
      isWeb: false,
      isMobile: true,
      isDesktop: false,
    };
  }

  // 4. 默认为普通网页
  const isMobileWeb = /android|iphone|ipad|ipod|mobile/i.test(ua);
  return {
    type: 'web',
    isApp: false,
    isWeb: true,
    isMobile: isMobileWeb,
    isDesktop: !isMobileWeb,
  };
}

/**
 * 检测是否为桌面端套壳应用
 */
function checkDesktopApp(ua: string): boolean {
  // Electron
  if (ua.includes('electron')) return true;

  // Tauri
  if ((window as any).__TAURI__) return true;

  // NW.js
  if ((window as any).nw) return true;

  // CEF (Chromium Embedded Framework)
  if (ua.includes('cef')) return true;

  // 检测是否缺少浏览器特有的对象
  // 注意：这个检测可能不太准确
  const hasChrome = !!(window as any).chrome;
  const hasSafari = /safari/i.test(ua) && !/chrome/i.test(ua);
  const hasFirefox = /firefox/i.test(ua);

  if (!hasChrome && !hasSafari && !hasFirefox) {
    // 可能是自定义 WebView
    return true;
  }

  return false;
}

/**
 * 检测是否为 iOS 套壳应用
 */
function checkIOSApp(ua: string, isStandalone: boolean): boolean {
  if (!/iphone|ipad|ipod/i.test(ua)) return false;

  // 1. iOS 独立模式 (PWA 或套壳)
  if (isStandalone) return true;

  // 2. WKWebView 特征
  // WKWebView 不会有完整的 Safari 标识
  const isSafari = /safari/i.test(ua);
  const isWKWebView = !isSafari && /applewebkit/i.test(ua);
  if (isWKWebView) return true;

  // 3. 检测 iOS 特定的注入对象
  if ((window as any).webkit?.messageHandlers) {
    // 如果有 webkit messageHandlers，很可能是套壳 App
    return true;
  }

  return false;
}

/**
 * 检测是否为 Android 套壳应用
 */
function checkAndroidApp(ua: string, isInAppBrowser: boolean): boolean {
  if (!/android/i.test(ua)) return false;

  // 1. 检测是否在 WebView 中
  // Android WebView 通常有 "wv" 标识
  if (ua.includes('wv')) return true;

  // 2. 检测 Android 特定的注入对象
  if ((window as any).Android || (window as any).AndroidInterface) {
    return true;
  }

  // 3. 检测是否缺少 Chrome 的完整标识
  // 正常 Chrome 浏览器会有 "Chrome/版本号"
  const hasChrome = /chrome\/[\d.]+/i.test(ua);
  const hasAndroid = /android/i.test(ua);

  if (hasAndroid && !hasChrome) {
    // 可能是 Android WebView
    return true;
  }

  return false;
}

/**
 * 检测是否在 App 内置浏览器中
 * (微信、QQ、Facebook App 等)
 */
function checkInAppBrowser(): boolean {
  const ua = navigator.userAgent.toLowerCase();

  // 常见的 App 内置浏览器
  const inAppBrowsers = [
    'micromessenger', // 微信
    'qq/',            // QQ
    'weibo',          // 微博
    'fbav',           // Facebook
    'instagram',      // Instagram
    'line/',          // Line
    'snapchat',       // Snapchat
  ];

  return inAppBrowsers.some(browser => ua.includes(browser));
}

/**
 * 简单的判断函数：是否在 App 中
 */
export function isInApp(): boolean {
  const platform = detectPlatform();
  return platform.isApp;
}

/**
 * 简单的判断函数：是否在普通网页中
 */
export function isInBrowser(): boolean {
  const platform = detectPlatform();
  return platform.isWeb;
}
