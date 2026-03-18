/**
 * Subscription Database Operations
 * 订阅数据库操作（支持 CloudBase 和 Supabase）
 */

import { supabaseAdmin } from "../../supabase-admin";
import { getDatabase } from "../../cloudbase-service";
import { isChinaRegion } from "../../config/region";
import {
  logError,
  logInfo,
  logWarn,
  logSecurityEvent,
  logBusinessEvent,
} from "../../logger";
import { updateCloudbaseSubscription } from "../../../app/api/payment/lib/update-cloudbase-subscription";
import {
  executeWithOptionalColumns,
  toCompatError,
} from "../../../app/api/payment/lib/supabase-schema-compat";
import type { SubscriptionUser } from "./types";

const OPTIONAL_SUBSCRIPTION_WRITE_COLUMNS = [
  "plan",
  "expires_at",
  "transaction_id",
];

interface SupabaseSubscriptionRow {
  id: string;
  plan_id?: string | null;
  current_period_end?: string | null;
}

function normalizeDays(days: number | string | undefined): number {
  const parsed =
    typeof days === "number"
      ? days
      : typeof days === "string"
      ? parseInt(days, 10)
      : NaN;

  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }

  return 30;
}

/**
 * 根据订阅ID查找用户
 */
export async function findUserBySubscriptionId(
  subscriptionId: string
): Promise<SubscriptionUser | null> {
  logInfo("Searching for user by subscription ID", { subscriptionId });

  if (isChinaRegion()) {
    return findUserBySubscriptionIdCloudBase(subscriptionId);
  } else {
    return findUserBySubscriptionIdSupabase(subscriptionId);
  }
}

async function findUserBySubscriptionIdCloudBase(
  subscriptionId: string
): Promise<SubscriptionUser | null> {
  try {
    const db = getDatabase();

    // 从 payments 表查找
    const paymentsResult = await db
      .collection("payments")
      .where({ transaction_id: subscriptionId })
      .orderBy("created_at", "desc")
      .limit(1)
      .get();

    if (paymentsResult.data && paymentsResult.data.length > 0) {
      logInfo("Found user from CloudBase payments table", {
        subscriptionId,
        userId: paymentsResult.data[0].user_id,
      });
      return { userId: paymentsResult.data[0].user_id };
    }

    // 从 subscriptions 表查找
    const subsResult = await db
      .collection("subscriptions")
      .where({ provider_subscription_id: subscriptionId })
      .orderBy("created_at", "desc")
      .limit(1)
      .get();

    if (subsResult.data && subsResult.data.length > 0) {
      logInfo("Found user from CloudBase subscriptions table", {
        subscriptionId,
        userId: subsResult.data[0].user_id,
      });
      return {
        userId: subsResult.data[0].user_id,
        subscriptionId: subsResult.data[0]._id,
      };
    }

    logError("User not found for subscription ID in CloudBase", undefined, {
      subscriptionId,
    });
    return null;
  } catch (error) {
    logError("Error finding user by subscription ID in CloudBase", error as Error, {
      subscriptionId,
    });
    return null;
  }
}

async function findUserBySubscriptionIdSupabase(
  subscriptionId: string
): Promise<SubscriptionUser | null> {
  // 首先从payments表查找
  const { data: payments, error } = await supabaseAdmin
    .from("payments")
    .select("user_id, status, created_at")
    .eq("transaction_id", subscriptionId)
    .order("status", { ascending: false })
    .order("created_at", { ascending: false })
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

  // 从subscriptions表查找
  const { data: subscription, error: subError } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id, id")
    .eq("provider_subscription_id", subscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subError) {
    logError("Error querying subscriptions table", subError, { subscriptionId });
  }

  if (subscription) {
    logInfo("Found user from subscriptions table", {
      subscriptionId,
      userId: subscription.user_id,
    });
    return { userId: subscription.user_id, subscriptionId: subscription.id };
  }

  logError("User not found for subscription ID", undefined, {
    subscriptionId,
    searchedPayments: true,
    searchedSubscriptions: true,
  });

  return null;
}

/**
 * 更新订阅状态 - 统一入口
 */
