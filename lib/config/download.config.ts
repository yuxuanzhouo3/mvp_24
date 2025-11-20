/**
 * App 下载配置文件
 * 根据部署区域（国内/国外）提供不同的下载链接或文件 ID
 */

export type PlatformType = "android" | "ios" | "windows" | "macos" | "linux";
export type MacOSArchitecture = "intel" | "apple-silicon";

export interface DownloadLink {
  platform: PlatformType;
  label: string;
  url?: string; // 国际版使用 URL
  fileID?: string; // 国内版使用 CloudBase fileID
  arch?: MacOSArchitecture; // macOS 架构（intel 或 apple-silicon）
}

export interface RegionDownloadConfig {
  region: "CN" | "INTL";
  downloads: DownloadLink[];
}

/**
 * 国内版本下载配置
 * 使用 CloudBase fileID，后端会通过 API 端点处理下载
 */
const chinaDownloads: RegionDownloadConfig = {
  region: "CN",
  downloads: [
    {
      platform: "android",
      label: "Android 应用",
      fileID:
        process.env.CN_ANDROID_FILE_ID ||
        "cloud://your-bucket/downloads/multigpt-android-cn.apk",
    },
    {
      platform: "ios",
      label: "iOS 应用",
      fileID:
        process.env.CN_IOS_FILE_ID ||
        "cloud://your-bucket/downloads/multigpt-ios-cn.ipa",
    },
    {
      platform: "windows",
      label: "Windows 客户端",
      fileID:
        process.env.CN_WINDOWS_FILE_ID ||
        "cloud://your-bucket/downloads/multigpt-windows-cn.exe",
    },
    {
      platform: "macos",
      label: "macOS 客户端 (Intel 芯片)",
      arch: "intel",
      fileID:
        process.env.CN_MACOS_INTEL_FILE_ID ||
        "cloud://your-bucket/downloads/multigpt-macos-intel-cn.dmg",
    },
    {
      platform: "macos",
      label: "macOS 客户端 (Apple Silicon)",
      arch: "apple-silicon",
      fileID:
        process.env.CN_MACOS_APPLE_SILICON_FILE_ID ||
        "cloud://your-bucket/downloads/multigpt-macos-apple-silicon-cn.dmg",
    },
  ],
};

/**
 * 国际版本下载配置
 * 从环境变量读取下载 URL
 */
const internationalDownloads: RegionDownloadConfig = {
  region: "INTL",
  downloads: [
    {
      platform: "android",
      label: "Android App",
      url:
        process.env.INTL_ANDROID_URL ||
        "https://play.google.com/store/apps/details?id=com.multigpt.app",
    },
    {
      platform: "ios",
      label: "iOS App",
      url:
        process.env.INTL_IOS_URL ||
        "https://apps.apple.com/app/multigpt/id123456789",
    },
    {
      platform: "windows",
      label: "Windows Client",
      url:
        process.env.INTL_WINDOWS_URL ||
        "https://github.com/your-org/multigpt/releases/download/v3.0.0/multigpt-windows.exe",
    },
    {
      platform: "macos",
      label: "macOS Client (Intel)",
      arch: "intel",
      url:
        process.env.INTL_MACOS_INTEL_URL ||
        "https://github.com/your-org/multigpt/releases/download/v3.0.0/multigpt-macos-intel.dmg",
    },
    {
      platform: "macos",
      label: "macOS Client (Apple Silicon)",
      arch: "apple-silicon",
      url:
        process.env.INTL_MACOS_APPLE_SILICON_URL ||
        "https://github.com/your-org/multigpt/releases/download/v3.0.0/multigpt-macos-apple-silicon.dmg",
    },
  ],
};

/**
 * 根据区域获取下载配置
 */
export function getDownloadConfig(isChina: boolean): RegionDownloadConfig {
  return isChina ? chinaDownloads : internationalDownloads;
}

/**
 * 根据平台获取下载链接
 * @param platform 平台类型
 * @param isChina 是否为国内版
 * @param arch macOS 架构（仅当 platform 为 "macos" 时有效）
 */
export function getDownloadUrl(
  platform: PlatformType,
  isChina: boolean,
  arch?: MacOSArchitecture
): string | null {
  const config = getDownloadConfig(isChina);
  let download: DownloadLink | undefined;

  if (platform === "macos" && arch) {
    // 对于 macOS，根据架构查找
    download = config.downloads.find((d) => d.platform === platform && d.arch === arch);
  } else if (platform === "macos") {
    // 如果没有指定架构，返回第一个 macOS 版本（通常是 Intel）
    download = config.downloads.find((d) => d.platform === platform);
  } else {
    // 其他平台直接查找
    download = config.downloads.find((d) => d.platform === platform);
  }

  // 国际版返回 URL，国内版返回 fileID
  if (isChina) {
    return download?.fileID || null;
  }
  return download?.url || null;
}

/**
 * 根据平台获取完整的下载链接信息
 * @param platform 平台类型
 * @param isChina 是否为国内版
 * @param arch macOS 架构（仅当 platform 为 "macos" 时有效）
 */
export function getDownloadInfo(
  platform: PlatformType,
  isChina: boolean,
  arch?: MacOSArchitecture
): DownloadLink | null {
  const config = getDownloadConfig(isChina);

  if (platform === "macos" && arch) {
    // 对于 macOS，根据架构查找
    return config.downloads.find((d) => d.platform === platform && d.arch === arch) || null;
  } else if (platform === "macos") {
    // 如果没有指定架构，返回第一个 macOS 版本
    return config.downloads.find((d) => d.platform === platform) || null;
  } else {
    // 其他平台直接查找
    return config.downloads.find((d) => d.platform === platform) || null;
  }
}

/**
 * 检测用户设备平台
 */
export function detectUserPlatform(): PlatformType | null {
  if (typeof window === "undefined") return null;

  const ua = navigator.userAgent.toLowerCase();

  // 移动端检测
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";

  // 桌面端检测
  if (/windows/i.test(ua)) return "windows";
  if (/mac os x/i.test(ua)) return "macos";
  if (/linux/i.test(ua)) return "linux";

  return null;
}

/**
 * 获取某个平台的所有版本（包括不同架构）
 */
export function getDownloadsByPlatform(
  platform: PlatformType,
  isChina: boolean
): DownloadLink[] {
  const config = getDownloadConfig(isChina);
  return config.downloads.filter((d) => d.platform === platform);
}

/**
 * 获取推荐下载（根据用户设备）
 */
export function getRecommendedDownload(isChina: boolean): DownloadLink | null {
  const platform = detectUserPlatform();
  if (!platform) return null;

  const config = getDownloadConfig(isChina);
  return config.downloads.find((d) => d.platform === platform) || null;
}
