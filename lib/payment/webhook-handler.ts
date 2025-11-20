// lib/payment/webhook-handler.ts - 统一webhook处理器
import { supabaseAdmin } from "../supabase-admin";
import { getDatabase } from "../auth-utils";
import { isChinaRegion } from "../config/region";
import {
  logger,
  logError,
  logInfo,
  logWarn,
  logSecurityEvent,
  logBusinessEvent,
} from "../logger";

export interface WebhookEvent {
  id: string;
  provider: "paypal" | "stripe" | "alipay" | "wechat";
  eventType: string;
  eventData: any;
  processed: boolean;
  createdAt: string;
  processedAt?: string;
}

export class WebhookHandler {
  private static instance: WebhookHandler;

  static getInstance(): WebhookHandler {
    if (!WebhookHandler.instance) {
      WebhookHandler.instance = new WebhookHandler();
    }
    return WebhookHandler.instance;
  }

  /**
   * 处理webhook事件
   */
  async processWebhook(
    provider: string,
    eventType: string,
    eventData: any
  ): Promise<boolean> {
    const startTime = Date.now();

    try {
      // 生成事件ID（基于提供商和事件数据）
      const eventId = this.generateEventId(provider, eventData);

      logInfo(`Processing webhook: ${provider} ${eventType}`, {
        eventId,
        provider,
        eventType,
        livemode: eventData.livemode,
      });

      // 检查事件是否已处理（幂等性）
      const existingEvent = await this.getProcessedEvent(eventId);
      if (existingEvent) {
        logInfo(`Webhook event already processed, skipping`, { eventId });
        return true;
      }

      // 记录事件
      await this.recordEvent(eventId, provider, eventType, eventData);

      // 根据提供商和事件类型处理
      const success = await this.handleEvent(provider, eventType, eventData);

      // 标记为已处理
      if (success) {
        await this.markEventProcessed(eventId);
        logInfo(`Webhook processed successfully`, {
          eventId,
          provider,
          eventType,
          duration: `${Date.now() - startTime}ms`,
        });
      } else {
        logError(`Webhook processing failed`, undefined, {
          eventId,
          provider,
          eventType,
          duration: `${Date.now() - startTime}ms`,
        });
      }

      return success;
    } catch (error) {
      logError(`Webhook processing error`, error as Error, {
        provider,
        eventType,
        duration: `${Date.now() - startTime}ms`,
      });
      return false;
    }
  }

  /**
   * 生成事件唯一ID
   */
  private generateEventId(provider: string, eventData: any): string {
    let uniqueKey = "";

    switch (provider) {
      case "paypal":
        // 🔧 PayPal修复：优先使用 transmissionId（最可靠的唯一标识）
        // transmissionId 是 PayPal 服务器为每个 webhook 分配的唯一ID
        // 即使事件内容相同，transmissionId 也不同
        if (eventData._paypal_transmission_id) {
          uniqueKey = eventData._paypal_transmission_id;
        } else {
          // 备选：使用事件ID
          uniqueKey =
            eventData.id || eventData.resource?.id || JSON.stringify(eventData);
        }
        break;
      case "stripe":
        uniqueKey =
          eventData.id ||
          eventData.data?.object?.id ||
          JSON.stringify(eventData);
        break;
      case "alipay":
        uniqueKey =
          eventData.out_trade_no ||
          eventData.trade_no ||
          JSON.stringify(eventData);
        break;
      case "wechat":
        uniqueKey =
          eventData.out_trade_no ||
          eventData.transaction_id ||
          JSON.stringify(eventData);
        break;
      default:
        uniqueKey = JSON.stringify(eventData);
    }

    return `${provider}_${uniqueKey}`;
  }

  /**
   * 检查事件是否已处理
   */
  private async getProcessedEvent(
    eventId: string
  ): Promise<WebhookEvent | null> {
    try {
      if (isChinaRegion()) {
        // CloudBase 用户
        const db = getDatabase();
        const result = await db
          .collection("webhook_events")
          .where({
            id: eventId,
            processed: true,
          })
          .get();

        if (result.data && result.data.length > 0) {
          return result.data[0];
        }
        return null;
      } else {
        // Supabase 用户
        const { data, error } = await supabaseAdmin
          .from("webhook_events")
          .select("*")
          .eq("id", eventId)
          .eq("processed", true)
          .maybeSingle();

        if (error && error.code !== "PGRST116") {
          logError("Error checking processed event", error, { eventId });
          return null;
        }

        return data;
      }
    } catch (error) {
      logError("Error getting processed event", error as Error, { eventId });
      return null;
    }
  }

  /**
   * 记录webhook事件
   */
  private async recordEvent(
    eventId: string,
    provider: string,
    eventType: string,
    eventData: any
  ): Promise<void> {
    try {
      if (isChinaRegion()) {
        // CloudBase 用户
        const db = getDatabase();

        // 先检查是否存在
        const existing = await db
          .collection("webhook_events")
          .where({ id: eventId })
          .get();

        if (existing.data && existing.data.length > 0) {
          // 更新现有记录
          await db
            .collection("webhook_events")
            .doc(existing.data[0]._id)
            .update({
              provider,
              event_type: eventType,
              event_data: eventData,
              processed: false,
              updated_at: new Date().toISOString(),
            });
        } else {
          // 创建新记录
          await db.collection("webhook_events").add({
            id: eventId,
            provider,
            event_type: eventType,
            event_data: eventData,
            processed: false,
            created_at: new Date().toISOString(),
          });
        }
      } else {
        // Supabase 用户
        const { error } = await supabaseAdmin.from("webhook_events").upsert({
          id: eventId,
          provider,
          event_type: eventType,
          event_data: eventData,
          processed: false,
          created_at: new Date().toISOString(),
        });

        if (error) {
          logError("Error recording webhook event", error, {
            eventId,
            provider,
            eventType,
          });
          throw error;
        }
      }
    } catch (error) {
      logError("Error recording webhook event", error as Error, {
        eventId,
        provider,
        eventType,
      });
      throw error;
    }
  }