export async function updateSubscriptionStatus(
  userId: string,
  subscriptionId: string,
  status: string,
  provider: string,
  amount?: number,
  currency?: string,
  days?: number,
  paypalOrderId?: string
): Promise<boolean> {
  console.log("💎💎💎 [updateSubscriptionStatus] CALLED", {
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
      days,
    });

    const now = new Date();

    if (isChinaRegion()) {
      return await updateSubscriptionStatusCloudBase(
        userId,
        subscriptionId,
        status,
        provider,
        amount,
        currency,
        days,
        operationId,
        now
      );
    } else {
      return await updateSubscriptionStatusSupabase(
        userId,
        subscriptionId,
        status,
        provider,
        amount,
        currency,
        days,
        paypalOrderId,
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
 * 更新订阅状态 - CloudBase 实现
 */
async function updateSubscriptionStatusCloudBase(
  userId: string,
  subscriptionId: string,
  status: string,
  provider: string,
  amount: number | undefined,
  currency: string | undefined,
  days: number | undefined,
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
      days,
    });

    const db = getDatabase();

    // 检查用户是否存在
    const userQuery = await db
      .collection("web_users")
      .where({ _id: userId })
      .get();

    if (!userQuery.data || userQuery.data.length === 0) {
      logSecurityEvent(
        "User not found in CloudBase for subscription update",
        userId,
        undefined,
        { operationId, subscriptionId, provider, status }
      );
      return false;
    }

    // 支付成功回调幂等保护：同一 transaction_id 已完成则跳过续期
    if (status === "active" && amount && currency && subscriptionId) {
      const existingCompletedPayment = await db
        .collection("payments")
        .where({
          transaction_id: subscriptionId,
          status: "completed",
        })
        .limit(1)
        .get();

      if (
        existingCompletedPayment.data &&
        existingCompletedPayment.data.length > 0
      ) {
        logInfo(
          "CloudBase payment already completed, skip duplicate subscription extension",
          {
            operationId,
            userId,
            subscriptionId,
            provider,
            existingPaymentId: existingCompletedPayment.data[0]?._id,
          }
        );
        return true;
      }
    }

    // 更新用户 pro 状态
    const updateData: any = {
      pro: status === "active",
      updated_at: now.toISOString(),
    };

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
        { operationId, userId, subscriptionId, provider }
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

    // 创建或更新订阅记录
    let subscriptionUpdateResult:
      | { success: boolean; expiresAt?: Date }
      | null = null;

    if (status === "active") {
      subscriptionUpdateResult = await createOrUpdateSubscriptionCloudBase(
        db,
        userId,
        subscriptionId,
        status,
        provider,
        days,
        operationId,
        now
      );
    }

    // 同步派生字段，避免 web_users 显示滞后
    if (subscriptionUpdateResult?.success && subscriptionUpdateResult.expiresAt) {
      await db.collection("web_users").doc(userId).update({
        membership_expires_at: subscriptionUpdateResult.expiresAt.toISOString(),
        pro: true,
        updated_at: now.toISOString(),
      });
    }

    // 记录支付
    if (amount && currency) {
      await recordPaymentCloudBase(
        db,
        userId,
        subscriptionId,
        amount,
        currency,
        provider,
        operationId,
        now
      );
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
      { operationId, userId, subscriptionId, status, provider }
    );
    return false;
  }
}

async function createOrUpdateSubscriptionCloudBase(
  db: any,
  userId: string,
  subscriptionId: string,
  status: string,
  provider: string,
  days: number | undefined,
  operationId: string,
  now: Date
): Promise<{ success: boolean; expiresAt?: Date } | null> {
  try {
    // 使用统一的订阅更新函数，避免重复代码
    const result = await updateCloudbaseSubscription({
      userId,
      days: normalizeDays(days),
      transactionId: subscriptionId,
      subscriptionId,
      provider,
      currentDate: now,
    });

    if (!result.success) {
      logError(
        "Failed to update subscription via unified function",
        new Error(result.error),
        { operationId, userId, subscriptionId, provider }
      );
      return { success: false };
    } else {
      logInfo("Subscription updated via unified function", {
        operationId,
        userId,
        subscriptionId: result.subscriptionId,
        expiresAt: result.expiresAt?.toISOString(),
        provider,
      });
      return { success: true, expiresAt: result.expiresAt };
    }
  } catch (error) {
    logError(
      "Error in createOrUpdateSubscriptionCloudBase",
      error as Error,
      { operationId, userId, subscriptionId, provider }
    );
    return { success: false };
  }
}

