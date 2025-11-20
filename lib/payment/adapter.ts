/**
 * 支付服务适配器
 *
 * 根据 DEPLOY_REGION 环境变量选择使用哪个支付服务提供商：
 * - CN（中国）：使用支付宝
 * - INTL（国际）：使用 PayPal
 */

import { isChinaRegion, RegionConfig } from "@/lib/config/region";

/**
 * 订单接口（统一数据结构）
 */
export interface PaymentOrder {
  id: string;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "cancelled";
  userId: string;
  createdAt: Date;
  completedAt?: Date;
  metadata?: Record<string, any>;
}

/**
 * 支付结果接口
 */
export interface PaymentResult {
  success: boolean;
  orderId: string;
  transactionId?: string;
  error?: string;
}

/**
 * 支付适配器接口
 */
export interface PaymentAdapter {
  /**
   * 创建支付订单
   * @param amount 支付金额（单位：元）
   * @param userId 用户 ID
   * @returns 支付订单信息（包含支付链接或表单）
   */
  createOrder(
    amount: number,
    userId: string
  ): Promise<{
    orderId: string;
    paymentUrl?: string;
    formHtml?: string;
  }>;

  /**
   * 验证支付回调
   * @param params 支付回调参数
   * @returns 支付结果
   */
  verifyPayment(params: any): Promise<PaymentResult>;

  /**
   * 查询订单状态
   * @param orderId 订单 ID
   * @returns 订单信息
   */
  queryOrder(orderId: string): Promise<PaymentOrder>;

  /**
   * 取消订单
   * @param orderId 订单 ID
   */
  cancelOrder(orderId: string): Promise<void>;
}

/**
 * PayPal 支付适配器（国际版）
 */
class PayPalAdapter implements PaymentAdapter {
  private clientId: string;
  private clientSecret: string;
  private environment: string;

  constructor() {
    this.clientId = process.env.PAYPAL_CLIENT_ID || "";
    this.clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
    this.environment = process.env.PAYPAL_ENVIRONMENT || "sandbox";
  }

  async createOrder(
    amount: number,
    userId: string
  ): Promise<{
    orderId: string;
    paymentUrl?: string;
  }> {
    // 调用 PayPal API 创建订单
    const response = await fetch("/api/payment/paypal/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        userId,
        currency: "USD",
      }),
    });

    if (!response.ok) {
      throw new Error("创建 PayPal 订单失败");
    }

    const data = await response.json();

    return {
      orderId: data.orderId,
      paymentUrl: data.approvalUrl,
    };
  }

  async verifyPayment(params: any): Promise<PaymentResult> {
    // 验证 PayPal 回调
    const response = await fetch("/api/payment/paypal/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      return {
        success: false,
        orderId: params.orderId || "",
        error: "验证失败",
      };
    }

    const data = await response.json();

    return {
      success: data.verified,
      orderId: data.orderId,
      transactionId: data.transactionId,
    };
  }

  async queryOrder(orderId: string): Promise<PaymentOrder> {
    const response = await fetch(
      `/api/payment/paypal/query?orderId=${orderId}`
    );

    if (!response.ok) {
      throw new Error("查询订单失败");
    }

    return await response.json();
  }

  async cancelOrder(orderId: string): Promise<void> {
    await fetch(`/api/payment/paypal/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ orderId }),
    });
  }
}

/**
 * 支付宝适配器（中国版）
 */
class AlipayAdapter implements PaymentAdapter {
  private appId: string;
  private gatewayUrl: string;
  private isSandbox: boolean;

  constructor() {
    this.appId = process.env.ALIPAY_APP_ID || "";
    this.gatewayUrl =
      process.env.ALIPAY_GATEWAY_URL || "https://openapi.alipay.com/gateway.do";
    this.isSandbox = process.env.ALIPAY_SANDBOX === "true";
  }

  async createOrder(
    amount: number,
    userId: string
  ): Promise<{
    orderId: string;
    formHtml?: string;
  }> {
    // 调用支付宝 API 创建订单
    const response = await fetch("/api/payment/alipay/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        userId,
        currency: "CNY",
      }),
    });

    if (!response.ok) {
      throw new Error("创建支付宝订单失败");
    }

    const data = await response.json();

    return {
      orderId: data.orderId,
      formHtml: data.formHtml, // 支付宝返回 HTML 表单
    };
  }

  async verifyPayment(params: any): Promise<PaymentResult> {
    // 验证支付宝回调签名
    const response = await fetch("/api/payment/alipay/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      return {
        success: false,
        orderId: params.out_trade_no || "",
        error: "验证失败",
      };
    }

    const data = await response.json();

    return {
      success: data.verified,
      orderId: data.orderId,
      transactionId: data.tradeNo,
    };
  }

  async queryOrder(orderId: string): Promise<PaymentOrder> {
    const response = await fetch(
      `/api/payment/alipay/query?orderId=${orderId}`
    );

    if (!response.ok) {
      throw new Error("查询订单失败");
    }

    return await response.json();
  }

  async cancelOrder(orderId: string): Promise<void> {
    await fetch(`/api/payment/alipay/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ orderId }),
    });
  }
}

/**
 * 创建支付适配器实例
 * 根据 DEPLOY_REGION 环境变量自动选择
 */
export function createPaymentAdapter(): PaymentAdapter {
  if (isChinaRegion()) {
    console.log("💰 使用支付宝支付（中国版）");
    return new AlipayAdapter();
  } else {
    console.log("💰 使用 PayPal 支付（国际版）");
    return new PayPalAdapter();
  }
}

/**
 * 全局支付实例（单例模式）
 */
let paymentInstance: PaymentAdapter | null = null;

/**
 * 获取支付实例
 */
export function getPayment(): PaymentAdapter {
  if (!paymentInstance) {
    paymentInstance = createPaymentAdapter();
  }
  return paymentInstance;
}

/**
 * 获取支付提供商名称
 */
export function getPaymentProviderName(): string {
  return RegionConfig.payment.primary;
}

/**
 * 获取支付货币
 */
export function getPaymentCurrency(): string {
  return isChinaRegion() ? "CNY" : "USD";
}

/**
 * 格式化金额显示
 */
export function formatAmount(amount: number): string {
  const currency = getPaymentCurrency();

  if (currency === "CNY") {
    return `¥${amount.toFixed(2)}`;
  } else {
    return `$${amount.toFixed(2)}`;
  }
}
