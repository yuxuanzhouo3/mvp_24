// lib/architecture-modules/layers/third-party/payment/providers/abstract/wechat-provider.ts
// 微信支付提供商抽象实现

import {
  PaymentOrder,
  PaymentResult,
  PaymentConfirmation,
  RefundResult,
} from "../../router";
import { BasePaymentProvider } from "./base-provider";

export interface WechatConfig {
  appId: string;
  mchId: string; // 商户号
  privateKey: string;
  serialNo: string; // 证书序列号
  notifyUrl: string;
  apiv3PrivateKey?: string; // APIv3密钥
}

export abstract class AbstractWechatProvider extends BasePaymentProvider {
  protected wechatConfig: WechatConfig;

  constructor(config: WechatConfig) {
    super(config);
    this.wechatConfig = config;
  }

  protected validateConfig(config: WechatConfig): void {
    if (!config.appId) throw new Error("WeChat appId is required");
    if (!config.mchId) throw new Error("WeChat mchId is required");
    if (!config.privateKey) throw new Error("WeChat privateKey is required");
    if (!config.serialNo) throw new Error("WeChat serialNo is required");
    if (!config.notifyUrl) throw new Error("WeChat notifyUrl is required");
  }

  async createPayment(order: PaymentOrder): Promise<PaymentResult> {
    try {
      this.validateOrder(order);

      // 处理货币转换 - 微信支付使用人民币
      const processedOrder = this.processOrderCurrency(order, "wechat");

      // 生成微信支付订单参数
      const wechatOrder = await this.buildWechatOrder(processedOrder);

      // 调用微信支付API创建支付
      const result = await this.callWechatAPI(wechatOrder);

      return {
        success: true,
        paymentId: result.outTradeNo,
        paymentUrl: result.payUrl,
        qrCode: result.codeUrl,
      };
    } catch (error) {
      return this.handleError(error, "WeChat createPayment");
    }
  }

  async confirmPayment(paymentId: string): Promise<PaymentConfirmation> {
    try {
      // 查询支付状态
      const result = await this.queryPaymentStatus(paymentId);

      return {
        success: result.tradeState === "SUCCESS",
        transactionId: result.transactionId,
        amount: result.amount.total / 100, // 微信支付金额以分为单位
        currency: "CNY",
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to confirm WeChat payment: ${errorMessage}`);
    }
  }

  async refundPayment(
    paymentId: string,
    amount: number
  ): Promise<RefundResult> {
    try {
      const result = await this.callRefundAPI(paymentId, amount);

      return {
        success: result.returnCode === "SUCCESS",
        refundId: result.refundId,
        amount: result.refundFee / 100,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to refund WeChat payment: ${errorMessage}`);
    }
  }

  // 抽象方法 - 由具体实现类提供
  protected abstract buildWechatOrder(order: PaymentOrder): Promise<any>;
  protected abstract callWechatAPI(orderData: any): Promise<any>;
  protected abstract queryPaymentStatus(paymentId: string): Promise<any>;
  protected abstract callRefundAPI(
    paymentId: string,
    amount: number
  ): Promise<any>;

  /**
   * 验证微信支付回调签名
   */
  protected abstract verifyCallbackSignature(params: any): boolean;

  /**
   * 处理微信支付回调
   */
  async handleCallback(callbackData: any): Promise<boolean> {
    // 验证签名
    if (!this.verifyCallbackSignature(callbackData)) {
      throw new Error("Invalid WeChat callback signature");
    }

    // 处理支付结果
    const { outTradeNo, resultCode, totalFee } = callbackData;

    if (resultCode === "SUCCESS") {
      // 支付成功逻辑
      return true;
    }

    return false;
  }
}
