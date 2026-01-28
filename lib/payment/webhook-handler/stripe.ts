/**
 * Stripe Webhook Handlers
 * 处理 Stripe 支付事件
 */

import { supabaseAdmin } from "../../supabase-admin";
import {
  logError,
  logInfo,
  logWarn,
  logSecurityEvent,
  logBusinessEvent,
} from "../../logger";
import { updateSubscriptionStatus, findUserBySubscriptionId } from "./subscription-db";

/**
 * 处理 Stripe 结账完成事件
 */
export async function handleStripeCheckoutCompleted(
  session: any
): Promise<boolean> {
  const operationId = `stripe_checkout_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  try {
    logBusinessEvent("stripe_checkout_completed_received", undefined, {
      operationId,
      sessionId: session.id,
      subscriptionId: session.subscription,
    });

    const userId = session.metadata?.userId;
    const paymentType = session.metadata?.paymentType;
    const billingCycle = session.metadata?.billingCycle;
    const days = session.metadata?.days
      ? parseInt(session.metadata.days, 10)
      : undefined;

    if (!userId) {
      logError(
        "Missing required userId in Stripe checkout session",
        undefined,
        { operationId, sessionId: session.id, metadata: session.metadata }
      );
      return false;
    }

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
      const success = await updateSubscriptionStatus(
        userId,
        session.id,
        "active",
        "stripe",
        amount,
        currency,
        days
      );

      if (success) {
        logBusinessEvent("stripe_onetime_payment_processed", userId, {
          operationId,
          sessionId: session.id,
          amount,
          currency,
          days: days || (billingCycle === "monthly" ? 30 : 365),
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

    const success = await updateSubscriptionStatus(
      userId,
      subscriptionId,
      "active",
      "stripe",
      amount,
      currency,
      days
    );

    if (success) {
      logBusinessEvent("stripe_checkout_completed_processed", userId, {
        operationId,
        sessionId: session.id,
        subscriptionId,
        planType: session.metadata?.planType || "pro",
        amount,
        currency,
      });
    }

    return success;
  } catch (error) {
    logError(
      "Unexpected error handling Stripe checkout completed",
      error as Error,
      { operationId, sessionId: session?.id }
    );
    return false;
  }
}

/**
 * 处理 Stripe 订阅创建事件
 */
export async function handleStripeSubscriptionCreated(
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
 * 处理 Stripe 订阅更新事件
 */
export async function handleStripeSubscriptionUpdated(
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

    const user = await findUserBySubscriptionId(subscriptionId);
    if (!user) {
      logSecurityEvent(
        "User not found for Stripe subscription update",
        undefined,
        undefined,
        { operationId, subscriptionId, status }
      );
      return false;
    }

    const success = await updateSubscriptionStatus(
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
 * 处理 Stripe 订阅取消事件
 */
export async function handleStripeSubscriptionCancelled(
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

    const user = await findUserBySubscriptionId(subscriptionId);
    if (!user) {
      logSecurityEvent(
        "User not found for cancelled Stripe subscription",
        undefined,
        undefined,
        { operationId, subscriptionId }
      );
      return false;
    }

    const success = await updateSubscriptionStatus(
      user.userId,
      subscriptionId,
      "cancelled",
      "stripe"
    );

    if (success) {
      logBusinessEvent("stripe_subscription_cancelled_processed", user.userId, {
        operationId,
        subscriptionId,
      });
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
 * 处理 Stripe 发票支付成功事件
 */
export async function handleStripeInvoicePaymentSucceeded(
  invoice: any
): Promise<boolean> {
  const operationId = `stripe_invoice_success_${Date.now()}_${Math.random()
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

    logBusinessEvent("stripe_invoice_payment_succeeded_received", undefined, {
      operationId,
      invoiceId: invoice.id,
      subscriptionId,
      customerId: invoice.customer,
      amount: invoice.amount_paid,
      currency: invoice.currency,
    });

    const user = await findUserBySubscriptionId(subscriptionId);
    if (!user) {
      logSecurityEvent(
        "User not found for Stripe invoice payment",
        undefined,
        undefined,
        { operationId, invoiceId: invoice.id, subscriptionId }
      );
      return false;
    }

    // 查找订阅ID
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

    // 检查是否已有相同 transaction_id 的支付记录
    const { data: existingPayment, error: checkError } = await supabaseAdmin
      .from("payments")
      .select("id, status")
      .eq("transaction_id", invoice.id)
      .maybeSingle();

    if (checkError) {
      logError("Error checking existing payment records for invoice", checkError, {
        operationId,
        invoiceId: invoice.id,
      });
      return false;
    }

    if (existingPayment) {
      logInfo("Payment record already exists for invoice, skipping", {
        operationId,
        invoiceId: invoice.id,
        existingPaymentId: existingPayment.id,
        status: existingPayment.status,
      });
      return true;
    }

    const amount = (invoice.amount_paid || 0) / 100;
    const currency = invoice.currency?.toUpperCase() || "USD";

    const { error: paymentError } = await supabaseAdmin.from("payments").insert({
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
      { operationId, invoiceId: invoice?.id }
    );
    return false;
  }
}

/**
 * 处理 Stripe 发票支付失败事件
 */
export async function handleStripeInvoicePaymentFailed(
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

    const user = await findUserBySubscriptionId(subscriptionId);
    if (!user) {
      logSecurityEvent(
        "User not found for failed Stripe invoice payment",
        undefined,
        undefined,
        { operationId, invoiceId: invoice.id, subscriptionId }
      );
      return false;
    }

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

    return true;
  } catch (error) {
    logError("Error handling Stripe invoice payment failed", error as Error, {
      operationId,
      invoiceId: invoice?.id,
    });
    return false;
  }
}
