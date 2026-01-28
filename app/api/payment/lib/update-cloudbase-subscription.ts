/**
 * CloudBase 订阅更新函数
 * 用于所有支付方式（支付宝、微信等）统一更新订阅状态
 */

import { getDatabase } from "@/lib/cloudbase-service";
import { logInfo, logError } from "@/lib/logger";

export interface SubscriptionUpdateInput {
  userId: string;
  days: number; // 订阅天数
  transactionId: string;
  subscriptionId?: string; // 第三方平台的订阅ID（可选）
  provider?: string; // 支付提供商（alipay, wechat, stripe等）
  currentDate?: Date;
}

export interface SubscriptionUpdateResult {
  success: boolean;
  subscriptionId?: string;
  expiresAt?: Date;
  error?: string;
}

/**
 * 更新 CloudBase 订阅表（源数据）和 web_users（派生数据）
 * 支持订阅续期和新创建
 */
export async function updateCloudbaseSubscription(
  input: SubscriptionUpdateInput
): Promise<SubscriptionUpdateResult> {
  const { userId, days, transactionId, subscriptionId: thirdPartySubscriptionId, provider, currentDate = new Date() } = input;

  try {
    logInfo("Starting CloudBase subscription update", {
      userId,
      days,
      transactionId,
      provider,
    });

    const db = getDatabase();

    // STEP 1: 获取用户当前订阅（从源数据 subscriptions 读取）
    let currentExpiresAt: Date | null = null;
    let subscriptionId: string | null = null;

    try {
      const existingSubscription = await db
        .collection("subscriptions")
        .where({
          user_id: userId,
          plan_id: "pro",
        })
        .get();

      if (existingSubscription.data && existingSubscription.data.length > 0) {
        const subscription = existingSubscription.data[0];
        currentExpiresAt = new Date(subscription.current_period_end);
        subscriptionId = subscription._id;
        logInfo("Found existing subscription", {
          userId,
          subscriptionId,
          currentExpiresAt: currentExpiresAt.toISOString(),
        });
      }
    } catch (error) {
      logError("Error fetching existing subscription", error as Error, {
        userId,
      });
    }

    // 计算新的到期时间（基于现有订阅或从现在开始）
    const now = new Date();
    let newExpiresAt: Date;

    if (currentExpiresAt && currentExpiresAt > now) {
      // 如果已有有效订阅，从现有到期时间延长
      newExpiresAt = new Date(currentExpiresAt);
      newExpiresAt.setDate(newExpiresAt.getDate() + days);
      logInfo("Extending existing subscription", {
        userId,
        currentExpiresAt: currentExpiresAt.toISOString(),
        newExpiresAt: newExpiresAt.toISOString(),
        daysAdded: days,
      });
    } else {
      // 如果没有有效订阅或已过期，从现在起计算
      newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + days);
      logInfo("Creating new subscription", {
        userId,
        newExpiresAt: newExpiresAt.toISOString(),
        days,
      });
    }

    // STEP 2: 更新或创建 subscriptions 记录（源数据优先）
    try {
      if (subscriptionId) {
        // 更新现有订阅记录
        const updatePayload: any = {
          current_period_end: newExpiresAt.toISOString(),
          transaction_id: transactionId,
          updated_at: currentDate.toISOString(),
        };

        // 添加第三方平台的订阅ID和提供商信息
        if (provider) {
          updatePayload.provider_subscription_id = thirdPartySubscriptionId;
          updatePayload.provider = provider;
        }

        await db
          .collection("subscriptions")
          .doc(subscriptionId)
          .update(updatePayload);

        logInfo("Updated subscription record", {
          userId,
          subscriptionId,
          transactionId,
          provider,
          expiresAt: newExpiresAt.toISOString(),
        });
      } else {
        // 创建新订阅记录
        const payload: any = {
          user_id: userId,
          plan_id: "pro",
          status: "active",
          current_period_start: currentDate.toISOString(),
          current_period_end: newExpiresAt.toISOString(),
          cancel_at_period_end: false,
          transaction_id: transactionId,
          created_at: currentDate.toISOString(),
          updated_at: currentDate.toISOString(),
        };

        // 添加第三方平台的订阅ID和提供商信息
        if (thirdPartySubscriptionId) {
          payload.provider_subscription_id = thirdPartySubscriptionId;
        }
        if (provider) {
          payload.provider = provider;
        }

        const result = await db.collection("subscriptions").add(payload);

        subscriptionId = result._id || result.id;

        logInfo("Created new subscription record", {
          userId,
          subscriptionId,
          transactionId,
          provider,
          expiresAt: newExpiresAt.toISOString(),
        });
      }
    } catch (error) {
      logError("Error updating/creating subscription record", error as Error, {
        userId,
        subscriptionId,
      });
      throw error;
    }

    // STEP 3: 同步到 web_users（派生数据）
    try {
      const webUsersCollection = db.collection("web_users");

      const userQuery = await webUsersCollection
        .where({ _id: userId })
        .get();

      if (userQuery.data && userQuery.data.length > 0) {
        await webUsersCollection.doc(userId).update({
          membership_expires_at: newExpiresAt.toISOString(),
          pro: true,
          updated_at: currentDate.toISOString(),
        });

        logInfo("Synced membership to web_users", {
          userId,
          expiresAt: newExpiresAt.toISOString(),
        });
      }
    } catch (error) {
      logError("Error syncing to web_users", error as Error, {
        userId,
      });
      // 不中断流程，web_users 是派生数据，仅记录错误
    }

    return {
      success: true,
      subscriptionId,
      expiresAt: newExpiresAt,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logError("CloudBase subscription update failed", error as Error, {
      userId: input.userId,
    });
    return {
      success: false,
      error: errorMsg,
    };
  }
}
