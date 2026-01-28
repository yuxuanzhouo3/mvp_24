// lib/architecture-modules/layers/third-party/payment/providers/abstract/base-provider.ts
// 支付提供商抽象基类 - 提供通用的支付逻辑和错误处理

import {
  PaymentProvider,
  PaymentOrder,
  PaymentResult,
  PaymentConfirmation,
  RefundResult,
} from "../../router";

export abstract class BasePaymentProvider implements PaymentProvider {
  protected config: any;

  // 汇率配置 - 使用固定汇率确保价格稳定性
  protected static readonly EXCHANGE_RATES = {
    USD_TO_CNY: 7.2, // 1 USD = 7.2 CNY
  } as const;

  constructor(config: any) {
    this.config = config;
    this.validateConfig(config);
  }

  abstract createPayment(order: PaymentOrder): Promise<PaymentResult>;
  abstract confirmPayment(paymentId: string): Promise<PaymentConfirmation>;
  abstract refundPayment(
    paymentId: string,
    amount: number
  ): Promise<RefundResult>;

  /**
   * 验证配置参数
   */
  protected abstract validateConfig(config: any): void;

  /**
   * 生成唯一的支付ID
   */
  protected generatePaymentId(): string {
    return `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 格式化金额（转换为分/厘等最小单位）
   */
  protected formatAmount(amount: number, currency: string): number {
    // 对于人民币和美元，通常需要转换为分
    if (currency === "CNY" || currency === "USD") {
      return Math.round(amount * 100);
    }
    return amount;
  }

  /**
   * 货币转换 - 根据支付提供商类型自动转换货币
   * @param amount 原始金额
   * @param fromCurrency 原始货币
   * @param targetCurrency 目标货币
   * @returns 转换后的金额
   */
  protected convertCurrency(
    amount: number,
    fromCurrency: string,
    targetCurrency: string
  ): number {
    if (fromCurrency === targetCurrency) {
      return amount;
    }

    // USD 转 CNY
    if (fromCurrency === "USD" && targetCurrency === "CNY") {
      return amount * BasePaymentProvider.EXCHANGE_RATES.USD_TO_CNY;
    }

    // CNY 转 USD
    if (fromCurrency === "CNY" && targetCurrency === "USD") {
      return amount / BasePaymentProvider.EXCHANGE_RATES.USD_TO_CNY;
    }

    // 不支持的货币转换
    throw new Error(
      `Unsupported currency conversion: ${fromCurrency} to ${targetCurrency}`
    );
  }

  /**
   * 根据支付提供商类型确定目标货币
   * @param providerType 支付提供商类型
   * @param originalCurrency 原始货币
   * @returns 目标货币
   */
  protected getTargetCurrency(
    providerType: string,
    originalCurrency: string
  ): string {
    // 支付宝和微信支付使用人民币
    if (providerType === "alipay" || providerType === "wechat") {
      return "CNY";
    }

    // Stripe支付使用美元
    if (providerType === "stripe") {
      return "USD";
    }

    // 默认保持原始货币
    return originalCurrency;
  }

  /**
   * 处理支付订单的货币转换
   * @param order 原始支付订单
   * @param providerType 支付提供商类型
   * @returns 处理后的支付订单（不修改原始订单）
   */
  protected processOrderCurrency(
    order: PaymentOrder,
    providerType: string
  ): PaymentOrder {
    const targetCurrency = this.getTargetCurrency(providerType, order.currency);

    if (order.currency !== targetCurrency) {
      const convertedAmount = this.convertCurrency(
        order.amount,
        order.currency,
        targetCurrency
      );

      console.log(
        `Currency conversion: ${order.amount} ${
          order.currency
        } -> ${convertedAmount.toFixed(2)} ${targetCurrency} (Rate: ${
          BasePaymentProvider.EXCHANGE_RATES.USD_TO_CNY
        })`
      );

      return {
        ...order,
        amount: convertedAmount,
        currency: targetCurrency,
      };
    }

    return order;
  }

  /**
   * 验证支付订单参数
   */
  protected validateOrder(order: PaymentOrder): void {
    if (!order.amount || order.amount <= 0) {
      throw new Error("Invalid payment amount");
    }
    if (!order.currency) {
      throw new Error("Currency is required");
    }
    if (!order.userId) {
      throw new Error("User ID is required");
    }
    if (!order.description) {
      throw new Error("Payment description is required");
    }
  }

  /**
   * 统一的错误处理
   */
  protected handleError(error: any, context: string): PaymentResult {
    console.error(`Payment error in ${context}:`, error);
    return {
      success: false,
      error: error.message || "Payment processing failed",
    };
  }
}
