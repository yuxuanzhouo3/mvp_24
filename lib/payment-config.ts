/**
 * 统一的支付配置
 * 所有关于价格、货币的定义都在这里，只定义一次，避免重复
 */

export type BillingCycle = "monthly" | "yearly";
export type PaymentMethod = "stripe" | "paypal" | "alipay" | "wechat";

/**
 * 定价表（唯一的价格定义来源）
 */
const PRICING_DATA = {
  CNY: {
    monthly: 0.01,
    yearly: 0.01,
  },
  USD: {
    monthly: 9.99,
    yearly: 99.99,
  },
} as const;

/**
 * 导出定价表供前端显示
 */
export const PRICING_TABLE = PRICING_DATA;

/**
 * 根据支付方式获取定价信息
 * @param method 支付方式
 * @returns 定价配置（货币和金额）
 */
export function getPricingByMethod(method: PaymentMethod) {
  // 支付宝和微信使用人民币，其他使用美元
  const currency = method === "alipay" || method === "wechat" ? "CNY" : "USD";

  return {
    currency,
    monthly: PRICING_DATA[currency].monthly,
    yearly: PRICING_DATA[currency].yearly,
  };
}

/**
 * 根据货币类型和账单周期获取金额
 * @param currency 货币类型
 * @param billingCycle 账单周期
 * @returns 金额
 */
export function getAmountByCurrency(
  currency: string,
  billingCycle: BillingCycle
): number {
  const prices = PRICING_DATA[currency as keyof typeof PRICING_DATA];
  return prices ? prices[billingCycle] : 0;
}

/**
 * 定义会员天数
 */
export function getDaysByBillingCycle(billingCycle: BillingCycle): number {
  return billingCycle === "monthly" ? 30 : 365;
}
