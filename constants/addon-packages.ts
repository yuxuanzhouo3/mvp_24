/**
 * 加油包商品配置
 * 支持图片和视频/音频额度的永久增量包
 *
 * 说明：
 * - 加油包额度永久有效，不随订阅周期重置
 * - 加油包额度存储在 users.wallet.addon_*_balance 字段
 * - 扣费时遵循 FEFO (最短有效期优先) 原则，先扣月度再扣加油包
 */

export type AddonPackageTier = "starter" | "standard" | "premium";

export interface AddonPackage {
  id: string; // 唯一标识
  tier: AddonPackageTier; // 档位
  name: string; // 英文名称
  nameZh: string; // 中文名称
  price: number; // 美元价格 (USD)
  priceZh: number; // 人民币价格 (CNY)
  imageCredits: number; // 图片额度
  videoAudioCredits: number; // 视频/音频额度
  description: string; // 英文描述
  descriptionZh: string; // 中文描述
  popular?: boolean; // 是否热门推荐
}

/**
 * 加油包商品列表 (三档)
 * - Starter:  ¥9.9  / $3.98 - 30张图 + 5个视频/音频
 * - Standard: ¥29.9 / $9.98 - 100张图 + 20个视频/音频 (推荐)
 * - Premium:  ¥69.9 / $29.98 - 300张图 + 60个视频/音频
 */
export const ADDON_PACKAGES: AddonPackage[] = [
  {
    id: "addon_starter",
    tier: "starter",
    name: "Starter Pack",
    nameZh: "入门加油包",
    price: 3.98,
    priceZh: 9.9,
    imageCredits: 30,
    videoAudioCredits: 5,
    description: "30 images + 5 video/audio credits",
    descriptionZh: "30张图片 + 5个视频/音频",
  },
  {
    id: "addon_standard",
    tier: "standard",
    name: "Standard Pack",
    nameZh: "标准加油包",
    price: 9.98,
    priceZh: 29.9,
    imageCredits: 100,
    videoAudioCredits: 20,
    description: "100 images + 20 video/audio credits",
    descriptionZh: "100张图片 + 20个视频/音频",
    popular: true,
  },
  {
    id: "addon_premium",
    tier: "premium",
    name: "Premium Pack",
    nameZh: "高级加油包",
    price: 29.98,
    priceZh: 69.9,
    imageCredits: 300,
    videoAudioCredits: 60,
    description: "300 images + 60 video/audio credits",
    descriptionZh: "300张图片 + 60个视频/音频",
  },
];

/**
 * 根据 ID 获取加油包配置
 */
export function getAddonPackageById(id: string): AddonPackage | undefined {
  return ADDON_PACKAGES.find((pkg) => pkg.id === id);
}

/**
 * 根据档位获取加油包配置
 */
export function getAddonPackageByTier(
  tier: AddonPackageTier
): AddonPackage | undefined {
  return ADDON_PACKAGES.find((pkg) => pkg.tier === tier);
}

/**
 * 产品类型定义
 * - SUBSCRIPTION: 订阅套餐 (Basic/Pro/Enterprise)
 * - ADDON: 加油包 (永久额度)
 * - ONETIME: 一次性支付 (保留兼容)
 */
export type ProductType = "SUBSCRIPTION" | "ADDON" | "ONETIME";

/**
 * 根据产品 ID 判断产品类型
 */
export function getProductType(productId: string): ProductType {
  if (productId.startsWith("addon_")) {
    return "ADDON";
  }
  if (
    productId === "basic" ||
    productId === "pro" ||
    productId === "enterprise"
  ) {
    return "SUBSCRIPTION";
  }
  return "ONETIME";
}

/**
 * 获取加油包在创建支付订单时的描述
 */
export function getAddonDescription(
  pkg: AddonPackage,
  isZh: boolean
): string {
  return isZh
    ? `${pkg.nameZh} - ${pkg.imageCredits}张图 + ${pkg.videoAudioCredits}个视频/音频`
    : `${pkg.name} - ${pkg.imageCredits} images + ${pkg.videoAudioCredits} video/audio`;
}
