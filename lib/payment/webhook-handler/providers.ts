/**
 * Payment Provider Handlers
 * 处理不同支付提供商的事件
 */

import { logInfo, logSecurityEvent, logWarn } from "../../logger";
import { handlePaymentSuccess } from "./payment-success";
import { updateSubscriptionStatus, findUserBySubscriptionId } from "./subscription-db";
import { rollbackReferralRewardsByTransaction } from "@/lib/market/referrals";
import {
  handleStripeCheckoutCompleted,
  handleStripeSubscriptionCreated,
  handleStripeSubscriptionUpdated,
  handleStripeSubscriptionCancelled,
  handleStripeInvoicePaymentSucceeded,
  handleStripeInvoicePaymentFailed,
} from "./stripe";

function uniqueTransactionIds(values: Array<string | null | undefined>) {
  const out = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out.add(trimmed);
  }
  return Array.from(out);
}

async function rollbackReferralForTransactions(
  provider: "stripe" | "paypal" | "wechat",
  transactionIds: Array<string | null | undefined>
) {
  const ids = uniqueTransactionIds(transactionIds);
  for (const transactionId of ids) {
    await rollbackReferralRewardsByTransaction({
      transactionId,
      provider,
      region: "ALL",
      reason: "refund",
    }).catch((error) => {
      logWarn("Failed to rollback referral reward from webhook refund event", {
        provider,
        transactionId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

/**
 * 处理 PayPal 事件
 */
export async function handlePayPalEvent(
  eventType: string,
  eventData: any
): Promise<boolean> {
  const resource = eventData.resource || {};

  switch (eventType) {
    case "PAYMENT.SALE.COMPLETED":
    case "PAYMENT.CAPTURE.COMPLETED":
      return await handlePaymentSuccess("paypal", resource);

    case "PAYMENT.SALE.REFUNDED":
    case "PAYMENT.CAPTURE.REFUNDED": {
      await rollbackReferralForTransactions("paypal", [
        resource.id,
        resource.sale_id,
        resource.parent_payment,
        resource.invoice_number,
      ]);
      return true;
    }

    case "CHECKOUT.ORDER.APPROVED":
      logInfo("PayPal order approved, waiting for capture completion", {
        eventType,
        orderId: resource.id,
      });
      return true;

    case "BILLING.SUBSCRIPTION.ACTIVATED":
      return await handlePaymentSuccess("paypal", resource);

    case "BILLING.SUBSCRIPTION.CANCELLED":
      return await handleSubscriptionCancelled("paypal", resource);

    case "BILLING.SUBSCRIPTION.SUSPENDED":
      return await handleSubscriptionSuspended("paypal", resource);

    default:
      logInfo(`Unhandled PayPal event: ${eventType}`, {
        eventType,
        resource,
      });
      return true;
  }
}

/**
 * 处理 Stripe 事件
 */
export async function handleStripeEvent(
  eventType: string,
  eventData: any
): Promise<boolean> {
  const data = eventData.data?.object || {};

  switch (eventType) {
    case "checkout.session.completed":
      return await handleStripeCheckoutCompleted(data);

    case "customer.subscription.created":
      return await handleStripeSubscriptionCreated(data);

    case "customer.subscription.updated":
      return await handleStripeSubscriptionUpdated(data);

    case "customer.subscription.deleted":
      return await handleStripeSubscriptionCancelled(data);

    case "invoice.payment_succeeded":
      return await handleStripeInvoicePaymentSucceeded(data);

    case "invoice.payment_failed":
      return await handleStripeInvoicePaymentFailed(data);

    case "charge.refunded": {
      await rollbackReferralForTransactions("stripe", [
        data.id,
        data.payment_intent,
        data.invoice,
        data.metadata?.transaction_id,
      ]);
      return true;
    }

    default:
      logInfo(`Unhandled Stripe event: ${eventType}`, { eventType, data });
      return true;
  }
}

/**
 * 处理支付宝事件
 */
export async function handleAlipayEvent(
  eventType: string,
  eventData: any
): Promise<boolean> {
  switch (eventType) {
    case "TRADE_SUCCESS":
    case "TRADE_FINISHED":
      return await handlePaymentSuccess("alipay", eventData);

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
export async function handleWechatEvent(
  eventType: string,
  eventData: any
): Promise<boolean> {
  switch (eventType) {
    case "SUCCESS":
      return await handlePaymentSuccess("wechat", eventData);

    case "REFUND.SUCCESS": {
      await rollbackReferralForTransactions("wechat", [
        eventData.transaction_id,
        eventData.out_trade_no,
        eventData.refund_id,
      ]);
      return true;
    }

    default:
      logInfo(`Unhandled WeChat event: ${eventType}`, {
        eventType,
        eventData,
      });
      return true;
  }
}

/**
 * 处理订阅取消事件
 */
async function handleSubscriptionCancelled(
  provider: string,
  data: any
): Promise<boolean> {
  try {
    const subscriptionId = data.id || data.subscription;
    const user = await findUserBySubscriptionId(subscriptionId);

    if (!user) {
      logSecurityEvent(
        `User not found for cancelled subscription`,
        undefined,
        undefined,
        { provider, subscriptionId }
      );
      return false;
    }

    return await updateSubscriptionStatus(
      user.userId,
      subscriptionId,
      "cancelled",
      provider
    );
  } catch (error) {
    console.error(`Error handling subscription cancellation for ${provider}:`, error);
    return false;
  }
}

/**
 * 处理订阅暂停事件
 */
async function handleSubscriptionSuspended(
  provider: string,
  data: any
): Promise<boolean> {
  try {
    const subscriptionId = data.id || data.subscription;
    const user = await findUserBySubscriptionId(subscriptionId);

    if (!user) {
      logSecurityEvent(
        `User not found for suspended subscription`,
        undefined,
        undefined,
        { provider, subscriptionId }
      );
      return false;
    }

    return await updateSubscriptionStatus(
      user.userId,
      subscriptionId,
      "suspended",
      provider
    );
  } catch (error) {
    console.error(`Error handling subscription suspension for ${provider}:`, error);
    return false;
  }
}
