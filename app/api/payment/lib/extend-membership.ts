import { supabaseAdmin } from "@/lib/supabase-admin";
import { isChinaRegion } from "@/lib/config/region";
import { getDatabase } from "@/lib/cloudbase-service";
import { logInfo, logError, logWarn, logBusinessEvent } from "@/lib/logger";

export async function extendMembership(
  userId: string,
  days: number,
  transactionId: string
): Promise<boolean> {
  console.log(
    "🔥🔥🔥 [PAYMENT extendMembership] CALLED - Starting membership extension",
    {
      userId,
      days,
      transactionId,
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
          .or(
            `transaction_id.eq.${transactionId},provider_subscription_id.eq.${transactionId}`
          )
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

        if (existingSubscription.data && existingSubscription.data.length > 0) {
          currentExpiresAt = new Date(
            existingSubscription.data[0].current_period_end
          );
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
        logInfo("Extending existing membership in CloudBase", {
          userId,
          currentExpiresAt: currentExpiresAt.toISOString(),
          daysToAdd: days,
          newExpiresAt: newExpiresAt.toISOString(),
        });
      } else {
        newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + days);
        logInfo("Creating new membership in CloudBase", {
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

        if (existingSubscription.data && existingSubscription.data.length > 0) {
          const subscriptionId = existingSubscription.data[0]._id;
          await db.collection("subscriptions").doc(subscriptionId).update({
            current_period_end: newExpiresAt.toISOString(),
            transaction_id: transactionId,
            updated_at: currentDate.toISOString(),
          });

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
          await db.collection("subscriptions").add({
            user_id: userId,
            plan_id: "pro",
            status: "active",
            current_period_start: currentDate.toISOString(),
            current_period_end: newExpiresAt.toISOString(),
            cancel_at_period_end: false,
            transaction_id: transactionId,
            created_at: currentDate.toISOString(),
            updated_at: currentDate.toISOString(),
          });

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
        const { data: existingSubscriptions } = await supabaseAdmin
          .from("subscriptions")
          .select("current_period_end")
          .eq("user_id", userId)
          .eq("plan_id", "pro");

        if (existingSubscriptions && existingSubscriptions.length > 0) {
          currentExpiresAt = new Date(
            existingSubscriptions[0].current_period_end
          );
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

        const { data: existingSubscriptions } = await supabaseAdmin
          .from("subscriptions")
          .select("id, transaction_id")
          .eq("user_id", userId)
          .eq("plan_id", "pro");

        if (existingSubscriptions && existingSubscriptions.length > 0) {
          const subscriptionId = existingSubscriptions[0].id;
          const existingTransactionId =
            existingSubscriptions[0].transaction_id;

          const updateData: any = {
            current_period_end: newExpiresAt.toISOString(),
            updated_at: currentDate.toISOString(),
          };

          if (!existingTransactionId) {
            updateData.transaction_id = transactionId;
          }

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
              existingTransactionId,
              setTransactionId: !existingTransactionId,
              expiresAt: newExpiresAt.toISOString(),
            }
          );
        } else {
          await supabaseAdmin.from("subscriptions").insert({
            user_id: userId,
            plan_id: "pro",
            status: "active",
            current_period_start: currentDate.toISOString(),
            current_period_end: newExpiresAt.toISOString(),
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
        const { error: updateError } =
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            user_metadata: {
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