async function recordPaymentCloudBase(
  db: any,
  userId: string,
  subscriptionId: string,
  amount: number,
  currency: string,
  provider: string,
  operationId: string,
  now: Date
): Promise<void> {
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
    .where({ transaction_id: subscriptionId, status: "completed" })
    .get();

  if (existingPaymentQuery.data && existingPaymentQuery.data.length > 0) {
    logInfo("Payment already exists in CloudBase, skipping duplicate", {
      operationId,
      existingPaymentId: existingPaymentQuery.data[0]._id,
      transactionId: subscriptionId,
    });
    return;
  }

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

/**
 * 更新订阅状态 - Supabase 实现
 */
async function updateSubscriptionStatusSupabase(
  userId: string,
  subscriptionId: string,
  status: string,
  provider: string,
  amount: number | undefined,
  currency: string | undefined,
  days: number | undefined,
  paypalOrderId: string | undefined,
  operationId: string,
  now: Date
): Promise<boolean> {
  try {
    logInfo("Updating subscription status in Supabase (INTL mode)", {
      operationId,
      userId,
      subscriptionId,
      status,
      provider,
      days,
    });

    // 支付成功回调幂等保护：同一 transaction_id 已完成则直接跳过
    if (status === "active" && amount && currency && subscriptionId) {
      const { data: completedPayment, error: completedPaymentError } =
        await supabaseAdmin
          .from("payments")
          .select("id, created_at")
          .eq("transaction_id", subscriptionId)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (completedPaymentError) {
        logWarn("Failed to check completed payment idempotency", {
          operationId,
          userId,
          subscriptionId,
          provider,
          error: completedPaymentError,
        });
      } else if (completedPayment?.id) {
        logInfo(
          "Payment already completed, skip duplicate subscription extension",
          {
            operationId,
            userId,
            subscriptionId,
            provider,
            paymentId: completedPayment.id,
          }
        );
        return true;
      }
    }

    // 检查是否已有活跃订阅（取最新一条，避免 maybeSingle 多行错误）
    const { data: existingSubscriptionData, error: checkError } =
      await supabaseAdmin
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("current_period_end", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (checkError) {
      logError("Failed to check existing subscriptions", checkError, {
        operationId,
        userId,
        subscriptionId,
      });
      return false;
    }

    let subscription;
    const daysNum = normalizeDays(days);

    if (existingSubscriptionData) {
      const updatePayload: Record<string, any> = {
        status,
        provider_subscription_id: subscriptionId,
        updated_at: now.toISOString(),
      };

      if (status === "active") {
        const existingEnd = existingSubscriptionData.current_period_end
          ? new Date(existingSubscriptionData.current_period_end)
          : null;
        const baseTime =
          existingEnd && Number.isFinite(existingEnd.getTime()) && existingEnd > now
            ? existingEnd.getTime()
            : now.getTime();
        const newPeriodEnd = new Date(
          baseTime + daysNum * 24 * 60 * 60 * 1000
        ).toISOString();

        updatePayload.current_period_end = newPeriodEnd;
        updatePayload.expires_at = newPeriodEnd;
        updatePayload.plan_id = existingSubscriptionData.plan_id || "pro";
        updatePayload.plan = existingSubscriptionData.plan || "pro";
        updatePayload.transaction_id = subscriptionId;
      }

      const {
        data: updatedSubscription,
        error: updateError,
        droppedColumns,
      } = await executeWithOptionalColumns({
        payload: updatePayload,
        optionalColumns: OPTIONAL_SUBSCRIPTION_WRITE_COLUMNS,
        tableName: "subscriptions",
        execute: (payload) =>
          supabaseAdmin
            .from("subscriptions")
            .update(payload)
            .eq("id", existingSubscriptionData.id)
            .select()
            .single(),
      });

      if (updateError) {
        logError("Failed to update existing subscription", toCompatError(updateError), {
          operationId,
          userId,
          subscriptionId: existingSubscriptionData.id,
          provider,
        });
        return false;
      }

      if (droppedColumns.length > 0) {
        logWarn("Updated webhook subscription after dropping unsupported columns", {
          operationId,
          userId,
          subscriptionId: existingSubscriptionData.id,
          provider,
          droppedColumns,
        });
      }

      const updatedSubscriptionRow =
        updatedSubscription as SupabaseSubscriptionRow;
      subscription = updatedSubscriptionRow;
      logBusinessEvent("subscription_updated", userId, {
        operationId,
        subscriptionId: updatedSubscriptionRow.id,
        status,
        provider,
        currentPeriodEnd: updatedSubscriptionRow.current_period_end,
        daysAdded: status === "active" ? daysNum : 0,
      });
    } else if (status === "active") {
      const currentPeriodEnd = new Date(
        now.getTime() + daysNum * 24 * 60 * 60 * 1000
      ).toISOString();

      const {
        data: newSubscription,
        error: insertError,
        droppedColumns,
      } = await executeWithOptionalColumns({
        payload: {
          user_id: userId,
          plan_id: "pro",
          plan: "pro",
          status,
          provider_subscription_id: subscriptionId,
          current_period_start: now.toISOString(),
          current_period_end: currentPeriodEnd,
          expires_at: currentPeriodEnd,
          transaction_id: subscriptionId,
        },
        optionalColumns: OPTIONAL_SUBSCRIPTION_WRITE_COLUMNS,
        tableName: "subscriptions",
        execute: (payload) =>
          supabaseAdmin
            .from("subscriptions")
            .insert(payload)
            .select()
            .single(),
      });

      if (insertError) {
        logError("Failed to create new subscription", toCompatError(insertError), {
          operationId,
          userId,
          subscriptionId,
          provider,
        });
        return false;
      }

      if (droppedColumns.length > 0) {
        logWarn("Created webhook subscription after dropping unsupported columns", {
          operationId,
          userId,
          subscriptionId,
          provider,
          droppedColumns,
        });
      }

      const newSubscriptionRow = newSubscription as SupabaseSubscriptionRow;
      subscription = newSubscriptionRow;
      logBusinessEvent("subscription_created", userId, {
        operationId,
        subscriptionId: newSubscriptionRow.id,
        planId: newSubscriptionRow.plan_id,
        provider,
      });
    }

    // 记录支付
    if (amount && currency && subscription) {
      await recordPaymentSupabase(
        userId,
        subscription.id,
        subscriptionId,
        amount,
        currency,
        provider,
        paypalOrderId,
        operationId,
        now
      );
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
      { operationId, userId, subscriptionId, status, provider }
    );
    return false;
  }
}

async function recordPaymentSupabase(
  userId: string,
  subscriptionDbId: string,
  transactionId: string,
  amount: number,
  currency: string,
  provider: string,
  paypalOrderId: string | undefined,
  operationId: string,
  now: Date
): Promise<void> {
  logInfo("Recording payment transaction", {
    operationId,
    userId,
    subscriptionId: subscriptionDbId,
    amount,
    currency,
    provider,
  });

  // 检查是否已存在完成状态的支付记录
  const {
    data: existingCompletedPayment,
    error: existingCompletedPaymentError,
  } = await supabaseAdmin
    .from("payments")
    .select("id, status")
    .eq("transaction_id", transactionId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingCompletedPaymentError) {
    logWarn("Failed to check existing completed payment", {
      operationId,
      userId,
      transactionId,
      error: existingCompletedPaymentError,
    });
  }

  if (existingCompletedPayment) {
    logInfo("Payment already exists with completed status, skipping", {
      operationId,
      existingPaymentId: existingCompletedPayment.id,
      transactionId,
    });
    return;
  }

  // 查找现有 pending 支付记录
  let existingPayment = null;

  // 通过 transaction_id 查找
  const { data: paymentByTransaction, error: paymentByTransactionError } =
    await supabaseAdmin
    .from("payments")
    .select("id, status, created_at")
    .eq("transaction_id", transactionId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (paymentByTransactionError) {
    logWarn("Failed to query pending payment by transaction", {
      operationId,
      userId,
      transactionId,
      error: paymentByTransactionError,
    });
  }

  if (paymentByTransaction) {
    existingPayment = paymentByTransaction;
  }

  // PayPal: 通过 Order ID 查找
  if (!existingPayment && provider === "paypal" && paypalOrderId) {
    const { data: paymentByOrderId } = await supabaseAdmin
      .from("payments")
      .select("id, status, created_at")
      .eq("transaction_id", paypalOrderId)
      .in("status", ["pending", "completed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentByOrderId) {
      existingPayment = paymentByOrderId;
    }
  }

  // 通过用户+金额+时间匹配
  if (!existingPayment) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: paymentsByUserAmount } = await supabaseAdmin
      .from("payments")
      .select("id, status, created_at, transaction_id")
      .eq("user_id", userId)
      .eq("amount", amount)
      .eq("currency", currency)
      .eq("status", "pending")
      .gte("created_at", fiveMinutesAgo)
      .order("created_at", { ascending: false })
      .limit(1);

    if (paymentsByUserAmount && paymentsByUserAmount.length > 0) {
      existingPayment = paymentsByUserAmount[0];
    }
  }

  if (existingPayment) {
    if (existingPayment.status === "completed") {
      logInfo("Payment already completed, skipping", {
        operationId,
        paymentId: existingPayment.id,
      });
      return;
    }

    // 更新现有记录
    const { error: updateError } = await supabaseAdmin
      .from("payments")
      .update({
        status: "completed",
        subscription_id: subscriptionDbId,
        updated_at: now.toISOString(),
      })
      .eq("id", existingPayment.id);

    if (!updateError) {
      logBusinessEvent("payment_status_updated", userId, {
        operationId,
        paymentId: existingPayment.id,
        transactionId,
        oldStatus: "pending",
        newStatus: "completed",
      });
    }
  } else {
    // 创建新支付记录
    const { error: paymentError } = await supabaseAdmin.from("payments").insert({
      user_id: userId,
      subscription_id: subscriptionDbId,
      amount,
      currency,
      status: "completed",
      payment_method: provider,
      transaction_id: transactionId,
    });

    if (!paymentError) {
      logBusinessEvent("payment_recorded", userId, {
        operationId,
        subscriptionId: subscriptionDbId,
        amount,
        currency,
        provider,
        transactionId,
      });
    }
  }
}
