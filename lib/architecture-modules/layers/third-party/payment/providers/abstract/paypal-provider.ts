// lib/architecture-modules/layers/third-party/payment/providers/abstract/paypal-provider.ts
// PayPal支付提供商抽象基类

import { BasePaymentProvider } from "./base-provider";
import {
  PaymentOrder,
  PaymentResult,
  PaymentConfirmation,
  RefundResult,
} from "../../router";

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  proMonthlyPlanId: string;
  proAnnualPlanId: string;
  teamMonthlyPlanId: string;
  teamAnnualPlanId: string;
  environment: "sandbox" | "production";
}

export abstract class AbstractPayPalProvider extends BasePaymentProvider {
  protected paypalConfig: PayPalConfig;

  constructor(config: any) {
    // Set paypalConfig first before calling super()
    const paypalConfig: PayPalConfig = {
      clientId: config.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || "",
      clientSecret:
        config.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_CLIENT_SECRET || "",
      proMonthlyPlanId:
        config.PAYPAL_PRO_MONTHLY_PLAN_ID ||
        process.env.PAYPAL_PRO_MONTHLY_PLAN_ID ||
        "",
      proAnnualPlanId:
        config.PAYPAL_PRO_ANNUAL_PLAN_ID ||
        process.env.PAYPAL_PRO_ANNUAL_PLAN_ID ||
        "",
      teamMonthlyPlanId:
        config.PAYPAL_TEAM_MONTHLY_PLAN_ID ||
        process.env.PAYPAL_TEAM_MONTHLY_PLAN_ID ||
        "",
      teamAnnualPlanId:
        config.PAYPAL_TEAM_ANNUAL_PLAN_ID ||
        process.env.PAYPAL_TEAM_ANNUAL_PLAN_ID ||
        "",
      environment: (config.PAYPAL_ENVIRONMENT ||
        process.env.PAYPAL_ENVIRONMENT ||
        "sandbox") as "sandbox" | "production",
    };

    // Call super with config to initialize BasePaymentProvider
    super(config);

    // Set paypalConfig after super() call
    this.paypalConfig = paypalConfig;
  }

  protected validateConfig(config: any): void {
    // Validate PayPal configuration directly from config parameter
    const clientId = config.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || "";
    const clientSecret = config.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_CLIENT_SECRET || "";

    if (!clientId) {
      throw new Error("PayPal client ID is required");
    }
    if (!clientSecret) {
      throw new Error("PayPal client secret is required");
    }
  }

  protected getPlanId(
    planType: string,
    billingCycle: "monthly" | "yearly"
  ): string {
    switch (planType) {
      case "pro":
        return billingCycle === "monthly"
          ? this.paypalConfig.proMonthlyPlanId
          : this.paypalConfig.proAnnualPlanId;
      case "team":
        return billingCycle === "monthly"
          ? this.paypalConfig.teamMonthlyPlanId
          : this.paypalConfig.teamAnnualPlanId;
      default:
        throw new Error(`Unsupported plan type: ${planType}`);
    }
  }

  protected getBaseUrl(): string {
    return this.paypalConfig.environment === "production"
      ? "https://api.paypal.com"
      : "https://api.sandbox.paypal.com";
  }

  protected async getAccessToken(): Promise<string> {
    const auth = Buffer.from(
      `${this.paypalConfig.clientId}:${this.paypalConfig.clientSecret}`
    ).toString("base64");

    // 创建 AbortController 用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

    try {
      const response = await fetch(`${this.getBaseUrl()}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get PayPal access token: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data.access_token;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('PayPal API request timeout. Please check your network connection and PayPal credentials.');
      }

      throw new Error(`PayPal authentication failed: ${error.message}`);
    }
  }

  abstract createSubscription(order: PaymentOrder): Promise<any>;
  abstract cancelSubscription(subscriptionId: string): Promise<boolean>;
  abstract getSubscriptionDetails(subscriptionId: string): Promise<any>;
}
