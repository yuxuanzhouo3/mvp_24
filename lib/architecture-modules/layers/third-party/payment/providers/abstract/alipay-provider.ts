// lib/architecture-modules/layers/third-party/payment/providers/abstract/alipay-provider.ts
// 支付宝支付提供商抽象实现

import {
  PaymentOrder,
  PaymentResult,
  PaymentConfirmation,
  RefundResult,
} from "../../router";
import { BasePaymentProvider } from "./base-provider";

export interface AlipayConfig {
  appId: string;
  privateKey: string;
  publicKey: string;
  notifyUrl: string;
  returnUrl?: string;
  gatewayUrl?: string; // 支付宝网关地址
}

export abstract class AbstractAlipayProvider extends BasePaymentProvider {
  protected alipayConfig: AlipayConfig;

  constructor(config: AlipayConfig) {
    super(config);
    this.alipayConfig = config;
  }

  protected validateConfig(config: AlipayConfig): void {
    if (!config.appId) throw new Error("Alipay appId is required");
    if (!config.privateKey) throw new Error("Alipay privateKey is required");
    if (!config.publicKey) throw new Error("Alipay publicKey is required");
    if (!config.notifyUrl) throw new Error("Alipay notifyUrl is required");
  }

  async createPayment(order: PaymentOrder): Promise<PaymentResult> {
    try {
      this.validateOrder(order);

      // 处理货币转换 - 支付宝使用人民币
      const processedOrder = this.processOrderCurrency(order, "alipay");

      // 生成支付宝订单参数
      const alipayOrder = await this.buildAlipayOrder(processedOrder);

      // 调用支付宝API创建支付
      const result = await this.callAlipayAPI(alipayOrder);

      return {
        success: true,
        paymentId: result.outTradeNo,
        paymentUrl: result.payUrl,
        qrCode: result.qrCode,
      };
    } catch (error) {
      return this.handleError(error, "Alipay createPayment");
    }
  }

  async confirmPayment(paymentId: string): Promise<PaymentConfirmation> {
    try {
      // 查询支付状态
      const result = await this.queryPaymentStatus(paymentId);

      return {
        success: result.tradeStatus === "TRADE_SUCCESS",
        transactionId: result.tradeNo,
        amount: result.totalAmount,
        currency: "CNY",
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to confirm Alipay payment: ${errorMessage}`);
    }
  }

  async refundPayment(
    paymentId: string,
    amount: number
  ): Promise<RefundResult> {
    try {
      const result = await this.callRefundAPI(paymentId, amount);

      return {
        success: result.code === "10000",
        refundId: result.outRefundNo,
        amount: result.refundAmount,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to refund Alipay payment: ${errorMessage}`);
    }
  }

  // 抽象方法 - 由具体实现类提供
  protected abstract buildAlipayOrder(order: PaymentOrder): Promise<any>;
  protected abstract callAlipayAPI(orderData: any): Promise<any>;
  protected abstract queryPaymentStatus(paymentId: string): Promise<any>;
  protected abstract callRefundAPI(
    paymentId: string,
    amount: number
  ): Promise<any>;

  /**
   * 验证支付宝回调签名
   */
  protected abstract verifyCallbackSignature(params: any): boolean;

  /**
   * 处理支付宝回调
   */
  async handleCallback(callbackData: any): Promise<boolean> {
    // 验证签名
    if (!this.verifyCallbackSignature(callbackData)) {
      throw new Error("Invalid Alipay callback signature");
    }

    // 处理支付结果
    const { outTradeNo, tradeStatus, totalAmount } = callbackData;

    if (tradeStatus === "TRADE_SUCCESS") {
      // 支付成功逻辑
      return true;
    }

    return false;
  }
}
