export interface PricingPlan {
  id: string;
  name: string;
  nameZh?: string;
  price: string;
  priceZh?: string;
  annualPrice: string;
  annualPriceZh?: string;
  period: string;
  features: string[];
  popular?: boolean;
  // 配额配置
  dailyExternalLimit: number;
  monthlyImageLimit: number;
  monthlyVideoAudioLimit: number;
  contextWindow: number;
}

/**
 * 订阅套餐配置
 * - 文案保持英文为默认，国内版（zh）在组件中按当前语言切换
 * - 预置中英文双语，便于前端直接选择
 */
export const pricingPlans: PricingPlan[] = [
  {
    id: "basic",
    name: "Basic",
    nameZh: "基础版",
    price: "$9.98",
    priceZh: "￥29.90",
    annualPrice: "$6.99", // billed annually, ~30% off
    annualPriceZh: "￥20.90",
    period: "month",
    features: [
      "50 external text chats per day|外部模型文本对话每天50次",
      "Multimodal: 100 images + 20 video/audio per month|多模态模型对话（每月100张图，20个视频/音频）",
      "Chat history|历史聊天记录",
      "Remove ads|移除广告",
      "50-message context window|50条上下文支持",
    ],
    dailyExternalLimit: 50,
    monthlyImageLimit: 100,
    monthlyVideoAudioLimit: 20,
    contextWindow: 50,
  },
  {
    id: "pro",
    name: "Pro",
    nameZh: "专业版",
    price: "$39.98",
    priceZh: "￥99.90",
    annualPrice: "$27.99",
    annualPriceZh: "￥69.90",
    period: "month",
    features: [
      "Everything in Basic|包含基础版的所有内容",
      "200 external text chats per day|外部模型文本对话每天200次",
      "Multimodal: 500 images + 100 video/audio per month|多模态模型对话（每月500张图，100个视频/音频）",
      "One-click chat export|一键导出对话",
      "100-message context window|100条上下文支持",
    ],
    popular: true,
    dailyExternalLimit: 200,
    monthlyImageLimit: 500,
    monthlyVideoAudioLimit: 100,
    contextWindow: 100,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    nameZh: "企业版",
    price: "$99.98",
    priceZh: "￥199.90",
    annualPrice: "$69.99",
    annualPriceZh: "￥139.90",
    period: "month",
    features: [
      "Everything in Pro|包含专业版的所有内容",
      "2000 external text chats per day|外部模型文本对话每天2000次",
      "Multimodal: 1500 images + 200 video/audio per month|多模态模型对话（每月1500张图，200个视频/音频）",
      "Unlimited add-ons of previous packages|可无限加购/续费之前的任意套餐",
      "300-message context window|300条上下文支持",
    ],
    dailyExternalLimit: 2000,
    monthlyImageLimit: 1500,
    monthlyVideoAudioLimit: 200,
    contextWindow: 300,
  },
];

/**
 * 免费套餐配额
 */
export const FREE_PLAN_LIMITS = {
  dailyExternalLimit: 10,
  monthlyImageLimit: 30,
  monthlyVideoAudioLimit: 5,
  contextWindow: 20,
};

/**
 * 根据套餐 ID 获取套餐配置
 */
export function getPlanById(planId: string): PricingPlan | undefined {
  return pricingPlans.find((p) => p.id === planId.toLowerCase());
}

/**
 * 根据套餐名称获取套餐配置（支持中英文）
 */
export function getPlanByName(name: string): PricingPlan | undefined {
  const nameLower = name.toLowerCase();
  return pricingPlans.find(
    (p) =>
      p.name.toLowerCase() === nameLower ||
      p.nameZh === name ||
      p.id === nameLower
  );
}

/**
 * 获取套餐价格（数值）
 */
export function getPlanPrice(
  planId: string,
  period: "monthly" | "annual" = "monthly",
  isZh: boolean = false
): number {
  const plan = getPlanById(planId);
  if (!plan) return 0;

  const priceStr =
    period === "annual"
      ? isZh
        ? plan.annualPriceZh
        : plan.annualPrice
      : isZh
        ? plan.priceZh
        : plan.price;

  // 移除货币符号并转换为数字
  return parseFloat(priceStr?.replace(/[^0-9.]/g, "") || "0");
}

/**
 * 计算升级差价
 * @param currentPlan 当前套餐 ID
 * @param targetPlan 目标套餐 ID
 * @param remainingDays 剩余天数
 * @param period 订阅周期
 * @param isZh 是否使用人民币
 */
export function calculateUpgradePrice(
  currentPlan: string,
  targetPlan: string,
  remainingDays: number,
  period: "monthly" | "annual" = "monthly",
  isZh: boolean = false
): number {
  const currentPrice = getPlanPrice(currentPlan, period, isZh);
  const targetPrice = getPlanPrice(targetPlan, period, isZh);

  const daysInPeriod = period === "annual" ? 365 : 30;
  const currentDailyPrice = currentPrice / daysInPeriod;
  const targetDailyPrice = targetPrice / daysInPeriod;

  const upgradePrice = (targetDailyPrice - currentDailyPrice) * remainingDays;

  // 确保最低支付金额
  return Math.max(0.01, Math.round(upgradePrice * 100) / 100);
}
