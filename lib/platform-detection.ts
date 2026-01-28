/**
 * 平台检测工具
 * 用于识别应用是在浏览器还是套壳 App 中运行
 */

export type PlatformType = 'web' | 'ios-app' | 'android-app' | 'harmonyos-app' | 'desktop-app' | 'wechat-miniprogram' | 'unknown';

export interface PlatformInfo {
  type: PlatformType;
  isApp: boolean;
  isWeb: boolean;
  isMobile: boolean;
  isDesktop: boolean;
  isWechatMiniProgram: boolean;
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
      isWechatMiniProgram: false,
    };
  }

  const ua = navigator.userAgent.toLowerCase();
  const isStandalone = (window.navigator as any).standalone === true; // iOS PWA
  const isInAppBrowser = checkInAppBrowser();

  // 0. 检测微信小程序
  if (checkWechatMiniProgram(ua)) {
    return {
      type: 'wechat-miniprogram',
      isApp: true,
      isWeb: false,
      isMobile: true,
      isDesktop: false,
      isWechatMiniProgram: true,
    };
  }

  // 1. 先检测 Android 套壳（放在桌面检测之前，避免 WebView 缺少 window.chrome 被误判桌面）
  if (checkAndroidApp(ua, isInAppBrowser)) {
    return {
      type: 'android-app',
      isApp: true,
      isWeb: false,
      isMobile: true,
      isDesktop: false,
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

  // 3. 检测鸿蒙套壳（需要在 Android 检测之前，因为鸿蒙的 UA 通常包含 Android）
  if (checkHarmonyOSApp(ua)) {
    return {
      type: 'harmonyos-app',
      isApp: true,
      isWeb: false,
      isMobile: true,
      isDesktop: false,
    };
  }

  // 4. 检测桌面端套壳 (Electron, Tauri, etc.)
  if (checkDesktopApp(ua)) {
    return {
      type: 'desktop-app',
      isApp: true,
      isWeb: false,
      isMobile: false,
      isDesktop: true,
    };
  }

  // 5. 默认为普通网页
  const isMobileWeb = /android|iphone|ipad|ipod|mobile/i.test(ua);
  return {
    type: 'web',
    isApp: false,
    isWeb: true,
    isMobile: isMobileWeb,
    isDesktop: !isMobileWeb,
    isWechatMiniProgram: false,
  };
}

/**
 * 检测是否为微信小程序环境
 */
function checkWechatMiniProgram(ua: string): boolean {
  const lowerUA = ua.toLowerCase();
  
  // 1. 通过 URL 参数检测 (微信有时会注入 _wxjs_environment)
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('_wxjs_environment') === 'miniprogram') {
      return true;
    }
  }

  // 2. 通过 UA 检测
  // 微信小程序的 UA 通常包含 MicroMessenger 和 miniProgram
  if (lowerUA.includes('micromessenger') && (lowerUA.includes('miniprogram') || (window as any).__wxjs_environment === 'miniprogram')) {
    return true;
  }

  // 2. 通过全局变量检测 (微信注入)
  if (typeof window !== 'undefined') {
    const gEnv = (window as any).__wxjs_environment;
    if (gEnv === 'miniprogram' || (window as any).isMiniprogram) {
      return true;
    }
  }

  return false;
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
 * 检测是否为鸿蒙套壳应用
 *
 * 鸿蒙系统（HarmonyOS）的 WebView 特征：
 * - UA 中包含 "HarmonyOS" 关键字
 * - UA 中包含 "Huawei" 或 "HONOR"（华为或荣耀设备）
 * - 某些情况下会有 "ohos" 标识（开源鸿蒙）
 */
function checkHarmonyOSApp(ua: string): boolean {
  // 1. 直接检测 HarmonyOS 关键字
  if (/harmonyos|ohos/i.test(ua)) {
    return true;
  }

  // 2. 检测华为/荣耀设备 + WebView 特征
  // 华为和荣耀设备上的浏览器通常会有特定的 UA 标识
  const isHuaweiOrHonor = /huawei|honor/i.test(ua);
  if (isHuaweiOrHonor) {
    // 检查是否是 WebView（没有完整的 Chrome 标识）
    const hasChrome = /chrome\/[\d.]+/i.test(ua);
    if (!hasChrome && /android/i.test(ua)) {
      return true;
    }
  }

  // 3. 检测鸿蒙特定的注入对象
  if ((window as any).HarmonyOS || (window as any).OHOSInterface) {
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
