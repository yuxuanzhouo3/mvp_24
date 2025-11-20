// lib/architecture-modules/layers/third-party/payment/router.ts - 支付路由器
import { RegionType } from "../../../core/types";

export interface PaymentProvider {
  createPayment(order: PaymentOrder): Promise<PaymentResult>;
  confirmPayment(paymentId: string): Promise<PaymentConfirmation>;
  refundPayment(paymentId: string, amount: number): Promise<RefundResult>;
}

export interface PaymentOrder {
  amount: number;
  currency: string;
  description: string;
  userId: string;
  planType: string;
  billingCycle: "monthly" | "yearly";
  metadata?: Record<string, any>; // 添加可选的 metadata 字段
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  paymentUrl?: string;
  qrCode?: string;
  error?: string;
}

export interface PaymentConfirmation {
  success: boolean;
  transactionId: string;
  amount: number;
  currency: string;
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  amount: number;
}

export class PaymentRouter {
  private providers: Map<string, PaymentProvider> = new Map();

  registerProvider(method: string, provider: PaymentProvider): void {
    this.providers.set(method, provider);
  }

  async createPayment(
    region: RegionType,
    order: PaymentOrder
  ): Promise<PaymentResult> {
    const methods = this.getPaymentMethodsForRegion(region);

    for (const method of methods) {
      const provider = this.providers.get(method);
      if (provider) {
        try {
          const result = await provider.createPayment(order);
          if (result.success) {
            return result;
          }
        } catch (error) {
          console.error(`Payment method ${method} failed:`, error);
          continue;
        }
      }
    }

    return {
      success: false,
      error: "No available payment method",
    };
  }

  private getPaymentMethodsForRegion(region: RegionType): string[] {
    switch (region) {
      case RegionType.CHINA:
        return ["wechat", "alipay"];
      case RegionType.EUROPE:
        return []; // GDPR合规，禁用支付
      default:
        return ["stripe", "paypal"];
    }
  }

  getAvailableMethods(region: RegionType): string[] {
    return this.getPaymentMethodsForRegion(region);
  }
}

// 导出单例实例
export const paymentRouter = new PaymentRouter();