  /**
   * 标记事件为已处理
   */
  private async markEventProcessed(eventId: string): Promise<void> {
    try {
      if (isChinaRegion()) {
        // CloudBase 用户
        const db = getDatabase();

        const result = await db
          .collection("webhook_events")
          .where({ id: eventId })
          .get();

        if (result.data && result.data.length > 0) {
          await db.collection("webhook_events").doc(result.data[0]._id).update({
            processed: true,
            processed_at: new Date().toISOString(),
          });
        }
      } else {
        // Supabase 用户
        const { error } = await supabaseAdmin
          .from("webhook_events")
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
          })
          .eq("id", eventId);

        if (error) {
          logError("Error marking event processed", error, { eventId });
        }
      }
    } catch (error) {
      logError("Error marking event processed", error as Error, { eventId });
    }
  }

  /**
   * 处理具体事件
   */
  private async handleEvent(
    provider: string,
    eventType: string,
    eventData: any
  ): Promise<boolean> {
    try {
      switch (provider) {
        case "paypal":
          return await this.handlePayPalEvent(eventType, eventData);
        case "stripe":
          return await this.handleStripeEvent(eventType, eventData);
        case "alipay":
          return await this.handleAlipayEvent(eventType, eventData);
        case "wechat":
          return await this.handleWechatEvent(eventType, eventData);
        default:
          logWarn(`Unknown provider: ${provider}`, { eventType, eventData });
          return false;
      }
    } catch (error) {
      logError(`Error handling ${provider} event`, error as Error, {
        provider,
        eventType,
      });
      return false;
    }
  }

  /**
   * 处理PayPal事件
   */
  private async handlePayPalEvent(
    eventType: string,
    eventData: any
  ): Promise<boolean> {
    const resource = eventData.resource || {};

    switch (eventType) {
      case "PAYMENT.SALE.COMPLETED":
      case "PAYMENT.CAPTURE.COMPLETED":
        // ✅ 修复:移除 CHECKOUT.ORDER.APPROVED,只处理真正的支付完成事件
        // 原因:一次PayPal支付会触发两个webhook:
        // 1. CHECKOUT.ORDER.APPROVED (订单批准,钱还没扣)
        // 2. PAYMENT.CAPTURE.COMPLETED (支付完成,钱已到账)
        // 如果两个都处理,会导致会员时间被重复增加
        return await this.handlePaymentSuccess("paypal", resource);

      case "CHECKOUT.ORDER.APPROVED":
        // ✅ 只记录日志,不处理支付成功逻辑(避免重复增加会员时间)
        logInfo("PayPal order approved, waiting for capture completion", {
          eventType,
          orderId: resource.id,
        });
        return true;

      case "BILLING.SUBSCRIPTION.ACTIVATED":
        return await this.handlePaymentSuccess("paypal", resource);

      case "BILLING.SUBSCRIPTION.CANCELLED":
        return await this.handleSubscriptionCancelled("paypal", resource);

      case "BILLING.SUBSCRIPTION.SUSPENDED":
        return await this.handleSubscriptionSuspended("paypal", resource);

      default:
        logInfo(`Unhandled PayPal event: ${eventType}`, {
          eventType,
          resource,
        });
        return true; // 不处理的事件也算成功
    }
  }

  /**
   * 处理Stripe事件
   */
  private async handleStripeEvent(
    eventType: string,
    eventData: any
  ): Promise<boolean> {
    const data = eventData.data?.object || {};

    switch (eventType) {
      case "checkout.session.completed":
        return await this.handleStripeCheckoutCompleted(data);

      case "customer.subscription.created":
        return await this.handleStripeSubscriptionCreated(data);

      case "customer.subscription.updated":
        return await this.handleStripeSubscriptionUpdated(data);

      case "customer.subscription.deleted":
        return await this.handleStripeSubscriptionCancelled(data);

      case "invoice.payment_succeeded":
        return await this.handleStripeInvoicePaymentSucceeded(data);

      case "invoice.payment_failed":
        return await this.handleStripeInvoicePaymentFailed(data);

      default:
        logInfo(`Unhandled Stripe event: ${eventType}`, { eventType, data });
        return true;
    }
  }

  /**
   * 处理支付宝事件
   */
  private async handleAlipayEvent(
    eventType: string,
    eventData: any
  ): Promise<boolean> {
    switch (eventType) {
      case "TRADE_SUCCESS":
      case "TRADE_FINISHED":
        return await this.handlePaymentSuccess("alipay", eventData);

      default:
        logInfo(`Unhandled Alipay event: ${eventType}`, {
          eventType,
          eventData,
        });
        return true;
    }
  }

  /**
   * 处理微信支付事件
   */
  private async handleWechatEvent(
    eventType: string,
    eventData: any
  ): Promise<boolean> {
    switch (eventType) {
      case "SUCCESS":
        return await this.handlePaymentSuccess("wechat", eventData);

      default:
        logInfo(`Unhandled WeChat event: ${eventType}`, {
          eventType,
          eventData,
        });
        return true;
    }
  }

  /**
   * 处理支付成功事件
   */
  private async handlePaymentSuccess(
    provider: string,
    data: any
  ): Promise<boolean> {
    console.log("🔥🔥🔥 [WebhookHandler handlePaymentSuccess] CALLED", {
      provider,
      dataId: data.id,
      dataKeys: Object.keys(data).slice(0, 10),
    });

    try {
      let subscriptionId = "";
      let userId = "";
      let amount = 0;
      let currency = "USD";
      let days = 0; // ✅ 从payments表读取，不再硬编码推断

      // 根据提供商提取数据
      let paypalOrderId = ""; // ✅ 新增:用于查找pending payment的Order ID

      switch (provider) {
        case "paypal":
          // PayPal 不同事件类型的数据结构不同
          subscriptionId = data.billing_agreement_id || data.id;

          // ✅ 提取Order ID (用于查找pending payment)
          // PAYMENT.CAPTURE.COMPLETED事件中,supplementary_data包含order_id
          if (data.supplementary_data?.related_ids?.order_id) {
            paypalOrderId = data.supplementary_data.related_ids.order_id;
          }

          // 记录 PayPal 数据以便调试
          logInfo("PayPal payment success data", {
            subscriptionId,
            dataKeys: Object.keys(data),
            hasAmount: !!data.amount,
            hasBillingInfo: !!data.billing_info,
            hasPurchaseUnits: !!data.purchase_units,
            hasCaptures: !!data.captures,
            id: data.id,
            eventType: data.event_type || "unknown",
          });

          // 处理 CHECKOUT.ORDER.APPROVED 事件（一次性支付）
          if (data.purchase_units && data.purchase_units.length > 0) {
            const purchaseUnit = data.purchase_units[0];
            userId = purchaseUnit.custom_id || purchaseUnit.reference_id || "";

            // 从 purchase_units 获取金额信息
            if (purchaseUnit.amount) {
              amount = parseFloat(purchaseUnit.amount.value || "0");
              currency = purchaseUnit.amount.currency_code || "USD";
            }

            logInfo("PayPal CHECKOUT.ORDER.APPROVED data extracted", {
              subscriptionId,
              userId,
              amount,
              currency,
              hasCustomId: !!purchaseUnit.custom_id,
              hasReferenceId: !!purchaseUnit.reference_id,
            });
          }
          // 处理 captures 数组（如果存在）
          else if (data.captures && data.captures.length > 0) {
            const capture = data.captures[0];
            userId = capture.custom_id || data.custom_id || "";

            amount = parseFloat(capture.amount?.value || "0");
            currency = capture.amount?.currency_code || "USD";

            logInfo("PayPal capture data extracted", {
              subscriptionId,
              userId,
              amount,
              currency,
              captureId: capture.id,
              captureStatus: capture.status,
            });
          }
          // 处理直接包含 custom_id 的支付事件（如 PAYMENT.CAPTURE.COMPLETED）
          else if (data.custom_id) {
            userId = data.custom_id;

            // 从直接的 amount 字段获取金额信息
            if (data.amount) {
              amount = parseFloat(
                data.amount.value || data.amount.total || "0"
              );
              currency =
                data.amount.currency_code || data.amount.currency || "USD";
            }

            logInfo("PayPal direct custom_id data extracted", {
              subscriptionId,
              userId,
              amount,
              currency,
              hasAmount: !!data.amount,
              status: data.status,
            });
          }
          // 处理传统的订阅激活事件
          else {
            // 从订阅中查找用户ID（需要额外的查询）
            const paypalUser = await this.findUserBySubscriptionId(
              subscriptionId
            );
            userId = paypalUser?.userId || "";

            // 对于 BILLING.SUBSCRIPTION.ACTIVATED，可能没有 amount 字段
            // 需要从计划或订阅详情中获取
            amount = parseFloat(
              data.amount?.total ||
                data.billing_info?.last_payment?.amount?.value ||
                "0"
            );
            currency =
              data.amount?.currency ||
              data.billing_info?.last_payment?.amount?.currency_code ||
              "USD";

            // 如果还是没有金额，可能需要从 plan 中获取
            if (amount === 0 && data.plan_id) {
              logWarn(
                "No amount found in PayPal webhook data, will skip payment record",
                {
                  subscriptionId,
                  planId: data.plan_id,
                }
              );
              // 对于订阅激活事件，如果没有实际支付金额，只更新订阅状态，不创建支付记录
              amount = 0;
            }
          }
          break;

        case "stripe":
          subscriptionId = data.subscription || data.id;
          userId = data.metadata?.userId || data.customer;
          amount = (data.amount_total || 0) / 100; // Stripe使用分
          currency = data.currency?.toUpperCase() || "USD";
          break;

        case "alipay":
          subscriptionId = data.out_trade_no;
          // ✅ 修复：passback_params 是支付宝原样返回的字符串，不是对象
          // 我们在创建支付时通过 passback_params 传递了 userId
          userId = data.passback_params || "";
          amount = parseFloat(data.total_amount || "0");
          currency = "CNY";
          break;

        case "wechat":
          subscriptionId = data.out_trade_no;
          userId = data.attach?.userId || ""; // 需要在创建时传递
          amount = (data.amount?.total || 0) / 100; // 微信使用分
          currency = "CNY";
          break;
      }

      if (!userId || !subscriptionId) {
        logError(
          `Missing userId or subscriptionId for ${provider} payment`,
          undefined,
          {
            provider,
            subscriptionId,
            userId,
            dataStructure: {
              hasId: !!data.id,
              hasBillingAgreementId: !!data.billing_agreement_id,
              keys: Object.keys(data).join(", "),
            },
          }
        );
        return false;
      }

      // ✅ 新增：从payments表读取已存储的天数信息
      // ⚠️ 注意：支付宝webhook中的 out_trade_no（商户订单号）可能与payments表中的transaction_id不同
      // payments表中存的可能是支付宝支付ID(trade_no)或商户订单号(out_trade_no)，需要两个都查
      // 修复：不仅查pending状态，也要查completed状态的payment（避免错过已更新的记录）
      try {
        let pendingPayment: any = null;

        if (isChinaRegion()) {
          // CloudBase用户：查询支付记录（不限制status）
          const db = getDatabase();

          // 首先用 transaction_id 查询（不限制status）
          let result = await db
            .collection("payments")
            .where({
              transaction_id: subscriptionId, // out_trade_no
            })
            .orderBy("created_at", "desc")
            .limit(1)
            .get();

          pendingPayment = result.data?.[0] || null;

          // 如果没找到，对于支付宝，还需要尝试用 out_trade_no 字段查询
          if (!pendingPayment && provider === "alipay") {
            // 尝试用 out_trade_no 字段直接查询
            result = await db
              .collection("payments")
              .where({
                out_trade_no: subscriptionId,
              })
              .orderBy("created_at", "desc")
              .limit(1)
              .get();

            pendingPayment = result.data?.[0] || null;

            if (pendingPayment) {
              logInfo(`Found payment using out_trade_no field`, {
                subscriptionId,
                provider,
                paymentStatus: pendingPayment.status,
              });
            }
          }
        } else {
          // Supabase用户：查询支付记录（不限制status）
          let { data: paymentData } = await supabaseAdmin
            .from("payments")
            .select("*")
            .eq("transaction_id", subscriptionId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (paymentData) {
            logInfo("Payment record found from Supabase", {
              subscriptionId,
              provider,
              hasMetadata: !!paymentData.metadata,
              metadata: paymentData.metadata,
              billingCycle: paymentData.billing_cycle,
              allFields: Object.keys(paymentData || {}),
            });
          }

          pendingPayment = paymentData;

          // 🔧 PayPal备选查询：如果通过transaction_id没找到，尝试通过userId+amount查找
          // 这种情况可能发生在webhook数据结构变化时
          if (
            !pendingPayment &&
            provider === "paypal" &&
            userId &&
            amount > 0
          ) {
            logWarn(
              "PayPal: payment not found by transaction_id, trying user+amount match",
              {
                subscriptionId,
                userId,
                amount,
              }
            );

            const { data: paymentData2 } = await supabaseAdmin
              .from("payments")
              .select("*")
              .eq("user_id", userId)
              .eq("amount", amount)
              .eq("payment_method", provider)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (paymentData2) {
              pendingPayment = paymentData2;
              logInfo(`Found PayPal payment using user+amount match`, {
                subscriptionId,
                userId,
                amount,
                foundTransactionId: paymentData2.transaction_id,
                metadata: paymentData2.metadata,
              });
            }
          }
          // 如果没找到，对于支付宝，还需要尝试用 out_trade_no 字段查询
          else if (!pendingPayment && provider === "alipay") {
            const { data: paymentData2 } = await supabaseAdmin
              .from("payments")
              .select("*")
              .eq("out_trade_no", subscriptionId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            pendingPayment = paymentData2;

            if (pendingPayment) {
              logInfo(`Found payment using out_trade_no field`, {
                subscriptionId,
                provider,
                paymentStatus: pendingPayment.status,
              });
            }
          }
        }

        // 从metadata中读取天数（不再硬编码推断）
        if (pendingPayment?.metadata?.days) {
          // ✅ 修复：确保days是数字类型（从数据库读取可能是字符串）
          days =
            typeof pendingPayment.metadata.days === "string"
              ? parseInt(pendingPayment.metadata.days, 10)
              : pendingPayment.metadata.days;
          logInfo(`Days extracted from ${provider} payment metadata`, {
            subscriptionId,
            userId,
            days,
            metadata: pendingPayment.metadata,
            paymentStatus: pendingPayment.status,
          });
        } else {
          // 🔧 改进：metadata中没有days时，尝试根据金额推断
          logWarn(
            `Days not found in ${provider} payment metadata, attempting to infer from amount`,
            {
              subscriptionId,
              userId,
              amount,
              currency,
              hasMetadata: !!pendingPayment?.metadata,
              pendingPaymentFound: !!pendingPayment,
              paymentStatus: pendingPayment?.status,
            }
          );

          // 尝试根据金额推断天数（支付配置已知）
          // USD: monthly=9.99 (30天), yearly=99.99 (365天)
          // CNY: 都是 0.01
          if (provider === "paypal" && currency === "USD") {
            if (amount >= 99) {
              days = 365; // 年度计划
              logInfo("PayPal: Inferred 365 days from amount", {
                subscriptionId,
                amount,
              });
            } else if (amount >= 9) {
              days = 30; // 月度计划
              logInfo("PayPal: Inferred 30 days from amount", {
                subscriptionId,
                amount,
              });
            } else {
              days = 30; // 默认备选
            }
          } else {
            days = 30; // 其他情况默认30天
          }
        }
      } catch (error) {
        logError(
          `Error reading days from ${provider} payment record`,
          error as Error,
          {
            provider,
            subscriptionId,
            userId,
          }
        );
        days = 30; // 出错时默认30天
      }

      // 更新或创建订阅
      const success = await this.updateSubscriptionStatus(
        userId,
        subscriptionId,
        "active",
        provider,
        amount > 0 ? amount : undefined,
        amount > 0 ? currency : undefined,
        days, // ✅ 传递从数据库读取的天数
        paypalOrderId // ✅ 传递PayPal Order ID
      );

      if (success) {
        logBusinessEvent("payment_success_processed", userId, {
          provider,
          subscriptionId,
          amount,
          currency,
          daysAdded: days, // ✅ 记录实际增加的天数
        });

        // 🔄 支付成功后，清除国际版用户缓存
        // 前端会在下次调用时重新从 /api/profile 获取最新信息
        try {
          if (typeof globalThis !== "undefined" && typeof localStorage !== "undefined") {
            // 服务端环境没有 localStorage，这段代码在服务端不会执行
            // 但我们可以通过数据库事件或其他机制通知前端
            logInfo("Payment success: frontend cache will be refreshed on next request", {
              userId,
              provider,
            });
          }
        } catch (e) {
          // 服务端环境忽略
        }
      }

      return success;
    } catch (error) {
      logError(
        `Error handling payment success for ${provider}`,
        error as Error,
        {
          provider,
          data: JSON.stringify(data),
        }
      );
      return false;
    }
  }

  /**
   * 处理订阅取消事件
   */
  private async handleSubscriptionCancelled(
    provider: string,
    data: any
  ): Promise<boolean> {
    try {
      const subscriptionId = data.id || data.subscription;
      const user = await this.findUserBySubscriptionId(subscriptionId);

      if (!user) {
        logSecurityEvent(
          `User not found for cancelled subscription`,
          undefined,
          undefined,
          {
            provider,
            subscriptionId,
          }
        );
        return false;
      }

      return await this.updateSubscriptionStatus(
        user.userId,
        subscriptionId,
        "cancelled",
        provider
      );
    } catch (error) {
      logError(
        `Error handling subscription cancellation for ${provider}`,
        error as Error,
        {
          provider,
          data: JSON.stringify(data),
        }
      );
      return false;
    }
  }

  /**
   * 处理订阅暂停事件
   */
  private async handleSubscriptionSuspended(
    provider: string,
    data: any
  ): Promise<boolean> {
    try {
      const subscriptionId = data.id || data.subscription;
      const user = await this.findUserBySubscriptionId(subscriptionId);

      if (!user) {
        logSecurityEvent(
          `User not found for suspended subscription`,
          undefined,
          undefined,
          {
            provider,
            subscriptionId,
          }
        );
        return false;
      }

      return await this.updateSubscriptionStatus(
        user.userId,
        subscriptionId,
        "suspended",
        provider
      );
    } catch (error) {
      logError(
        `Error handling subscription suspension for ${provider}`,
        error as Error,
        {
          provider,
          data: JSON.stringify(data),
        }
      );
      return false;
    }
  }

  /**
   * 处理订阅更新事件
   */
  private async handleSubscriptionUpdated(
    provider: string,
    data: any
  ): Promise<boolean> {
    try {
      const subscriptionId = data.id;
      const user = await this.findUserBySubscriptionId(subscriptionId);

      if (!user) {
        logSecurityEvent(
          `User not found for updated subscription`,
          undefined,
          undefined,
          {
            provider,
            subscriptionId,
          }
        );
        return false;
      }

      const status = data.status === "active" ? "active" : "inactive";
      return await this.updateSubscriptionStatus(
        user.userId,
        subscriptionId,
        status,
        provider
      );
    } catch (error) {
      logError(
        `Error handling subscription update for ${provider}`,
        error as Error,
        {
          provider,
          data: JSON.stringify(data),
        }
      );
      return false;
    }
  }

  /**
   * 根据订阅ID查找用户
   */
  private async findUserBySubscriptionId(
    subscriptionId: string
  ): Promise<{ userId: string; subscriptionId?: string } | null> {
    logInfo("Searching for user by subscription ID", { subscriptionId });

    // 首先从payments表查找（通过transaction_id）
    // 优先选择completed状态的记录，如果没有则选择最新的记录
    const { data: payments, error } = await supabaseAdmin
      .from("payments")
      .select("user_id, status, created_at")
      .eq("transaction_id", subscriptionId)
      .order("status", { ascending: false }) // completed (true) 排在前面
      .order("created_at", { ascending: false }) // 最新的排在前面
      .limit(1);

    if (error) {
      logError("Error querying payments table", error, { subscriptionId });
    }

    if (payments && payments.length > 0) {
      logInfo("Found user from payments table", {
        subscriptionId,
        userId: payments[0].user_id,
      });
      return { userId: payments[0].user_id };
    }

    // 如果没找到，从subscriptions表查找（通过provider_subscription_id）
    const { data: subscription, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, id")
      .eq("provider_subscription_id", subscriptionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError) {
      logError("Error querying subscriptions table", subError, {
        subscriptionId,
      });
    }

    if (subscription) {
      logInfo("Found user from subscriptions table", {
        subscriptionId,
        userId: subscription.user_id,
      });
      return { userId: subscription.user_id, subscriptionId: subscription.id };
    }

    // 最后，尝试从最近的 pending 支付中查找（可能是刚创建的订阅）
    // 查找最近5分钟内创建的 pending PayPal 支付
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentPayments, error: recentError } = await supabaseAdmin
      .from("payments")
      .select("user_id, transaction_id, created_at")
      .eq("payment_method", "paypal")
      .eq("status", "pending")
      .gte("created_at", fiveMinutesAgo)
      .order("created_at", { ascending: false })
      .limit(5);

    if (recentError) {
      logError("Error querying recent payments", recentError, {
        subscriptionId,
      });
    }

    if (recentPayments && recentPayments.length > 0) {
      logInfo("Found recent pending PayPal payments", {
        subscriptionId,
        count: recentPayments.length,
        transactionIds: recentPayments.map((p) => p.transaction_id),
      });

      // 使用第一个最近的 pending 支付（假设用户刚刚创建）
      // 这是一个启发式方法，因为 PayPal 订阅 ID 在激活前后可能不同
      const mostRecent = recentPayments[0];
      logWarn(
        "Could not find exact subscription match, using most recent pending PayPal payment",
        {
          subscriptionId,
          foundTransactionId: mostRecent.transaction_id,
          userId: mostRecent.user_id,
          createdAt: mostRecent.created_at,
        }
      );
      return { userId: mostRecent.user_id };
    }

    logError("User not found for subscription ID", undefined, {
      subscriptionId,
      searchedPayments: true,
      searchedSubscriptions: true,
      searchedRecentPending: true,
    });

    return null;
  }

  /**
   * 更新订阅状态 - 统一的状态管理方法
   */
  private async updateSubscriptionStatus(
    userId: string,
    subscriptionId: string,
    status: string,
    provider: string,
    amount?: number,
    currency?: string,
    days?: number, // ✅ 新增：订阅天数
    paypalOrderId?: string // ✅ 新增：PayPal Order ID (用于查找pending payment)
  ): Promise<boolean> {
    console.log("💎💎💎 [WebhookHandler updateSubscriptionStatus] CALLED", {
      userId,
      subscriptionId,
      status,
      provider,
      amount,
      currency,
      days,
    });

    const startTime = Date.now();
    const operationId = `sub_update_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    try {
      logBusinessEvent("subscription_status_update_started", userId, {
        operationId,
        subscriptionId,
        status,
        provider,
        amount,
        currency,
        days, // ✅ 新增：记录天数
      });

      const now = new Date();

      if (isChinaRegion()) {
        // 中国地区：使用 CloudBase
        return await this.updateSubscriptionStatusCloudBase(
          userId,
          subscriptionId,
          status,
          provider,
          amount,
          currency,
          days, // ✅ 新增：传递天数
          operationId,
          now
        );
      } else {
        // 国际地区：使用 Supabase
        return await this.updateSubscriptionStatusSupabase(
          userId,
          subscriptionId,
          status,
          provider,
          amount,
          currency,
          days, // ✅ 新增：传递天数
          paypalOrderId, // ✅ 新增：传递PayPal Order ID
          operationId,
          now
        );
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logError(
        "Unexpected error during subscription status update",
        error as Error,
        {
          operationId,
          userId,
          subscriptionId,
          status,
          provider,
          duration,
        }
      );
      return false;
    }
  }

  /**
   * 处理Stripe结账完成事件
   */
  private async handleStripeCheckoutCompleted(session: any): Promise<boolean> {
    const operationId = `stripe_checkout_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    try {
      logBusinessEvent("stripe_checkout_completed_received", undefined, {
        operationId,
        sessionId: session.id,
        subscriptionId: session.subscription,
      });

      // 从metadata中获取用户信息
      const userId = session.metadata?.userId;
      const paymentType = session.metadata?.paymentType;
      const billingCycle = session.metadata?.billingCycle;
      // ✅ 转换days为数字（Stripe metadata中所有值都是字符串）
      const days = session.metadata?.days
        ? parseInt(session.metadata.days, 10)
        : undefined;

      if (!userId) {
        logError(
          "Missing required userId in Stripe checkout session",
          undefined,
          {
            operationId,
            sessionId: session.id,
            metadata: session.metadata,
          }
        );
        return false;
      }

      // 计算金额（Stripe以分为单位）
      const amount = (session.amount_total || 0) / 100;
      const currency = session.currency?.toUpperCase() || "USD";

      logInfo("Processing Stripe checkout completion", {
        operationId,
        userId,
        sessionId: session.id,
        paymentType,
        billingCycle,
        days,
        amount,
        currency,
        hasSubscription: !!session.subscription,
      });

      // 处理一次性支付
      if (paymentType === "onetime") {
        // 为一次性支付创建订阅
        const success = await this.updateSubscriptionStatus(
          userId,
          session.id, // 使用session ID作为订阅ID
          "active",
          "stripe",
          amount,
          currency,
          days // ✅ 传递天数
        );

        if (success) {
          logBusinessEvent("stripe_onetime_payment_processed", userId, {
            operationId,
            sessionId: session.id,
            amount,
            currency,
            days: days || (billingCycle === "monthly" ? "30" : "365"),
          });
        } else {
          logError("Failed to process Stripe onetime payment", undefined, {
            operationId,
            userId,
            sessionId: session.id,
          });
        }

        return success;
      }

      // 处理订阅支付
      const subscriptionId = session.subscription;
      if (!subscriptionId) {
        logError("No subscription ID in Stripe checkout session", undefined, {
          operationId,
          sessionId: session.id,
          userId,
        });
        return false;
      }

      // 对于订阅支付，使用planType（如果存在）
      const planType = session.metadata?.planType || "pro"; // 默认pro

      logInfo("Processing Stripe subscription checkout", {
        operationId,
        userId,
        sessionId: session.id,
        subscriptionId,
        planType,
        billingCycle,
        amount,
        currency,
      });

      // 更新订阅状态
      const success = await this.updateSubscriptionStatus(
        userId,
        subscriptionId,
        "active",
        "stripe",
        amount,
        currency,
        days // ✅ 传递天数
      );

      if (success) {
        logBusinessEvent("stripe_checkout_completed_processed", userId, {
          operationId,
          sessionId: session.id,
          subscriptionId,
          planType,
          amount,
          currency,
        });
      } else {
        logError("Failed to process Stripe checkout completion", undefined, {
          operationId,
          userId,
          sessionId: session.id,
          subscriptionId,
        });
      }

      return success;
    } catch (error) {
      logError(
        "Unexpected error handling Stripe checkout completed",
        error as Error,
        {
          operationId,
          sessionId: session?.id,
        }
      );
      return false;
    }
  }

  /**
   * 处理Stripe订阅创建事件
   */
  private async handleStripeSubscriptionCreated(
    subscription: any
  ): Promise<boolean> {
    const operationId = `stripe_sub_created_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    try {
      logBusinessEvent("stripe_subscription_created_received", undefined, {
        operationId,
        subscriptionId: subscription.id,
        customerId: subscription.customer,
        status: subscription.status,
      });

      // 订阅创建事件通常在checkout完成后触发
      // 这里可以添加额外的订阅初始化逻辑
      logInfo("Stripe subscription created event processed", {
        operationId,
        subscriptionId: subscription.id,
        status: subscription.status,
        customerId: subscription.customer,
      });

      return true;
    } catch (error) {
      logError("Error handling Stripe subscription created", error as Error, {
        operationId,
        subscriptionId: subscription?.id,
      });
      return false;
    }
  }

  /**
   * 处理Stripe订阅更新事件
   */
  private async handleStripeSubscriptionUpdated(
    subscription: any
  ): Promise<boolean> {
    const operationId = `stripe_sub_updated_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    try {
      const subscriptionId = subscription.id;
      const status = subscription.status === "active" ? "active" : "inactive";

      logBusinessEvent("stripe_subscription_updated_received", undefined, {
        operationId,
        subscriptionId,
        status: subscription.status,
        customerId: subscription.customer,
      });

      // 查找用户
      const user = await this.findUserBySubscriptionId(subscriptionId);
      if (!user) {
        logSecurityEvent(
          "User not found for Stripe subscription update",
          undefined,
          undefined,
          {
            operationId,
            subscriptionId,
            status,
          }
        );
        return false;
      }

      logInfo("Processing Stripe subscription update", {
        operationId,
        userId: user.userId,
        subscriptionId,
        oldStatus: subscription.status,
        newStatus: status,
      });

      const success = await this.updateSubscriptionStatus(
        user.userId,
        subscriptionId,
        status,
        "stripe"
      );

      if (success) {
        logBusinessEvent("stripe_subscription_updated_processed", user.userId, {
          operationId,
          subscriptionId,
          status,
        });
      }

      return success;
    } catch (error) {
      logError("Error handling Stripe subscription updated", error as Error, {
        operationId,
        subscriptionId: subscription?.id,
      });
      return false;
    }
  }

  /**
   * 处理Stripe订阅取消事件（重命名以区分）
   */
  private async handleStripeSubscriptionCancelled(
    subscription: any
  ): Promise<boolean> {
    const operationId = `stripe_sub_cancelled_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    try {
      const subscriptionId = subscription.id;

      logBusinessEvent("stripe_subscription_cancelled_received", undefined, {
        operationId,
        subscriptionId,
        customerId: subscription.customer,
        cancelAt: subscription.cancel_at,
        canceledAt: subscription.canceled_at,
      });

      const user = await this.findUserBySubscriptionId(subscriptionId);

      if (!user) {
        logSecurityEvent(
          "User not found for cancelled Stripe subscription",
          undefined,
          undefined,
          {
            operationId,
            subscriptionId,
          }
        );
        return false;
      }

      logInfo("Processing Stripe subscription cancellation", {
        operationId,
        userId: user.userId,
        subscriptionId,
      });

      const success = await this.updateSubscriptionStatus(
        user.userId,
        subscriptionId,
        "cancelled",
        "stripe"
      );

      if (success) {
        logBusinessEvent(
          "stripe_subscription_cancelled_processed",
          user.userId,
          {
            operationId,
            subscriptionId,
          }
        );
      }

      return success;
    } catch (error) {
      logError("Error handling Stripe subscription cancelled", error as Error, {
        operationId,
        subscriptionId: subscription?.id,
      });
      return false;
    }
  }

  /**
   * 处理Stripe发票支付成功事件
   */
  private async handleStripeInvoicePaymentSucceeded(
    invoice: any
  ): Promise<boolean> {
    const operationId = `stripe_invoice_success_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    try {
      // 定期支付成功
      const subscriptionId = invoice.subscription;
      if (!subscriptionId) {
        logInfo("Invoice without subscription ID, skipping", {
          operationId,
          invoiceId: invoice.id,
        });
        return true;
      }

      logBusinessEvent("stripe_invoice_payment_succeeded_received", undefined, {
        operationId,
        invoiceId: invoice.id,
        subscriptionId,
        customerId: invoice.customer,
        amount: invoice.amount_paid,
        currency: invoice.currency,
      });

      const user = await this.findUserBySubscriptionId(subscriptionId);
      if (!user) {
        logSecurityEvent(
          "User not found for Stripe invoice payment",
          undefined,
          undefined,
          {
            operationId,
            invoiceId: invoice.id,
            subscriptionId,
          }
        );
        return false;
      }

      // 如果没有subscriptionId，从subscriptions表查找
      let subscriptionIdForPayment = user.subscriptionId;
      if (!subscriptionIdForPayment) {
        const { data: subscription, error } = await supabaseAdmin
          .from("subscriptions")
          .select("id")
          .eq("provider_subscription_id", subscriptionId)
          .maybeSingle();

        if (error) {
          logError("Error finding subscription for invoice payment", error, {
            operationId,
            invoiceId: invoice.id,
            subscriptionId,
          });
          return false;
        }

        subscriptionIdForPayment = subscription?.id;
      }

      if (!subscriptionIdForPayment) {
        logError("Subscription not found for invoice payment", undefined, {
          operationId,
          invoiceId: invoice.id,
          subscriptionId,
        });
        return false;
      }

      // 记录支付
      const amount = (invoice.amount_paid || 0) / 100;
      const currency = invoice.currency?.toUpperCase() || "USD";

      logInfo("Recording Stripe invoice payment", {
        operationId,
        userId: user.userId,
        invoiceId: invoice.id,
        subscriptionId: subscriptionIdForPayment,
        amount,
        currency,
      });

      // 检查是否已有相同transaction_id的支付记录
      const { data: existingPayment, error: checkError } = await supabaseAdmin
        .from("payments")
        .select("id, status")
        .eq("transaction_id", invoice.id)
        .maybeSingle();

      if (checkError) {
        logError(
          "Error checking existing payment records for invoice",
          checkError,
          {
            operationId,
            invoiceId: invoice.id,
            subscriptionId: subscriptionIdForPayment,
          }
        );
        return false;
      }

      if (existingPayment) {
        logInfo("Payment record already exists for invoice, skipping", {
          operationId,
          invoiceId: invoice.id,
          existingPaymentId: existingPayment.id,
          status: existingPayment.status,
        });
        return true; // 已经存在，跳过
      }

      const { error: paymentError } = await supabaseAdmin
        .from("payments")
        .insert({
          user_id: user.userId,
          subscription_id: subscriptionIdForPayment,
          amount,
          currency,
          status: "completed",
          payment_method: "stripe",
          transaction_id: invoice.id,
        });

      if (paymentError) {
        logError("Error recording Stripe invoice payment", paymentError, {
          operationId,
          userId: user.userId,
          invoiceId: invoice.id,
          subscriptionId: subscriptionIdForPayment,
        });
        return false;
      }

      logBusinessEvent("stripe_invoice_payment_recorded", user.userId, {
        operationId,
        invoiceId: invoice.id,
        subscriptionId: subscriptionIdForPayment,
        amount,
        currency,
      });

      return true;
    } catch (error) {
      logError(
        "Error handling Stripe invoice payment succeeded",
        error as Error,
        {
          operationId,
          invoiceId: invoice?.id,
        }
      );
      return false;
    }
  }

  /**
   * 处理Stripe发票支付失败事件
   */
  private async handleStripeInvoicePaymentFailed(
    invoice: any
  ): Promise<boolean> {
    const operationId = `stripe_invoice_failed_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    try {
      const subscriptionId = invoice.subscription;
      if (!subscriptionId) {
        logInfo("Invoice without subscription ID, skipping", {
          operationId,
          invoiceId: invoice.id,
        });
        return true;
      }

      logBusinessEvent("stripe_invoice_payment_failed_received", undefined, {
        operationId,
        invoiceId: invoice.id,
        subscriptionId,
        customerId: invoice.customer,
        amount: invoice.amount_due,
        currency: invoice.currency,
        attemptCount: invoice.attempt_count,
      });

      const user = await this.findUserBySubscriptionId(subscriptionId);
      if (!user) {
        logSecurityEvent(
          "User not found for failed Stripe invoice payment",
          undefined,
          undefined,
          {
            operationId,
            invoiceId: invoice.id,
            subscriptionId,
          }
        );
        return false;
      }

      // 可以在这里添加支付失败的处理逻辑
      // 比如发送通知、更新订阅状态等
      logWarn("Stripe invoice payment failed - notification needed", {
        operationId,
        userId: user.userId,
        invoiceId: invoice.id,
        subscriptionId: user.subscriptionId,
        amount: (invoice.amount_due || 0) / 100,
        currency: invoice.currency,
        nextPaymentAttempt: invoice.next_payment_attempt,
      });

      // TODO: 实现支付失败通知逻辑
      // - 发送邮件通知用户
      // - 记录失败事件到通知队列
      // - 考虑自动重试逻辑

      return true;
    } catch (error) {
      logError("Error handling Stripe invoice payment failed", error as Error, {
        operationId,
        invoiceId: invoice?.id,
      });
      return false;
    }
  }

  /**
   * 更新订阅状态 - CloudBase 实现（中国地区）
   */
  private async updateSubscriptionStatusCloudBase(
    userId: string,
    subscriptionId: string,
    status: string,
    provider: string,
    amount: number | undefined,
    currency: string | undefined,
    days: number | undefined, // ✅ 新增：订阅天数
    operationId: string,
    now: Date
  ): Promise<boolean> {
    try {
      logInfo("Updating subscription status in CloudBase", {
        operationId,
        userId,
        subscriptionId,
        status,
        provider,
        days, // ✅ 新增：记录天数
      });

      // 获取 CloudBase 数据库实例
      const db = getDatabase();

      // 首先检查用户是否存在
      const userQuery = await db
        .collection("web_users")
        .where({
          _id: userId,
        })
        .get();

      if (!userQuery.data || userQuery.data.length === 0) {
        logSecurityEvent(
          "User not found in CloudBase for subscription update",
          userId,
          undefined,
          {
            operationId,
            subscriptionId,
            provider,
            status,
          }
        );
        return false;
      }

      const userProfile = userQuery.data[0];
      logInfo("User profile found in CloudBase", {
        operationId,
        userId,
        currentPro: userProfile.pro,
      });

      // 更新用户 pro 状态
      const updateData: any = {
        pro: status === "active",
        updated_at: now.toISOString(),
      };

      // 如果有订阅ID，记录订阅信息
      if (subscriptionId) {
        updateData.subscription_id = subscriptionId;
        updateData.subscription_provider = provider;
      }

      const updateResult = await db
        .collection("web_users")
        .doc(userId)
        .update(updateData);

      if (updateResult.updated === 0) {
        logError(
          "Failed to update user profile in CloudBase",
          new Error("Update returned 0 affected rows"),
          {
            operationId,
            userId,
            subscriptionId,
            provider,
          }
        );
        return false;
      }

      logBusinessEvent("cloudbase_user_profile_updated", userId, {
        operationId,
        subscriptionId,
        status,
        provider,
        pro: updateData.pro,
      });

      // 创建或更新订阅记录（如果状态为active）
      if (status === "active") {
        try {
          logInfo("Creating/updating subscription in CloudBase", {
            operationId,
            userId,
            subscriptionId,
            provider,
          });

          // 检查是否已有活跃订阅
          let existingSubQuery;
          try {
            existingSubQuery = await db
              .collection("subscriptions")
              .where({
                user_id: userId,
                status: "active",
              })
              .limit(1)
              .get();
          } catch (queryError) {
            logError(
              "Error querying existing subscriptions in CloudBase",
              queryError as Error,
              {
                operationId,
                userId,
              }
            );
            existingSubQuery = { data: [] }; // 假设没有现有订阅
          }

          const now_iso = now.toISOString();
          // ✅ 修复：使用从payments表读取的天数，而不是硬编码30天
          const daysToAdd = days || 30; // 默认30天
          const current_period_end = new Date(
            now.getTime() + daysToAdd * 24 * 60 * 60 * 1000
          ).toISOString();

          if (existingSubQuery.data && existingSubQuery.data.length > 0) {
            // 更新现有订阅
            const existingSubscription = existingSubQuery.data[0];
            logInfo("Updating existing subscription", {
              operationId,
              subscriptionId: existingSubscription._id,
              userId,
              currentEnd: existingSubscription.current_period_end,
              daysToAdd,
            });

            try {
              // ✅ 修复：如果是一次性支付（alipay/wechat），从现有的period_end继续延长
              // 如果是订阅支付（stripe/paypal），则覆盖period_end
              let newPeriodEnd = current_period_end;

              if (provider === "alipay" || provider === "wechat") {
                // 一次性支付：从现有期限延长
                const existingEnd = new Date(
                  existingSubscription.current_period_end
                );
                if (existingEnd > now) {
                  // 现有期限还没过期，从它的基础上延长
                  newPeriodEnd = new Date(
                    existingEnd.getTime() + daysToAdd * 24 * 60 * 60 * 1000
                  ).toISOString();
                  logInfo(
                    "One-time payment: extending from existing period end",
                    {
                      operationId,
                      existingEnd: existingSubscription.current_period_end,
                      newPeriodEnd,
                    }
                  );
                } else {
                  // 现有期限已过期，从现在开始重新计算
                  newPeriodEnd = current_period_end;
                  logInfo(
                    "One-time payment: existing period expired, starting fresh",
                    {
                      operationId,
                      existingEnd: existingSubscription.current_period_end,
                      newPeriodEnd,
                    }
                  );
                }
              }

              await db
                .collection("subscriptions")
                .doc(existingSubscription._id)
                .update({
                  status,
                  provider_subscription_id: subscriptionId,
                  provider,
                  current_period_end: newPeriodEnd,
                  updated_at: now_iso,
                });

              logBusinessEvent("cloudbase_subscription_updated", userId, {
                operationId,
                subscriptionId: existingSubscription._id,
                status,
                provider,
                currentPeriodEnd: newPeriodEnd,
                daysAdded: daysToAdd,
              });
            } catch (updateError) {
              logError(
                "Error updating existing subscription in CloudBase",
                updateError as Error,
                {
                  operationId,
                  userId,
                  subscriptionId: existingSubscription._id,
                }
              );
              throw updateError;
            }
          } else {
            // 创建新订阅
            logInfo("No existing subscription found, creating new one", {
              operationId,
              userId,
              subscriptionId,
              provider,
            });

            const subscriptionData = {
              user_id: userId,
              plan_id: "pro", // 默认使用pro计划
              status: "active",
              provider_subscription_id: subscriptionId,
              provider,
              current_period_start: now_iso,
              current_period_end,
              created_at: now_iso,
              updated_at: now_iso,
            };

            logInfo("Subscription data to insert", {
              operationId,
              data: subscriptionData,
            });

            try {
              const result = await db
                .collection("subscriptions")
                .add(subscriptionData);

              logInfo("Subscription created successfully", {
                operationId,
                subscriptionId: result._id || result.id,
                insertedData: subscriptionData,
              });

              logBusinessEvent("cloudbase_subscription_created", userId, {
                operationId,
                subscriptionId: result._id || result.id,
                planId: "pro",
                provider,
              });
            } catch (insertError) {
              logError(
                "Error creating new subscription in CloudBase",
                insertError as Error,
                {
                  operationId,
                  userId,
                  subscriptionId,
                  attemptedData: subscriptionData,
                }
              );
              throw insertError;
            }
          }
        } catch (subscriptionError) {
          logError(
            "Error processing subscription update in CloudBase",
            subscriptionError as Error,
            {
              operationId,
              userId,
              subscriptionId,
              provider,
              status,
            }
          );
          // 继续执行，不让订阅错误阻止整个流程
          // 但记录警告
          logWarn(
            "Subscription update failed but continuing with payment processing",
            {
              operationId,
              userId,
              subscriptionId,
            }
          );
        }
      }

      // 如果有金额信息，记录支付到 payments 集合
      if (amount && currency) {
        logInfo("Recording payment in CloudBase", {
          operationId,
          userId,
          subscriptionId,
          amount,
          currency,
          provider,
        });

        // 检查是否已存在完成的支付记录
        const existingPaymentQuery = await db
          .collection("payments")
          .where({
            transaction_id: subscriptionId,
            status: "completed",
          })
          .get();

        if (existingPaymentQuery.data && existingPaymentQuery.data.length > 0) {
          logInfo("Payment already exists in CloudBase, skipping duplicate", {
            operationId,
            existingPaymentId: existingPaymentQuery.data[0]._id,
            transactionId: subscriptionId,
          });
        } else {
          // 查找 pending 支付记录
          const pendingPaymentQuery = await db
            .collection("payments")
            .where({
              user_id: userId,
              amount: amount,
              currency: currency,
              status: "pending",
            })
            .orderBy("created_at", "desc")
            .limit(1)
            .get();

          if (pendingPaymentQuery.data && pendingPaymentQuery.data.length > 0) {
            // 更新现有 pending 记录
            const existingPayment = pendingPaymentQuery.data[0];
            await db.collection("payments").doc(existingPayment._id).update({
              status: "completed",
              subscription_id: subscriptionId,
              updated_at: now.toISOString(),
            });

            logBusinessEvent("cloudbase_payment_updated", userId, {
              operationId,
              paymentId: existingPayment._id,
              transactionId: subscriptionId,
              oldStatus: "pending",
              newStatus: "completed",
            });
          } else {
            // 创建新支付记录
            const paymentData = {
              user_id: userId,
              subscription_id: subscriptionId,
              amount: amount,
              currency: currency,
              status: "completed",
              payment_method: provider,
              transaction_id: subscriptionId,
              created_at: now.toISOString(),
              updated_at: now.toISOString(),
            };

            const addResult = await db.collection("payments").add(paymentData);

            logBusinessEvent("cloudbase_payment_created", userId, {
              operationId,
              paymentId: addResult.id,
              subscriptionId,
              amount,
              currency,
              provider,
            });
          }
        }
      }

      logInfo("CloudBase subscription status update completed", {
        operationId,
        userId,
        subscriptionId,
        status,
        provider,
      });

      return true;
    } catch (error) {
      logError(
        "Error updating subscription status in CloudBase",
        error as Error,
        {
          operationId,
          userId,
          subscriptionId,
          status,
          provider,
        }
      );
      return false;
    }
  }

  /**
   * 更新订阅状态 - Supabase 实现（国际地区）
   */
  private async updateSubscriptionStatusSupabase(
    userId: string,
    subscriptionId: string,
    status: string,
    provider: string,
    amount: number | undefined,
    currency: string | undefined,
    days: number | undefined, // ✅ 新增：订阅天数
    paypalOrderId: string | undefined, // ✅ 新增：PayPal Order ID
    operationId: string,
    now: Date
  ): Promise<boolean> {
    try {
      logInfo("Updating subscription status in Supabase", {
        operationId,
        userId,
        subscriptionId,
        status,
        provider,
        days, // ✅ 新增：记录天数
      });

      // 首先检查用户是否存在
      const { data: userProfile, error: userError } = await supabaseAdmin
        .from("user_profiles")
        .select("id, subscription_plan, subscription_status")
        .eq("id", userId)
        .maybeSingle();

      if (userError) {
        logError(
          "Failed to fetch user profile during subscription update",
          userError,
          {
            operationId,
            userId,
            subscriptionId,
            provider,
          }
        );
        return false;
      }

      if (!userProfile) {
        logSecurityEvent(
          "User profile not found for subscription update",
          userId,
          undefined,
          {
            operationId,
            subscriptionId,
            provider,
            status,
          }
        );
        return false;
      }

      logInfo("User profile validated for subscription update", {
        operationId,
        userId,
        currentPlan: userProfile.subscription_plan,
        currentStatus: userProfile.subscription_status,
        newStatus: status,
      });

      // 检查是否已有活跃订阅
      const { data: existingSubscriptionData, error: checkError } =
        await supabaseAdmin
          .from("subscriptions")
          .select("*")
          .eq("user_id", userId)
          .eq("status", "active")
          .maybeSingle();

      if (checkError) {
        logError("Failed to check existing subscriptions", checkError, {
          operationId,
          userId,
          subscriptionId,
        });
        return false;
      }

      let existingSubscription = existingSubscriptionData;
      let subscription;

      if (existingSubscription) {
        // 更新现有订阅
        logInfo("Updating existing subscription", {
          operationId,
          userId,
          existingSubscriptionId: existingSubscription.id,
          oldStatus: existingSubscription.status,
          newStatus: status,
          currentPeriodEnd: existingSubscription.current_period_end,
        });

        // ✅ 修复：确保days是数字（从metadata读取可能是字符串）
        const daysNum =
          typeof days === "string" ? parseInt(days, 10) : days || 30;

        // 🔧 PayPal修复：计算新的订阅结束时间
        // 只有当现有期限还未过期时，才从现有期限延长
        // 否则从现在开始重新计算
        const existingEnd = new Date(existingSubscription.current_period_end);
        let newPeriodEnd: string;

        if (provider === "paypal" && existingEnd > now) {
          // PayPal一次性支付：现有期限还没过期，从它的基础上延长
          newPeriodEnd = new Date(
            existingEnd.getTime() + daysNum * 24 * 60 * 60 * 1000
          ).toISOString();
          logInfo("PayPal: extending from existing period end", {
            operationId,
            provider,
            existingEnd: existingSubscription.current_period_end,
            newPeriodEnd,
            daysAdded: daysNum,
          });
        } else if (provider === "paypal") {
          // PayPal一次性支付：现有期限已过期，从现在开始重新计算
          newPeriodEnd = new Date(
            now.getTime() + daysNum * 24 * 60 * 60 * 1000
          ).toISOString();
          logInfo("PayPal: existing period expired, starting fresh", {
            operationId,
            provider,
            existingEnd: existingSubscription.current_period_end,
            newPeriodEnd,
            daysAdded: daysNum,
          });
        } else {
          // 其他支付方式保持原逻辑：从现有期限延长（如果未过期）或从现在开始
          const tempNewPeriodEnd = new Date(
            now.getTime() + daysNum * 24 * 60 * 60 * 1000
          ).toISOString();
          if (existingEnd > now) {
            newPeriodEnd = new Date(
              existingEnd.getTime() + daysNum * 24 * 60 * 60 * 1000
            ).toISOString();
          } else {
            newPeriodEnd = tempNewPeriodEnd;
          }
          logInfo("One-time payment: updating subscription period", {
            operationId,
            provider,
            existingEnd: existingSubscription.current_period_end,
            newPeriodEnd,
            daysAdded: daysNum,
          });
        }

        const { data: updatedSubscription, error: updateError } =
          await supabaseAdmin
            .from("subscriptions")
            .update({
              status,
              provider_subscription_id: subscriptionId,
              current_period_end: newPeriodEnd,
              updated_at: now.toISOString(),
            })
            .eq("id", existingSubscription.id)
            .select()
            .single();

        if (updateError) {
          logError("Failed to update existing subscription", updateError, {
            operationId,
            userId,
            subscriptionId: existingSubscription.id,
            provider,
            updateData: {
              status,
              provider_subscription_id: subscriptionId,
              current_period_end: newPeriodEnd,
            },
          });
          return false;
        }

        console.log("✅ Subscription updated in Supabase:", {
          subscriptionId: updatedSubscription.id,
          newPeriodEnd,
          daysAdded: daysNum,
          provider,
        });

        subscription = updatedSubscription;
        logBusinessEvent("subscription_updated", userId, {
          operationId,
          subscriptionId: updatedSubscription.id,
          status,
          provider,
          currentPeriodEnd: newPeriodEnd,
          daysAdded: daysNum,
        });
      } else if (status === "active") {
        // 创建新订阅（只有激活状态才创建）
        logInfo("Creating new subscription for user", {
          operationId,
          userId,
          subscriptionId,
          provider,
        });

        // 🔧 防止重复订阅：最后检查是否存在任何活跃订阅（再查一遍）
        // 这是一个双重检查机制，防止竞态条件导致的重复订阅
        const { data: doubleCheckSubs, error: doubleCheckError } =
          await supabaseAdmin
            .from("subscriptions")
            .select("id, status, current_period_end")
            .eq("user_id", userId)
            .eq("status", "active")
            .limit(1);

        if (doubleCheckSubs && doubleCheckSubs.length > 0) {
          logWarn(
            "Found active subscription during double check, updating instead of creating",
            {
              operationId,
              userId,
              foundSubscriptionId: doubleCheckSubs[0].id,
              newSubscriptionId: subscriptionId,
            }
          );
          // 转而更新现有订阅
          existingSubscription = doubleCheckSubs[0] as any;
          // 重新执行更新逻辑
          if (existingSubscription) {
            const daysNum =
              typeof days === "string" ? parseInt(days, 10) : days || 30;
            const existingEnd = new Date(
              existingSubscription.current_period_end
            );
            let newPeriodEnd: string;

            if (provider === "paypal" && existingEnd > now) {
              newPeriodEnd = new Date(
                existingEnd.getTime() + daysNum * 24 * 60 * 60 * 1000
              ).toISOString();
            } else {
              newPeriodEnd = new Date(
                now.getTime() + daysNum * 24 * 60 * 60 * 1000
              ).toISOString();
            }

            const { error: updateError } = await supabaseAdmin
              .from("subscriptions")
              .update({
                provider_subscription_id: subscriptionId,
                current_period_end: newPeriodEnd,
                updated_at: now.toISOString(),
              })
              .eq("id", existingSubscription.id);

            if (updateError) {
              logError(
                "Failed to update subscription during double check",
                updateError,
                {
                  operationId,
                  userId,
                  subscriptionId: existingSubscription.id,
                }
              );
              return false;
            }

            logInfo("Subscription updated successfully via double check", {
              operationId,
              userId,
              subscriptionId: existingSubscription.id,
              newPeriodEnd,
            });
            return true;
          }
        }

        // ✅ 修复：使用从payments表读取的天数，而不是硬编码30天
        // ✅ 修复：确保days是数字（从metadata读取可能是字符串）
        const daysToAdd =
          typeof days === "string" ? parseInt(days, 10) : days || 30;
        const currentPeriodEnd = new Date(
          now.getTime() + daysToAdd * 24 * 60 * 60 * 1000
        ).toISOString();

        console.log("📝 Creating new subscription:", {
          userId,
          daysToAdd,
          currentPeriodStart: now.toISOString(),
          currentPeriodEnd,
        });

        const { data: newSubscription, error: insertError } =
          await supabaseAdmin
            .from("subscriptions")
            .insert({
              user_id: userId,
              plan_id: "pro", // 默认计划，需要从支付数据中提取
              status,
              provider_subscription_id: subscriptionId,
              current_period_start: now.toISOString(),
              current_period_end: currentPeriodEnd,
            })
            .select()
            .single();

        if (insertError) {
          logError("Failed to create new subscription", insertError, {
            operationId,
            userId,
            subscriptionId,
            provider,
          });
          return false;
        }

        console.log("✅ New subscription created in Supabase:", {
          subscriptionId: newSubscription.id,
          currentPeriodEnd,
          daysAdded: daysToAdd,
        });

        subscription = newSubscription;
        logBusinessEvent("subscription_created", userId, {
          operationId,
          subscriptionId: newSubscription.id,
          planId: newSubscription.plan_id,
          provider,
        });
      } else {
        logInfo("Skipping subscription creation for non-active status", {
          operationId,
          userId,
          status,
          provider,
        });
      }

      // 更新用户资料 - 确保状态一致性
      if (subscription) {
        logInfo("Updating user profile", {
          operationId,
          userId,
          subscriptionId: subscription.id,
          planId: subscription.plan_id,
          status,
        });

        const { error: profileError } = await supabaseAdmin
          .from("user_profiles")
          .update({
            subscription_plan: subscription.plan_id,
            subscription_status: status,
            updated_at: now.toISOString(),
          })
          .eq("id", userId);

        if (profileError) {
          logError("Failed to update user profile", profileError, {
            operationId,
            userId,
            subscriptionId: subscription.id,
            provider,
          });
          // 不返回false，因为订阅已更新，profile更新失败不应该阻止整个流程
        } else {
          logBusinessEvent("user_profile_updated", userId, {
            operationId,
            subscriptionPlan: subscription.plan_id,
            subscriptionStatus: status,
          });
        }
      }

      // 如果有金额信息，记录支付
      if (amount && currency && subscription) {
        logInfo("Recording payment transaction", {
          operationId,
          userId,
          subscriptionId: subscription.id,
          amount,
          currency,
          provider,
        });

        // 关键修复：首先检查是否已存在完成状态的支付记录（防止重复）
        const { data: existingCompletedPayment, error: completedCheckError } =
          await supabaseAdmin
            .from("payments")
            .select("id, status, created_at")
            .eq("transaction_id", subscriptionId)
            .eq("status", "completed")
            .maybeSingle();

        if (completedCheckError && completedCheckError.code !== "PGRST116") {
          logError(
            "Error checking existing completed payment records",
            completedCheckError,
            {
              operationId,
              userId,
              subscriptionId: subscription.id,
              transactionId: subscriptionId,
            }
          );
        }

        // 如果已存在已完成的支付记录，跳过创建
        if (existingCompletedPayment) {
          logInfo(
            "Payment already exists with completed status, skipping duplicate",
            {
              operationId,
              existingPaymentId: existingCompletedPayment.id,
              transactionId: subscriptionId,
              existingStatus: existingCompletedPayment.status,
            }
          );
          // 直接返回成功，不再重复记录
          logInfo("Subscription status update completed successfully", {
            operationId,
            userId,
            subscriptionId,
            status,
            provider,
            note: "Skipped duplicate payment record",
          });
          return true;
        }

        // 智能查找现有pending支付记录
        // 1. 首先尝试通过subscriptionId匹配（用于定期支付）
        // 2. 对于PayPal,尝试通过Order ID查找（因为CREATE用的是Order ID）
        // 3. 如果没找到，尝试通过用户ID+金额+时间匹配（用于一次性支付）
        let existingPayment = null;

        // 首先通过transaction_id查找（适用于定期支付）
        const { data: paymentByTransaction, error: checkError1 } =
          await supabaseAdmin
            .from("payments")
            .select("id, status, created_at")
            .eq("transaction_id", subscriptionId)
            .eq("status", "pending")
            .maybeSingle();

        if (checkError1) {
          logError(
            "Error checking existing payment records by transaction_id",
            checkError1,
            {
              operationId,
              userId,
              subscriptionId: subscription.id,
              transactionId: subscriptionId,
            }
          );
        } else if (paymentByTransaction) {
          existingPayment = paymentByTransaction;
          logInfo("Found existing payment by transaction_id", {
            operationId,
            paymentId: existingPayment.id,
            transactionId: subscriptionId,
          });
        }

        // ✅ 关键修复:对于PayPal,如果通过Capture ID找不到,尝试用Order ID查找
        // 注意:不只查找pending,也要查找completed(防止confirm API先执行导致重复创建)
        if (!existingPayment && provider === "paypal" && paypalOrderId) {
          const { data: paymentByOrderId, error: checkOrderError } =
            await supabaseAdmin
              .from("payments")
              .select("id, status, created_at")
              .eq("transaction_id", paypalOrderId)
              .in("status", ["pending", "completed"]) // ✅ 修复:查找pending或completed
              .maybeSingle();

          if (checkOrderError) {
            logError(
              "Error checking existing payment by PayPal Order ID",
              checkOrderError,
              {
                operationId,
                userId,
                orderId: paypalOrderId,
                captureId: subscriptionId,
              }
            );
          } else if (paymentByOrderId) {
            existingPayment = paymentByOrderId;
            logInfo("Found existing payment by PayPal Order ID", {
              operationId,
              paymentId: existingPayment.id,
              orderId: paypalOrderId,
              captureId: subscriptionId,
            });
          }
        }

        // 如果没找到，通过用户+金额+时间匹配（适用于一次性支付）
        if (!existingPayment) {
          const fiveMinutesAgo = new Date(
            Date.now() - 5 * 60 * 1000
          ).toISOString();
          const { data: paymentsByUserAmount, error: checkError2 } =
            await supabaseAdmin
              .from("payments")
              .select("id, status, created_at, transaction_id")
              .eq("user_id", userId)
              .eq("amount", amount)
              .eq("currency", currency)
              .eq("status", "pending")
              .gte("created_at", fiveMinutesAgo)
              .order("created_at", { ascending: false })
              .limit(1);

          if (checkError2) {
            logError(
              "Error checking existing payment records by user/amount",
              checkError2,
              {
                operationId,
                userId,
                subscriptionId: subscription.id,
                amount,
                currency,
              }
            );
          } else if (paymentsByUserAmount && paymentsByUserAmount.length > 0) {
            existingPayment = paymentsByUserAmount[0];
            logInfo("Found existing payment by user/amount/time match", {
              operationId,
              paymentId: existingPayment.id,
              originalTransactionId: existingPayment.transaction_id,
              newTransactionId: subscriptionId,
              timeDiff:
                Date.now() - new Date(existingPayment.created_at).getTime(),
            });
          }
        }

        if (existingPayment) {
          // ✅ 如果payment已经是completed,跳过更新(避免重复处理)
          if (existingPayment.status === "completed") {
            logInfo("Payment already completed, skipping duplicate webhook processing", {
              operationId,
              userId,
              paymentId: existingPayment.id,
              transactionId: subscriptionId,
            });
          } else {
            // 更新现有pending记录为completed
            logInfo("Updating existing pending payment to completed", {
              operationId,
              userId,
              paymentId: existingPayment.id,
              transactionId: subscriptionId,
              oldStatus: existingPayment.status,
              newStatus: "completed",
            });

            const { error: updateError } = await supabaseAdmin
              .from("payments")
              .update({
                status: "completed",
                subscription_id: subscription.id,
                updated_at: now.toISOString(),
              })
              .eq("id", existingPayment.id);

            if (updateError) {
              logError("Failed to update existing payment record", updateError, {
                operationId,
                userId,
                paymentId: existingPayment.id,
                transactionId: subscriptionId,
              });
              // 不返回false，更新失败不应该阻止订阅更新
            } else {
              logBusinessEvent("payment_status_updated", userId, {
                operationId,
                paymentId: existingPayment.id,
                transactionId: subscriptionId,
                oldStatus: "pending",
                newStatus: "completed",
                subscriptionId: subscription.id,
              });
            }
          }
        } else {
          // 创建新的支付记录
          const { error: paymentError } = await supabaseAdmin
            .from("payments")
            .insert({
              user_id: userId,
              subscription_id: subscription.id,
              amount,
              currency,
              status: "completed",
              payment_method: provider,
              transaction_id: subscriptionId,
            });

          if (paymentError) {
            logError("Failed to record payment", paymentError, {
              operationId,
              userId,
              subscriptionId: subscription.id,
              amount,
              currency,
              provider,
            });
            // 不返回false，支付记录失败不应该阻止订阅更新
          } else {
            logBusinessEvent("payment_recorded", userId, {
              operationId,
              subscriptionId: subscription.id,
              amount,
              currency,
              provider,
              transactionId: subscriptionId,
            });
          }
        }
      }

      logInfo("Supabase subscription status update completed", {
        operationId,
        userId,
        subscriptionId,
        status,
        provider,
      });

      return true;
    } catch (error) {
      logError(
        "Error updating subscription status in Supabase",
        error as Error,
        {
          operationId,
          userId,
          subscriptionId,
          status,
          provider,
        }
      );
      return false;
    }
  }
}
