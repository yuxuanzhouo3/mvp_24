import { supabaseAdmin } from "@/lib/supabase-admin";
import { isChinaRegion } from "@/lib/config/region";
import { getDatabase } from "@/lib/cloudbase-service";
import { logInfo, logError, logWarn, logBusinessEvent } from "@/lib/logger";

function getLatestByPeriodEnd<T extends { current_period_end?: string | null }>(
  records?: T[] | null
): T | null {
  if (!records || records.length === 0) {
    return null;
  }

  const sorted = [...records].sort((a, b) => {
    const aTime = new Date(a.current_period_end || 0).getTime();
    const bTime = new Date(b.current_period_end || 0).getTime();
    return bTime - aTime;
  });

  return sorted[0] || null;
}

export async function extendMembership(
  userId: string,
  days: number,
  transactionId: string,
  appleExpiresDate?: number // Apple IAP 可传真实过期时间（毫秒）
): Promise<boolean> {
  console.log(
    "🔥🔥🔥 [PAYMENT extendMembership] CALLED - Starting membership extension",
    {
      userId,
      days,
      transactionId,
      appleExpiresDate,
      isChinaRegion: isChinaRegion(),
    }
  );

  try {
    if (isChinaRegion()) {
      const db = getDatabase();
      const webUsersCollection = db.collection("web_users");
      const subscriptionsCollection = db.collection("subscriptions");

      try {
        const existingRecord = await subscriptionsCollection
          .where({
            user_id: userId,
            transaction_id: transactionId,
          })
          .get();

        if (existingRecord.data && existingRecord.data.length > 0) {
          logInfo("Transaction already processed (idempotent check passed)", {
            userId,
            transactionId,
            existingExpiresAt: existingRecord.data[0].current_period_end,
          });
          return true;
        }
      } catch (error) {
        logWarn("Error checking idempotent status in CloudBase", {
          userId,
          transactionId,
        });
      }

      try {
        const { data: existingByTransaction } = await supabaseAdmin
          .from("subscriptions")
          .select("id")
          .eq("user_id", userId)
          .or(
            `transaction_id.eq.${transactionId},provider_subscription_id.eq.${transactionId}`
          )
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingByTransaction && existingByTransaction.id) {
          logInfo(
            "Transaction already processed in subscriptions (idempotent check passed)",
            {
              userId,
              transactionId,
              subscriptionId: existingByTransaction.id,
            }
          );
          return true;
        }
      } catch (idempotentErr) {
        logWarn("Error checking idempotent status in Supabase subscriptions", {
          userId,
          transactionId,
          error: idempotentErr,
        });
      }

      let currentExpiresAt: Date | null = null;
      try {
        const existingSubscription = await db
          .collection("subscriptions")
          .where({
            user_id: userId,
            plan_id: "pro",
          })
          .get();

        const latestSubscription = getLatestByPeriodEnd(
          existingSubscription.data as any[]
        );
        if (latestSubscription?.current_period_end) {
          currentExpiresAt = new Date(latestSubscription.current_period_end);
        }
      } catch (error) {
        logWarn("Error fetching existing subscription", {
          userId,
          transactionId,
        });
      }

      const now = new Date();
      let newExpiresAt: Date;
      const hasAppleExpiry =
        typeof appleExpiresDate === "number" &&
        Number.isFinite(appleExpiresDate) &&
        appleExpiresDate > 0;

      if (hasAppleExpiry) {
        // Apple IAP：以 Apple 返回过期时间为准
        newExpiresAt = new Date(appleExpiresDate as number);
        logInfo("Using Apple-provided expiration date", {
          userId,
          appleExpiresDate,
          newExpiresAt: newExpiresAt.toISOString(),
        });
      } else if (currentExpiresAt && currentExpiresAt > now) {
        // 其他支付：在现有有效期上续期
        newExpiresAt = new Date(currentExpiresAt);
        newExpiresAt.setDate(newExpiresAt.getDate() + days);
        logInfo("Extending existing membership", {
          userId,
          currentExpiresAt: currentExpiresAt.toISOString(),
          daysToAdd: days,
          newExpiresAt: newExpiresAt.toISOString(),
        });
      } else {
        // 其他支付：从当前时间起算
        newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + days);
        logInfo("Creating new membership from now", {
          userId,
          daysToAdd: days,
          newExpiresAt: newExpiresAt.toISOString(),
        });
      }

      try {
        const currentDate = new Date();

        const existingSubscription = await db
          .collection("subscriptions")
          .where({
            user_id: userId,
            plan_id: "pro",
          })
          .get();

        const latestSubscription = getLatestByPeriodEnd(
          existingSubscription.data as any[]
        ) as any;

        if (latestSubscription?._id) {
          const subscriptionId = latestSubscription._id;
          const updatePayload: any = {
            current_period_end: newExpiresAt.toISOString(),
            transaction_id: transactionId,
            updated_at: currentDate.toISOString(),
          };

          if (hasAppleExpiry) {
            updatePayload.provider_subscription_id = transactionId;
            updatePayload.provider = "apple";
          }

          await db.collection("subscriptions").doc(subscriptionId).update(updatePayload);

          logInfo(
            "Updated subscription record in CloudBase (source of truth)",
            {
              userId,
              subscriptionId,
              transactionId,
              expiresAt: newExpiresAt.toISOString(),
            }
          );
        } else {
          const newPayload: any = {
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

          if (hasAppleExpiry) {
            newPayload.provider_subscription_id = transactionId;
            newPayload.provider = "apple";
          }

          await db.collection("subscriptions").add(newPayload);

          logInfo(
            "Created subscription record in CloudBase (source of truth)",
            {
              userId,
              transactionId,
              planId: "pro",
              expiresAt: newExpiresAt.toISOString(),
            }
          );
        }
      } catch (subscriptionError) {
        logError(
          "Error managing CloudBase subscription record",
          subscriptionError as Error,
          {
            userId,
            transactionId,
          }
        );
        return false;
      }

      try {
        const updateResult = await webUsersCollection.doc(userId).update({
          membership_expires_at: newExpiresAt.toISOString(),
          pro: true,
          updated_at: new Date().toISOString(),
        });

        if (updateResult.updated === 0) {
          logError("Failed to update CloudBase user profile", undefined, {
            userId,
            newExpiresAt: newExpiresAt.toISOString(),
            transactionId,
          });
          return false;
        }

        logInfo("Synced membership time to web_users (derived data)", {
          userId,
          membershipExpiresAt: newExpiresAt.toISOString(),
        });
      } catch (updateError) {
        logError(
          "Error updating CloudBase user profile (derived data)",
          updateError as Error,
          {
            userId,
            transactionId,
          }
        );
        return false;
      }

      logBusinessEvent("membership_extended_cloudbase", userId, {
        transactionId,
        daysAdded: days,
        newExpiresAt: newExpiresAt.toISOString(),
      });

      return true;
    } else {
      let currentExpiresAt: Date | null = null;
      try {
        const { data: existingSubscription } = await supabaseAdmin
          .from("subscriptions")
          .select("current_period_end")
          .eq("user_id", userId)
          .eq("plan_id", "pro")
          .order("current_period_end", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingSubscription?.current_period_end) {
          currentExpiresAt = new Date(existingSubscription.current_period_end);
        }
      } catch (error) {
        logWarn("Error fetching existing subscription", {
          userId,
          transactionId,
        });
      }

      const now = new Date();
      let newExpiresAt: Date;

      if (currentExpiresAt && currentExpiresAt > now) {
        newExpiresAt = new Date(currentExpiresAt);
        newExpiresAt.setDate(newExpiresAt.getDate() + days);
        logInfo("Extending existing membership", {
          userId,
          currentExpiresAt: currentExpiresAt.toISOString(),
          daysToAdd: days,
          newExpiresAt: newExpiresAt.toISOString(),
        });
      } else {
        newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + days);
        logInfo("Creating new membership", {
          userId,
          daysToAdd: days,
          newExpiresAt: newExpiresAt.toISOString(),
        });
      }

      try {
        const currentDate = new Date();

        const { data: existingSubscription } = await supabaseAdmin
          .from("subscriptions")
          .select("id, transaction_id, current_period_end")
          .eq("user_id", userId)
          .eq("plan_id", "pro")
          .order("current_period_end", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingSubscription?.id) {
          const subscriptionId = existingSubscription.id;

          const updateData: any = {
            plan_id: "pro",
            plan: "pro",
            current_period_end: newExpiresAt.toISOString(),
            expires_at: newExpiresAt.toISOString(),
            transaction_id: transactionId,
            updated_at: currentDate.toISOString(),
          };

          await supabaseAdmin
            .from("subscriptions")
            .update(updateData)
            .eq("id", subscriptionId);

          logInfo(
            "Updated subscription record in Supabase (source of truth)",
            {
              userId,
              subscriptionId,
              transactionId,
              expiresAt: newExpiresAt.toISOString(),
            }
          );
        } else {
          await supabaseAdmin.from("subscriptions").insert({
            user_id: userId,
            plan_id: "pro",
            plan: "pro",
            status: "active",
            current_period_start: currentDate.toISOString(),
            current_period_end: newExpiresAt.toISOString(),
            expires_at: newExpiresAt.toISOString(),
            cancel_at_period_end: false,
            payment_method: "wechat",
            transaction_id: transactionId,
            created_at: currentDate.toISOString(),
            updated_at: currentDate.toISOString(),
          });

          logInfo(
            "Created subscription record in Supabase (source of truth)",
            {
              userId,
              transactionId,
              planId: "pro",
              expiresAt: newExpiresAt.toISOString(),
            }
          );
        }
      } catch (subscriptionError) {
        logError(
          "Error managing Supabase subscription record",
          subscriptionError as Error,
          {
            userId,
            transactionId,
          }
        );
        return false;
      }

      try {
        let existingMetadata: Record<string, any> = {};
        try {
          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
            userId
          );
          existingMetadata = (userData?.user?.user_metadata as Record<string, any>) || {};
        } catch (metadataReadError) {
          logWarn("Failed to read existing user metadata before merge", {
            userId,
            transactionId,
            error: metadataReadError,
          });
        }

        const { error: updateError } =
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            user_metadata: {
              ...existingMetadata,
              pro: true,
              subscription_plan: "pro",
              subscription_status: "active",
              membership_expires_at: newExpiresAt.toISOString(),
              updated_at: new Date().toISOString(),
            },
          });

        if (updateError) {
          logError(
            "Error updating user auth metadata (derived data)",
            updateError,
            {
              userId,
              newExpiresAt: newExpiresAt.toISOString(),
              transactionId,
            }
          );
          return false;
        }

        logInfo("Synced membership time to auth metadata (derived data)", {
          userId,
          membershipExpiresAt: newExpiresAt.toISOString(),
        });
      } catch (error) {
        logError("Error updating Supabase auth metadata", error as Error, {
          userId,
          transactionId,
        });
        return false;
      }

      logBusinessEvent("membership_extended", userId, {
        transactionId,
        daysAdded: days,
        newExpiresAt: newExpiresAt.toISOString(),
      });

      return true;
    }
  } catch (error) {
    logError("Error extending membership", error as Error, {
      userId,
      days,
      transactionId,
    });
    return false;
  }
}
