/**
 * App 下载配置文件
 * 根据部署区域（国内/国外）提供不同的下载链接或文件 ID
 */

export type PlatformType = "android" | "ios" | "windows" | "macos" | "linux";
export type MacOSArchitecture = "intel" | "apple-silicon";

export interface DownloadLink {
  platform: PlatformType;
  label: string;
  url?: string; // 备用链接，可选，优先读取 fileID
  fileID?: string; // 使用 CloudBase fileID
  arch?: MacOSArchitecture; // macOS 架构（intel 或 apple-silicon）
  fileName?: string; // 用于设置下载文件名
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
      fileName: "multigpt-china.apk",
    },
    {
      platform: "ios",
      label: "iOS 应用",
      fileID:
        process.env.CN_IOS_FILE_ID ||
        "cloud://your-bucket/downloads/multigpt-ios-cn.ipa",
      fileName: "multigpt-china.ipa",
    },
    {
      platform: "windows",
      label: "Windows 客户端",
      fileID:
        process.env.CN_WINDOWS_FILE_ID ||
        "cloud://your-bucket/downloads/multigpt-windows-cn.exe",
      fileName: "MultiGPT 1.0.0-china.exe",
    },
    {
      platform: "macos",
      label: "macOS 客户端 (Intel 芯片)",
      arch: "intel",
      fileID:
        process.env.CN_MACOS_INTEL_FILE_ID ||
        "cloud://your-bucket/downloads/multigpt-macos-intel-cn.dmg",
      fileName: "multigpt-china-pake-intel.dmg",
    },
    {
      platform: "macos",
      label: "macOS 客户端 (Apple Silicon)",
      arch: "apple-silicon",
      fileID:
        process.env.CN_MACOS_APPLE_SILICON_FILE_ID ||
        "cloud://your-bucket/downloads/multigpt-macos-apple-silicon-cn.dmg",
      fileName: "multigpt-china-pake.dmg",
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
      fileID:
        process.env.INTL_ANDROID_FILE_ID ||
        "cloud://your-intl-bucket/downloads/multigpt-android-intl.apk",
      fileName: "multigpt-android-intl.apk",
    },
    {
      platform: "ios",
      label: "iOS App",
      fileID:
        process.env.INTL_IOS_FILE_ID ||
        "cloud://your-intl-bucket/downloads/multigpt-ios-intl.ipa",
      fileName: "multigpt-ios-intl.ipa",
    },
    {
      platform: "windows",
      label: "Windows Client",
      fileID:
        process.env.INTL_WINDOWS_FILE_ID ||
        "cloud://your-intl-bucket/downloads/multigpt-windows-intl.exe",
      fileName: "multigpt-windows-intl.exe",
    },
    {
      platform: "macos",
      label: "macOS Client (Intel)",
      arch: "intel",
      fileID:
        process.env.INTL_MACOS_INTEL_FILE_ID ||
        "cloud://your-intl-bucket/downloads/multigpt-macos-intel-intl.dmg",
      fileName: "multigpt-macos-intel-intl.dmg",
    },
    {
      platform: "macos",
      label: "macOS Client (Apple Silicon)",
      arch: "apple-silicon",
      fileID:
        process.env.INTL_MACOS_APPLE_SILICON_FILE_ID ||
        "cloud://your-intl-bucket/downloads/multigpt-macos-apple-silicon-intl.dmg",
      fileName: "multigpt-macos-apple-silicon-intl.dmg",
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
