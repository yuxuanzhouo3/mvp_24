// lib/architecture-modules/layers/third-party/payment/services/payment-service.ts
// 支付业务服务 - 处理支付相关的业务逻辑

import {
  PaymentOrder,
  PaymentResult,
  PaymentConfirmation,
  RefundResult,
} from "../router";

export interface PaymentRecord {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  originalAmount?: number; // 原始金额（转换前）
  originalCurrency?: string; // 原始货币（转换前）
  status: "pending" | "completed" | "failed" | "refunded";
  paymentMethod: string;
  externalId?: string; // 第三方支付平台的订单ID
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentRepository {
  save(
    payment: Omit<PaymentRecord, "id" | "createdAt" | "updatedAt">
  ): Promise<PaymentRecord>;
  findById(id: string): Promise<PaymentRecord | null>;
  findByExternalId(externalId: string): Promise<PaymentRecord | null>;
  updateStatus(id: string, status: PaymentRecord["status"]): Promise<void>;
  findByUserId(userId: string): Promise<PaymentRecord[]>;
}

export abstract class AbstractPaymentService {
  protected repository: PaymentRepository;

  // 汇率配置 - 与BasePaymentProvider保持一致
  protected static readonly EXCHANGE_RATES = {
    USD_TO_CNY: 7.2, // 1 USD = 7.2 CNY
  } as const;

  constructor(repository: PaymentRepository) {
    this.repository = repository;
  }

  /**
   * 货币转换 - 根据支付方式自动转换货币
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
      return amount * AbstractPaymentService.EXCHANGE_RATES.USD_TO_CNY;
    }

    // CNY 转 USD
    if (fromCurrency === "CNY" && targetCurrency === "USD") {
      return amount / AbstractPaymentService.EXCHANGE_RATES.USD_TO_CNY;
    }

    // 不支持的货币转换
    throw new Error(
      `Unsupported currency conversion: ${fromCurrency} to ${targetCurrency}`
    );
  }

  /**
   * 根据支付方式确定目标货币
   * @param paymentMethod 支付方式
   * @param originalCurrency 原始货币
   * @returns 目标货币
   */
  protected getTargetCurrency(
    paymentMethod: string,
    originalCurrency: string
  ): string {
    // 支付宝和微信支付使用人民币
    if (paymentMethod === "alipay" || paymentMethod === "wechat") {
      return "CNY";
    }

    // Stripe支付使用美元
    if (paymentMethod === "stripe") {
      return "USD";
    }

    // 默认保持原始货币
    return originalCurrency;
  }

  /**
   * 处理支付订单的货币转换
   * @param order 原始支付订单
   * @param paymentMethod 支付方式
   * @returns 处理后的支付订单
   */
  protected processOrderCurrency(
    order: PaymentOrder,
    paymentMethod: string
  ): PaymentOrder {
    const targetCurrency = this.getTargetCurrency(
      paymentMethod,
      order.currency
    );

    if (order.currency !== targetCurrency) {
      const convertedAmount = this.convertCurrency(
        order.amount,
        order.currency,
        targetCurrency
      );

      console.log(
        `Payment Service - Currency conversion: ${order.amount} ${
          order.currency
        } -> ${convertedAmount.toFixed(2)} ${targetCurrency} (Rate: ${
          AbstractPaymentService.EXCHANGE_RATES.USD_TO_CNY
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
   * 处理支付订单
   */
  async processPayment(
    order: PaymentOrder,
    paymentMethod: string
  ): Promise<PaymentResult> {
    try {
      // 处理货币转换
      const processedOrder = this.processOrderCurrency(order, paymentMethod);

      // 1. 创建支付记录
      const paymentRecord = await this.repository.save({
        userId: processedOrder.userId,
        amount: processedOrder.amount,
        currency: processedOrder.currency,
        originalAmount: order.amount,
        originalCurrency: order.currency,
        status: "pending",
        paymentMethod,
      });

      // 2. 调用具体的支付处理逻辑
      const result = await this.doProcessPayment(processedOrder, paymentRecord);

      // 3. 更新支付状态
      if (result.success) {
        await this.repository.updateStatus(paymentRecord.id, "completed");
        // 更新外部ID
        if (result.paymentId) {
          await this.updateExternalId(paymentRecord.id, result.paymentId);
        }
      } else {
        await this.repository.updateStatus(paymentRecord.id, "failed");
      }

      return result;
    } catch (error) {
      console.error("Payment processing failed:", error);
      throw error;
    }
  }

  /**
   * 确认支付状态
   */
  async confirmPayment(paymentId: string): Promise<PaymentConfirmation> {
    try {
      const payment = await this.repository.findById(paymentId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      // 调用具体的确认逻辑
      const confirmation = await this.doConfirmPayment(payment);

      // 更新状态
      if (confirmation.success) {
        await this.repository.updateStatus(paymentId, "completed");
      }

      return confirmation;
    } catch (error) {
      console.error("Payment confirmation failed:", error);
      throw error;
    }
  }

  /**
   * 处理退款
   */
  async processRefund(
    paymentId: string,
    amount?: number
  ): Promise<RefundResult> {
    try {
      const payment = await this.repository.findById(paymentId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      if (payment.status !== "completed") {
        throw new Error("Can only refund completed payments");
      }

      const refundAmount = amount || payment.amount;

      // 调用具体的退款逻辑
      const result = await this.doProcessRefund(payment, refundAmount);

      // 更新状态
      if (result.success) {
        await this.repository.updateStatus(paymentId, "refunded");
      }

      return result;
    } catch (error) {
      console.error("Refund processing failed:", error);
      throw error;
    }
  }

  /**
   * 处理支付回调
   */
  async handleCallback(externalId: string, callbackData: any): Promise<void> {
    try {
      const payment = await this.repository.findByExternalId(externalId);
      if (!payment) {
        throw new Error("Payment not found for callback");
      }

      // 调用具体的回调处理逻辑
      const success = await this.doHandleCallback(payment, callbackData);

      // 更新状态
      await this.repository.updateStatus(
        payment.id,
        success ? "completed" : "failed"
      );

      // 执行支付成功后的业务逻辑
      if (success) {
        await this.onPaymentSuccess(payment);
      }
    } catch (error) {
      console.error("Callback handling failed:", error);
      throw error;
    }
  }

  /**
   * 获取用户支付历史
   */
  async getUserPayments(userId: string): Promise<PaymentRecord[]> {
    return this.repository.findByUserId(userId);
  }

  // 抽象方法 - 由具体实现类提供
  protected abstract doProcessPayment(
    order: PaymentOrder,
    payment: PaymentRecord
  ): Promise<PaymentResult>;
  protected abstract doConfirmPayment(
    payment: PaymentRecord
  ): Promise<PaymentConfirmation>;
  protected abstract doProcessRefund(
    payment: PaymentRecord,
    amount: number
  ): Promise<RefundResult>;
  protected abstract doHandleCallback(
    payment: PaymentRecord,
    callbackData: any
  ): Promise<boolean>;
  protected abstract updateExternalId(
    paymentId: string,
    externalId: string
  ): Promise<void>;

  /**
   * 支付成功后的业务逻辑钩子
   */
  protected abstract onPaymentSuccess(payment: PaymentRecord): Promise<void>;
}
