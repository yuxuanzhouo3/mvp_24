// lib/architecture-modules/layers/third-party/payment/providers/stripe-provider.ts
// Stripe支付提供商具体实现

import Stripe from "stripe";
import {
  PaymentOrder,
  PaymentResult,
  PaymentConfirmation,
  RefundResult,
} from "../router";
import { AbstractStripeProvider } from "./abstract/stripe-provider";

export class StripeProvider extends AbstractStripeProvider {
  private stripe: Stripe | null = null;

  constructor(config: any) {
    super({
      secretKey:
        config.STRIPE_SECRET_KEY ||
        process.env.STRIPE_SECRET_KEY ||
        "sk_test_example",
      publishableKey:
        config.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
        "pk_test_example",
      webhookSecret:
        config.STRIPE_WEBHOOK_SECRET ||
        process.env.STRIPE_WEBHOOK_SECRET ||
        "whsec_example",
      successUrl: `${
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        "http://localhost:3000"
      }/payment/success`,
      cancelUrl: `${
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        "http://localhost:3000"
      }/payment/cancel`,
    });

    // 只有在有有效密钥时才初始化Stripe
    if (
      this.stripeConfig.secretKey &&
      this.stripeConfig.secretKey !== "sk_test_example"
    ) {
      this.stripe = new Stripe(this.stripeConfig.secretKey);
    }
  }

  protected async createStripeSession(order: PaymentOrder): Promise<any> {
    if (!this.stripe) {
      throw new Error("Stripe not initialized - missing API key");
    }

    const sessionParams = this.buildSessionParams(order);
    const session = await this.stripe.checkout.sessions.create(sessionParams);
    return session;
  }

  protected async retrievePaymentSession(sessionId: string): Promise<any> {
    if (!this.stripe) {
      throw new Error("Stripe not initialized - missing API key");
    }

    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    return session;
  }

  protected async createRefund(
    paymentId: string,
    amount: number
  ): Promise<any> {
    if (!this.stripe) {
      throw new Error("Stripe not initialized - missing API key");
    }

    const refund = await this.stripe.refunds.create({
      payment_intent: paymentId,
      amount: Math.round(amount * 100), // Stripe使用分作为单位
    });
    return refund;
  }

  protected verifyWebhookSignature(
    payload: string,
    signature: string
  ): boolean {
    if (!this.stripe) {
      return false;
    }

    try {
      this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.stripeConfig.webhookSecret
      );
      return true;
    } catch (error) {
      console.error("Stripe webhook signature verification failed:", error);
      return false;
    }
  }

  /**
   * 创建一次性支付(不是订阅)
   */
  async createOnetimePayment(order: PaymentOrder): Promise<PaymentResult> {
    try {
      if (!this.stripe) {
        throw new Error("Stripe not initialized - missing API key");
      }

      this.validateOrder(order);

      // 创建一次性支付会话(使用 payment mode 而不是 subscription mode)
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: order.currency.toLowerCase(),
              product_data: {
                name: order.description,
                description: `${
                  order.billingCycle === "monthly" ? "30 days" : "365 days"
                } premium access`,
              },
              unit_amount: Math.round(order.amount * 100), // Stripe 使用分为单位
            },
            quantity: 1,
          },
        ],
        mode: "payment", // 关键: payment 模式表示一次性支付
        success_url: `${this.stripeConfig.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: this.stripeConfig.cancelUrl,
        metadata: {
          userId: order.userId,
          paymentType: "onetime",
          days:
            order.metadata?.days ||
            (order.billingCycle === "monthly" ? "30" : "365"),
          billingCycle: order.billingCycle,
        },
      });

      return {
        success: true,
        paymentId: session.id,
        paymentUrl: session.url || "",
      };
    } catch (error) {
      return this.handleError(error, "Stripe createOnetimePayment");
    }
  }
}
