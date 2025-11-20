// lib/architecture-modules/layers/third-party/payment/providers/abstract/stripe-provider.ts
// Stripe支付提供商抽象实现

import {
  PaymentOrder,
  PaymentResult,
  PaymentConfirmation,
  RefundResult,
} from "../../router";
import { BasePaymentProvider } from "./base-provider";

export interface StripeConfig {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  successUrl: string;
  cancelUrl: string;
}

export abstract class AbstractStripeProvider extends BasePaymentProvider {
  protected stripeConfig: StripeConfig;

  constructor(config: StripeConfig) {
    super(config);
    this.stripeConfig = config;
  }

  protected validateConfig(config: StripeConfig): void {
    if (!config.secretKey) throw new Error("Stripe secretKey is required");
    if (!config.publishableKey)
      throw new Error("Stripe publishableKey is required");
    if (!config.webhookSecret)
      throw new Error("Stripe webhookSecret is required");
    if (!config.successUrl) throw new Error("Stripe successUrl is required");
    if (!config.cancelUrl) throw new Error("Stripe cancelUrl is required");
  }

  async createPayment(order: PaymentOrder): Promise<PaymentResult> {
    try {
      this.validateOrder(order);

      // 处理货币转换 - Stripe支付使用美元
      const processedOrder = this.processOrderCurrency(order, "stripe");

      // 生成Stripe支付会话
      const session = await this.createStripeSession(processedOrder);

      return {
        success: true,
        paymentId: session.id,
        paymentUrl: session.url,
      };
    } catch (error) {
      return this.handleError(error, "Stripe createPayment");
    }
  }

  async confirmPayment(paymentId: string): Promise<PaymentConfirmation> {
    try {
      // 对于Stripe Checkout，paymentId实际上是session_id
      const session = await this.retrievePaymentSession(paymentId);

      return {
        success: session.payment_status === "paid",
        transactionId: session.id,
        amount: session.amount_total / 100, // Stripe金额以分为单位
        currency: session.currency.toUpperCase(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to confirm Stripe payment: ${errorMessage}`);
    }
  }

  async refundPayment(
    paymentId: string,
    amount: number
  ): Promise<RefundResult> {
    try {
      const refund = await this.createRefund(paymentId, amount);

      return {
        success: refund.status === "succeeded",
        refundId: refund.id,
        amount: refund.amount / 100,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to refund Stripe payment: ${errorMessage}`);
    }
  }

  // 抽象方法 - 由具体实现类提供
  protected abstract createStripeSession(order: PaymentOrder): Promise<any>;
  protected abstract retrievePaymentSession(sessionId: string): Promise<any>;
  protected abstract createRefund(
    paymentId: string,
    amount: number
  ): Promise<any>;

  /**
   * 验证Stripe回调签名
   */
  protected abstract verifyWebhookSignature(
    payload: string,
    signature: string
  ): boolean;

  /**
   * 处理Stripe回调
   */
  async handleWebhook(payload: string, signature: string): Promise<boolean> {
    // 验证签名
    if (!this.verifyWebhookSignature(payload, signature)) {
      throw new Error("Invalid Stripe webhook signature");
    }

    const event = JSON.parse(payload);

    switch (event.type) {
      case "checkout.session.completed":
        // 支付成功逻辑
        const session = event.data.object;
        // Stripe uses snake_case: payment_status
        return session.payment_status === "paid";

      case "payment_intent.payment_failed":
        // 支付失败逻辑
        return false;

      default:
        // 其他事件类型
        return true;
    }
  }

  /**
   * 创建Stripe Checkout会话参数
   */
  protected buildSessionParams(order: PaymentOrder): any {
    // 获取价格ID
    const priceId = this.getPriceId(order.planType, order.billingCycle);

    if (priceId) {
      // 使用预定义的价格ID
      return {
        payment_method_types: ["card"],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: "subscription", // 改为subscription模式
        // Stripe Checkout will substitute {CHECKOUT_SESSION_ID}
        success_url: `${this.stripeConfig.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: this.stripeConfig.cancelUrl,
        metadata: {
          userId: order.userId,
          planType: order.planType,
          billingCycle: order.billingCycle,
        },
      };
    } else {
      // 回退到动态价格创建（用于测试或没有价格ID的情况）
      return {
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: order.currency.toLowerCase(),
              product_data: {
                name: order.description,
              },
              unit_amount: this.formatAmount(order.amount, order.currency),
              recurring: {
                interval: order.billingCycle === "yearly" ? "year" : "month",
              },
            },
            quantity: 1,
          },
        ],
        mode: "subscription",
        // Include session_id for client-side confirmation
        success_url: `${this.stripeConfig.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: this.stripeConfig.cancelUrl,
        metadata: {
          userId: order.userId,
          planType: order.planType,
          billingCycle: order.billingCycle,
        },
      };
    }
  }

  /**
   * 根据计划类型和计费周期获取Stripe价格ID
   */
  protected getPriceId(planType: string, billingCycle: string): string | null {
    const priceMap: Record<string, Record<string, string>> = {
      pro: {
        monthly:
          process.env.STRIPE_PRO_MONTHLY_PRICE_ID ||
          "price_1SM3P5PvVD9JAxvV7R489iAe",
        yearly:
          process.env.STRIPE_PRO_ANNUAL_PRICE_ID ||
          "price_1SM3PwPvVD9JAxvVT7bkEWQo",
      },
    };

    return priceMap[planType]?.[billingCycle] || null;
  }
}
