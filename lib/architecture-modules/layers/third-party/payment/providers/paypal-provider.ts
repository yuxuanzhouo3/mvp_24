// lib/architecture-modules/layers/third-party/payment/providers/paypal-provider.ts
// PayPal支付提供商具体实现

import { AbstractPayPalProvider } from "./abstract/paypal-provider";
import {
  PaymentOrder,
  PaymentResult,
  PaymentConfirmation,
  RefundResult,
} from "../router";

export class PayPalProvider extends AbstractPayPalProvider {
  async createPayment(order: PaymentOrder): Promise<PaymentResult> {
    try {
      this.validateOrder(order);

      // 获取访问令牌
      const accessToken = await this.getAccessToken();

      // 创建订阅
      const subscription = await this.createSubscription(order);

      return {
        success: true,
        paymentId: subscription.id,
        paymentUrl: subscription.links?.find(
          (link: any) => link.rel === "approve"
        )?.href,
      };
    } catch (error) {
      return this.handleError(error, "createPayment");
    }
  }

  async confirmPayment(paymentId: string): Promise<PaymentConfirmation> {
    try {
      const accessToken = await this.getAccessToken();

      const response = await fetch(
        `${this.getBaseUrl()}/v1/billing/subscriptions/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to get subscription details");
      }

      const subscription = await response.json();

      return {
        success: true,
        transactionId: subscription.id,
        amount: parseFloat(
          subscription.billing_info?.last_payment?.amount?.value || "0"
        ),
        currency:
          subscription.billing_info?.last_payment?.amount?.currency_code ||
          "USD",
      };
    } catch (error) {
      console.error("PayPal confirm payment error:", error);
      return {
        success: false,
        transactionId: "",
        amount: 0,
        currency: "USD",
      };
    }
  }

  async refundPayment(
    paymentId: string,
    amount: number
  ): Promise<RefundResult> {
    try {
      const accessToken = await this.getAccessToken();

      // PayPal 退款需要先获取交易ID，然后进行退款
      const subscription = await this.getSubscriptionDetails(paymentId);

      if (!subscription.billing_info?.last_payment?.transaction_id) {
        throw new Error("No transaction found for refund");
      }

      const refundResponse = await fetch(
        `${this.getBaseUrl()}/v2/payments/captures/${
          subscription.billing_info.last_payment.transaction_id
        }/refund`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: {
              value: amount.toFixed(2),
              currency_code:
                subscription.billing_info.last_payment.amount.currency_code,
            },
          }),
        }
      );

      if (!refundResponse.ok) {
        throw new Error("Refund request failed");
      }

      const refund = await refundResponse.json();

      return {
        success: true,
        refundId: refund.id,
        amount: parseFloat(refund.amount.value),
      };
    } catch (error) {
      console.error("PayPal refund error:", error);
      return {
        success: false,
        refundId: "",
        amount: 0,
      };
    }
  }

  async createSubscription(order: PaymentOrder): Promise<any> {
    const accessToken = await this.getAccessToken();
    const planId = this.getPlanId(order.planType, order.billingCycle);

    const subscriptionData = {
      plan_id: planId,
      subscriber: {
        name: {
          given_name: "User", // 这里可以从用户信息获取
        },
        email_address: "user@example.com", // 这里可以从用户信息获取
      },
      application_context: {
        brand_name: "MultiGPT Platform",
        locale: "en-US",
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        payment_method: {
          payer_selected: "PAYPAL",
          payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED",
        },
        return_url: `${
          process.env.NODE_ENV === "production"
            ? process.env.APP_URL || "https://multigpt-platform.com"
            : "http://localhost:3000"
        }/payment/success`,
        cancel_url: `${
          process.env.NODE_ENV === "production"
            ? process.env.APP_URL || "https://multigpt-platform.com"
            : "http://localhost:3000"
        }/payment/cancel`,
      },
    };

    const response = await fetch(
      `${this.getBaseUrl()}/v1/billing/subscriptions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(subscriptionData),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`PayPal subscription creation failed: ${errorData}`);
    }

    return await response.json();
  }

  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken();

      const response = await fetch(
        `${this.getBaseUrl()}/v1/billing/subscriptions/${subscriptionId}/cancel`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reason: "User requested cancellation",
          }),
        }
      );

      return response.ok;
    } catch (error) {
      console.error("PayPal cancel subscription error:", error);
      return false;
    }
  }

  async getSubscriptionDetails(subscriptionId: string): Promise<any> {
    const accessToken = await this.getAccessToken();

    const response = await fetch(
      `${this.getBaseUrl()}/v1/billing/subscriptions/${subscriptionId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to get subscription details");
    }

    return await response.json();
  }

  /**
   * 创建一次性支付订单(不是订阅)
   */
  async createOnetimePayment(order: PaymentOrder): Promise<PaymentResult> {
    try {
      this.validateOrder(order);

      const accessToken = await this.getAccessToken();

      // 创建 PayPal Order (一次性支付,不是 Subscription)
      const orderData = {
        intent: "CAPTURE",
        purchase_units: [
          {
            description: order.description,
            amount: {
              currency_code: order.currency,
              value: order.amount.toFixed(2),
            },
            custom_id: order.userId, // 存储用户ID用于后续webhook
          },
        ],
        application_context: {
          brand_name: "MultiGPT Platform",
          locale: "en-US",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: `${
            process.env.NODE_ENV === "production"
              ? process.env.APP_URL || "https://multigpt-platform.com"
              : "http://localhost:3000"
          }/payment/success`,
          cancel_url: `${
            process.env.NODE_ENV === "production"
              ? process.env.APP_URL || "https://multigpt-platform.com"
              : "http://localhost:3000"
          }/payment/cancel`,
        },
      };

      const response = await fetch(`${this.getBaseUrl()}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`PayPal order creation failed: ${errorData}`);
      }

      const paypalOrder = await response.json();

      return {
        success: true,
        paymentId: paypalOrder.id,
        paymentUrl: paypalOrder.links?.find(
          (link: any) => link.rel === "approve"
        )?.href,
      };
    } catch (error) {
      return this.handleError(error, "createOnetimePayment");
    }
  }

  /**
   * 捕获一次性支付订单
   */
  async captureOnetimePayment(orderId: string): Promise<any> {
    try {
      const accessToken = await this.getAccessToken();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

      try {
        const response = await fetch(
          `${this.getBaseUrl()}/v2/checkout/orders/${orderId}/capture`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error("PayPal capture failed:", {
            status: response.status,
            statusText: response.statusText,
            error: errorData,
            orderId,
          });
          throw new Error(
            `Failed to capture PayPal order: ${response.status} ${
              errorData.message || errorData.error || response.statusText
            }`
          );
        }

        return await response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(
            "PayPal capture request timeout. The order may have expired. Please try creating a new payment."
          );
        }
        throw error;
      }
    } catch (error) {
      console.error("PayPal capture error:", error);
      throw error;
    }
  }
}
