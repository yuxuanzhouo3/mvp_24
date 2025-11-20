// app/api/payment/onetime/webhook/route.ts - 一次性支付Webhook处理
import { NextRequest, NextResponse } from "next/server";
import { isChinaRegion } from "@/lib/config/region";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getDatabase } from "@/lib/cloudbase-service";
import { logInfo, logError, logWarn, logBusinessEvent } from "@/lib/logger";

/**
 * 延长用户会员时间（修复版本）
 * 架构：subscriptions 表是源数据（source of truth），web_users.membership_expires_at 是派生数据
 * 修复点：
 * 1. 现在正确地更新 subscriptions 表（源数据）
 * 2. 添加幂等性检查：同一个 transaction_id 只处理一次，防止重复累加天数
 * 3. 同步流程：subscriptions FIRST → web_users SECOND
 */
async function extendMembership(
  userId: string,
  days: number,
  transactionId: string
): Promise<boolean> {
  console.log("🔥🔥🔥 [WEBHOOK extendMembership] CALLED - Starting membership extension", {
    userId,
    days,
    transactionId,
    isChinaRegion: isChinaRegion(),
  });

  try {
    if (isChinaRegion()) {
      // CloudBase 用户
      const db = getDatabase();
      const webUsersCollection = db.collection("web_users");
      const subscriptionsCollection = db.collection("subscriptions");

      // 🔐 步骤1：幂等性检查 - 检查这个 transaction_id 是否已经处理过
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
          return true; // 已处理过，直接返回成功
        }
      } catch (error) {
        logWarn("Error checking idempotent status in CloudBase", {
          userId,
          transactionId,
        });
        // 继续处理，不因为检查失败而中断流程
      }

      // 步骤2：获取用户当前会员到期时间（从 subscriptions 源数据读取）
      let currentExpiresAt: Date | null = null;
      let subscriptionId: string | null = null;

      try {
        const existingSubscription = await subscriptionsCollection
          .where({
            user_id: userId,
            plan_id: "pro",
          })
          .get();

        if (existingSubscription.data && existingSubscription.data.length > 0) {
          const subscription = existingSubscription.data[0];
          currentExpiresAt = new Date(subscription.current_period_end);
          subscriptionId = subscription._id;
        }
      } catch (error) {
        logWarn("Error fetching existing subscription from CloudBase", {
          userId,
          transactionId,
        });
      }

      // 步骤3：计算新的到期时间
      const now = new Date();
      let newExpiresAt: Date;

      if (currentExpiresAt && currentExpiresAt > now) {
        // 如果当前还有有效会员，从现有到期时间延长
        newExpiresAt = new Date(currentExpiresAt);
        newExpiresAt.setDate(newExpiresAt.getDate() + days);
        logInfo("Extending existing membership in CloudBase webhook", {
          userId,
          currentExpiresAt: currentExpiresAt.toISOString(),
          daysToAdd: days,
          newExpiresAt: newExpiresAt.toISOString(),
        });
      } else {
        // 如果没有有效会员或已过期，从现在开始计算
        newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + days);
        logInfo("Creating new membership in CloudBase webhook", {
          userId,
          daysToAdd: days,
          newExpiresAt: newExpiresAt.toISOString(),
        });
      }

      // 步骤4：FIRST - 更新或创建 subscriptions 记录（源数据优先）
      try {
        const currentDate = new Date();

        if (subscriptionId) {
          // 更新现有订阅记录
          await subscriptionsCollection.doc(subscriptionId).update({
            current_period_end: newExpiresAt.toISOString(),
            transaction_id: transactionId,
            updated_at: currentDate.toISOString(),
          });

          logInfo(
            "Updated subscription record in CloudBase webhook (source of truth)",
            {
              userId,
              subscriptionId,
              transactionId,
              expiresAt: newExpiresAt.toISOString(),
            }
          );
        } else {
          // 如果没有订阅记录，创建新记录
          await subscriptionsCollection.add({
            user_id: userId,
            plan_id: "pro",
            status: "active",
            current_period_start: currentDate.toISOString(),
            current_period_end: newExpiresAt.toISOString(),
            cancel_at_period_end: false,
            payment_method: "onetime",
            transaction_id: transactionId,
            created_at: currentDate.toISOString(),
            updated_at: currentDate.toISOString(),
          });

          logInfo(
            "Created subscription record in CloudBase webhook (source of truth)",
            {
              userId,
              transactionId,
              expiresAt: newExpiresAt.toISOString(),
            }
          );
        }
      } catch (subscriptionError) {
        logError(
          "Error managing CloudBase subscription record in webhook",
          subscriptionError as Error,
          {
            userId,
            transactionId,
          }
        );
        return false; // 源数据更新失败，中断流程
      }

      // 步骤5：SECOND - 同步到 web_users（派生数据）
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
        logError("Error updating CloudBase membership", updateError as Error, {
          userId,
          newExpiresAt: newExpiresAt.toISOString(),
          transactionId,
        });
        return false;
      }

      logBusinessEvent("membership_extended_cloudbase_webhook", userId, {
        transactionId,
        daysAdded: days,
        newExpiresAt: newExpiresAt.toISOString(),
      });

      return true;
    } else {
      // Supabase 用户 - 从 auth user metadata 读取和更新（保持原样，国外版）
      // 🔐 SUPABASE 幂等性检查：确保相同 transaction_id 或 provider_subscription_id 不会被重复处理
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
          return true; // 已处理过，直接返回成功
        }
      } catch (idempotentErr) {
        logWarn(
          "Error checking idempotent status in Supabase subscriptions for webhook",
          {
            userId,
            transactionId,
            error: idempotentErr,
          }
        );
      }
      const {
        data: { user: authUser },
        error: fetchError,
      } = await supabaseAdmin.auth.admin.getUserById(userId);

      if (fetchError || !authUser) {
        logError(
          "Error fetching user from Supabase auth",
          fetchError as Error | undefined,
          { userId }
        );
        return false;
      }

      const now = new Date();
      let newExpiresAt: Date;
      const currentMembershipExpires =
        authUser.user_metadata?.membership_expires_at;

      if (
        currentMembershipExpires &&
        new Date(currentMembershipExpires) > now
      ) {
        newExpiresAt = new Date(currentMembershipExpires);
        newExpiresAt.setDate(newExpiresAt.getDate() + days);
      } else {
        newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + days);
      }

      const { error: updateError } =
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...(authUser.user_metadata || {}),
            pro: true,
            subscription_plan: "premium",
            subscription_status: "active",
            membership_expires_at: newExpiresAt.toISOString(),
            updated_at: new Date().toISOString(),
          },
        });

      if (updateError) {
        logError("Error updating user profile", updateError, { userId });
        return false;
      }

      logBusinessEvent("membership_extended_via_webhook", userId, {
        transactionId,
        daysAdded: days,
        newExpiresAt: newExpiresAt.toISOString(),
      });

      return true;
    }
  } catch (error) {
    logError("Error extending membership", error as Error, { userId, days });
    return false;
  }
}

/**
 * 处理 Stripe Webhook
 */
async function handleStripeWebhook(
  request: NextRequest
): Promise<NextResponse> {
  const operationId = `stripe_webhook_${Date.now()}`;

  try {
    const body = await request.text();
    const event = JSON.parse(body);

    logInfo("Stripe webhook received", {
      operationId,
      eventType: event.type,
      eventId: event.id,
    });

    // 检查事件是否已处理(幂等性)
    const { data: existingEvent } = await supabaseAdmin
      .from("webhook_events")
      .select("id")
      .eq("id", `stripe_${event.id}`)
      .eq("processed", true)
      .maybeSingle();

    if (existingEvent) {
      logInfo("Webhook event already processed", {
        operationId,
        eventId: event.id,
      });
      return NextResponse.json({ received: true });
    }

    // 记录 webhook 事件
    await supabaseAdmin.from("webhook_events").upsert({
      id: `stripe_${event.id}`,
      provider: "stripe",
      event_type: event.type,
      event_data: event,
      processed: false,
      created_at: new Date().toISOString(),
    });

    // 处理支付成功事件
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (session.payment_status === "paid" && session.mode === "payment") {
        // 一次性支付成功
        const userId = session.metadata?.userId;
        const days = parseInt(session.metadata?.days || "30", 10);
        const transactionId = session.id;

        if (!userId) {
          logError("Missing userId in webhook metadata", undefined, {
            operationId,
            sessionId: session.id,
          });
          return NextResponse.json({ received: true });
        }

        const amount = session.amount_total ? session.amount_total / 100 : 0;
        const currency = session.currency?.toUpperCase() || "USD";

        logInfo("Processing Stripe payment webhook", {
          operationId,
          userId,
          transactionId,
          amount,
          currency,
          days,
        });

        // 1️⃣ 查找或创建支付记录
        const { data: existingPayment, error: findPaymentError } =
          await supabaseAdmin
            .from("payments")
            .select("id, status, subscription_id")
            .eq("transaction_id", transactionId)
            .maybeSingle();

        let paymentId = existingPayment?.id;
        let subscriptionId = existingPayment?.subscription_id;

        if (existingPayment && existingPayment.status !== "completed") {
          // 更新现有支付记录
          logInfo("Updating existing payment record", {
            operationId,
            paymentId: existingPayment.id,
            oldStatus: existingPayment.status,
          });

          const { error: updateError } = await supabaseAdmin
            .from("payments")
            .update({
              status: "completed",
              amount,
              currency,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingPayment.id);

          if (updateError) {
            logError("Error updating payment status", updateError, {
              operationId,
              paymentId: existingPayment.id,
            });
          }

          subscriptionId = existingPayment.subscription_id;
        } else if (!existingPayment) {
          // 创建新的支付记录
          logInfo("Creating new payment record from webhook", {
            operationId,
            userId,
            transactionId,
          });

          const { data: newPayment, error: insertError } = await supabaseAdmin
            .from("payments")
            .insert({
              user_id: userId,
              amount,
              currency,
              status: "completed",
              payment_method: "stripe",
              transaction_id: transactionId,
            })
            .select("id, subscription_id")
            .single();

          if (insertError) {
            logError(
              "Error creating payment record from webhook",
              insertError,
              {
                operationId,
                userId,
                transactionId,
              }
            );
          } else if (newPayment) {
            paymentId = newPayment.id;
            subscriptionId = newPayment.subscription_id;
            logInfo("Payment record created from webhook", {
              operationId,
              paymentId: newPayment.id,
            });
          }
        }

        // 2️⃣ 确保有订阅记录
        if (!subscriptionId) {
          logInfo("Creating subscription for payment", {
            operationId,
            userId,
            paymentId,
          });

          const currentDate = new Date();
          const expiresDate = new Date();
          expiresDate.setDate(expiresDate.getDate() + days);

          const { data: newSubscription, error: subInsertError } =
            await supabaseAdmin
              .from("subscriptions")
              .insert({
                user_id: userId,
                plan_id: "pro",
                status: "active",
                current_period_start: currentDate.toISOString(),
                current_period_end: expiresDate.toISOString(),
                cancel_at_period_end: false,
                provider_subscription_id: transactionId,
              })
              .select("id")
              .single();

          if (subInsertError) {
            logError(
              "Error creating subscription from webhook",
              subInsertError,
              {
                operationId,
                userId,
              }
            );
          } else if (newSubscription && paymentId) {
            subscriptionId = newSubscription.id;
            logInfo("Subscription created from webhook", {
              operationId,
              subscriptionId: newSubscription.id,
            });

            // 关联支付记录和订阅
            const { error: linkError } = await supabaseAdmin
              .from("payments")
              .update({ subscription_id: newSubscription.id })
              .eq("id", paymentId);

            if (linkError) {
              logError("Error linking payment to subscription", linkError, {
                operationId,
                paymentId,
                subscriptionId: newSubscription.id,
              });
            }
          }
        }

        // 3️⃣ 延长会员时间
        // Supabase: 避免 webhook 与 confirm 同时触发导致重复扩展
        let success = false;
        if (!isChinaRegion()) {
          try {
            const { data: existingSub } = await supabaseAdmin
              .from("subscriptions")
              .select("id")
              .or(
                `transaction_id.eq.${transactionId},provider_subscription_id.eq.${transactionId}`
              )
              .maybeSingle();

            if (existingSub && existingSub.id) {
              logInfo(
                "Subscription already exists for transaction - skipping extendMembership (stripe webhook)",
                {
                  operationId,
                  userId,
                  transactionId,
                  subscriptionId: existingSub.id,
                }
              );
              success = true; // 已处理
            } else {
              success = await extendMembership(userId, days, transactionId);
            }
          } catch (err) {
            logWarn(
              "Error checking supabase subscription idempotency (stripe webhook)",
              {
                operationId,
                userId,
                transactionId,
                err,
              }
            );
            success = await extendMembership(userId, days, transactionId);
          }
        } else {
          success = await extendMembership(userId, days, transactionId);
        }

        if (success) {
          // 标记为已处理
          await supabaseAdmin
            .from("webhook_events")
            .update({
              processed: true,
              processed_at: new Date().toISOString(),
            })
            .eq("id", `stripe_${event.id}`);

          logBusinessEvent("stripe_onetime_payment_processed", userId, {
            operationId,
            transactionId,
            paymentId,
            subscriptionId,
            amount,
            currency,
            days,
          });

          logInfo("Stripe webhook processing completed successfully", {
            operationId,
            userId,
            transactionId,
            paymentId,
            subscriptionId,
          });
        } else {
          logError("Failed to extend membership from webhook", undefined, {
            operationId,
            userId,
            transactionId,
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logError("Stripe webhook error", error as Error, { operationId });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

/**
 * 处理 PayPal Webhook
 */
async function handlePayPalWebhook(
  request: NextRequest
): Promise<NextResponse> {
  const operationId = `paypal_webhook_${Date.now()}`;

  try {
    const body = await request.json();

    console.log("🔔🔔🔔 [PayPal Webhook] RECEIVED - Starting webhook processing", {
      operationId,
      eventType: body.event_type,
      eventId: body.id,
      resourceId: body.resource?.id,
    });

    // 检查事件是否已处理
    const { data: existingEvent } = await supabaseAdmin
      .from("webhook_events")
      .select("id")
      .eq("id", `paypal_${body.id}`)
      .eq("processed", true)
      .maybeSingle();

    if (existingEvent) {
      console.log("⏭️⏭️⏭️ [PayPal Webhook] Event already processed - SKIPPING", {
        operationId,
        eventId: body.id,
      });
      return NextResponse.json({ received: true });
    }

    // 记录事件
    await supabaseAdmin.from("webhook_events").upsert({
      id: `paypal_${body.id}`,
      provider: "paypal",
      event_type: body.event_type,
      event_data: body,
      processed: false,
      created_at: new Date().toISOString(),
    });

    // ✅ 修复:只处理PAYMENT.CAPTURE.COMPLETED,不处理CHECKOUT.ORDER.APPROVED
    // 原因:一次PayPal支付会触发两个webhook事件,处理两次会导致会员时间翻倍
    // 1. CHECKOUT.ORDER.APPROVED (订单批准,钱还没扣)
    // 2. PAYMENT.CAPTURE.COMPLETED (支付完成,钱已到账)
    if (body.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      const resource = body.resource;
      const captureId = resource.id;

      // 从 supplementary_data 获取 order_id
      const orderId = resource.supplementary_data?.related_ids?.order_id || captureId;

      logInfo("PayPal CAPTURE event IDs", {
        operationId,
        captureId,
        orderId,
        hasSupplementaryData: !!resource.supplementary_data,
        relatedIds: resource.supplementary_data?.related_ids,
      });

      // 从 custom_id 获取用户ID
      const userId = resource.custom_id;

      if (!userId) {
        logError("Missing userId in PayPal webhook", undefined, {
          operationId,
          captureId,
          orderId,
        });
        return NextResponse.json({ received: true });
      }

      // 获取支付金额 (PAYMENT.CAPTURE.COMPLETED 事件中金额在 resource.amount)
      const amount = parseFloat(resource.amount?.value || "0");
      const currency = resource.amount?.currency_code || "USD";

      // ✅ 修复：从 payments 表读取 days，而不是从金额推断
      // 注意: orderId 是 CHECKOUT.ORDER.APPROVED 时创建的订单ID
      // captureId 是 PAYMENT.CAPTURE.COMPLETED 时的捕获ID
      // 我们需要通过 orderId 查找之前创建的payment记录
      // 🔧 修复: 如果orderId查不到,尝试用captureId查找(因为confirm API可能已经更新了transaction_id)
      let days = 30; // 默认值
      let paymentRecord: any = null;

      try {
        // 首先尝试通过orderId查找
        const { data: recordByOrderId } = await supabaseAdmin
          .from("payments")
          .select("metadata, billing_cycle, id, transaction_id")
          .eq("transaction_id", orderId)
          .maybeSingle();

        if (recordByOrderId) {
          paymentRecord = recordByOrderId;
          logInfo("PayPal: found payment by orderId", {
            orderId,
            paymentId: recordByOrderId.id,
          });
        } else {
          // 如果找不到,尝试通过captureId查找(可能confirm API已经更新了transaction_id)
          const { data: recordByCaptureId } = await supabaseAdmin
            .from("payments")
            .select("metadata, billing_cycle, id, transaction_id")
            .eq("transaction_id", captureId)
            .maybeSingle();

          if (recordByCaptureId) {
            paymentRecord = recordByCaptureId;
            logInfo("PayPal: found payment by captureId", {
              captureId,
              paymentId: recordByCaptureId.id,
            });
          }
        }

        if (paymentRecord) {
          // 优先从 metadata.days 读取，其次从 billing_cycle 计算
          days = paymentRecord.metadata?.days || (paymentRecord.billing_cycle === "yearly" ? 365 : 30);
          logInfo("PayPal: days from payment record", {
            orderId,
            captureId,
            days,
            billingCycle: paymentRecord.billing_cycle,
            metadataDays: paymentRecord.metadata?.days,
            transactionId: paymentRecord.transaction_id,
          });
        } else {
          logWarn("PayPal: payment record not found by orderId or captureId, using default days", {
            orderId,
            captureId,
            defaultDays: days,
          });
        }
      } catch (err) {
        logWarn("PayPal: error reading payment record", {
          orderId,
          captureId,
          error: err,
          defaultDays: days,
        });
      }

      logInfo("Processing PayPal payment webhook", {
        operationId,
        userId,
        orderId,
        amount,
        currency,
        days,
      });

      // 1️⃣ 查找或创建支付记录
      // 🔧 关键修复: 同时尝试用orderId和captureId查找,因为confirm API可能已经更新了transaction_id
      let existingPayment: any = null;

      // 首先尝试通过orderId查找
      const { data: paymentByOrderId } = await supabaseAdmin
        .from("payments")
        .select("id, status, subscription_id")
        .eq("transaction_id", orderId)
        .maybeSingle();

      if (paymentByOrderId) {
        existingPayment = paymentByOrderId;
        logInfo("Found existing payment by orderId", {
          operationId,
          paymentId: paymentByOrderId.id,
          orderId,
        });
      } else {
        // 如果找不到,尝试通过captureId查找
        const { data: paymentByCaptureId } = await supabaseAdmin
          .from("payments")
          .select("id, status, subscription_id")
          .eq("transaction_id", captureId)
          .maybeSingle();

        if (paymentByCaptureId) {
          existingPayment = paymentByCaptureId;
          logInfo("Found existing payment by captureId", {
            operationId,
            paymentId: paymentByCaptureId.id,
            captureId,
          });
        }
      }

      let paymentId = existingPayment?.id;
      let subscriptionId = existingPayment?.subscription_id;

      // ✅ 关键修复: 如果payment已经是completed状态,说明已经处理过,直接返回成功
      if (existingPayment && existingPayment.status === "completed") {
        logInfo("Payment already processed (completed status), skipping duplicate webhook", {
          operationId,
          paymentId: existingPayment.id,
          orderId,
          transactionId: orderId,
        });

        // 标记webhook为已处理
        await supabaseAdmin
          .from("webhook_events")
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
          })
          .eq("id", `paypal_${body.id}`);

        return NextResponse.json({ received: true });
      }

      if (existingPayment && existingPayment.status !== "completed") {
        // 更新现有支付记录为已完成
        logInfo("Updating existing payment record to completed", {
          operationId,
          paymentId: existingPayment.id,
          oldStatus: existingPayment.status,
        });

        const { error: updateError } = await supabaseAdmin
          .from("payments")
          .update({
            status: "completed",
            amount,
            currency,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingPayment.id);

        if (updateError) {
          logError("Error updating payment status", updateError, {
            operationId,
            paymentId: existingPayment.id,
          });
        }

        subscriptionId = existingPayment.subscription_id;
      } else if (!existingPayment) {
        // 创建新的支付记录（如果 webhook 先于 /confirm 到达）
        logInfo("Creating new payment record from webhook", {
          operationId,
          userId,
          orderId,
        });

        const { data: newPayment, error: insertError } = await supabaseAdmin
          .from("payments")
          .insert({
            user_id: userId,
            amount,
            currency,
            status: "completed",
            payment_method: "paypal",
            transaction_id: orderId,
          })
          .select("id, subscription_id")
          .single();

        if (insertError) {
          logError("Error creating payment record from webhook", insertError, {
            operationId,
            userId,
            orderId,
          });
        } else if (newPayment) {
          paymentId = newPayment.id;
          subscriptionId = newPayment.subscription_id;
          logInfo("Payment record created from webhook", {
            operationId,
            paymentId: newPayment.id,
          });
        }
      }

      // 2️⃣ 确保有订阅记录
      if (!subscriptionId) {
        // 创建或查找订阅记录
        logInfo("Creating subscription for payment", {
          operationId,
          userId,
          paymentId,
        });

        const currentDate = new Date();
        const expiresDate = new Date();
        expiresDate.setDate(expiresDate.getDate() + days);

        const { data: newSubscription, error: subInsertError } =
          await supabaseAdmin
            .from("subscriptions")
            .insert({
              user_id: userId,
              plan_id: "pro",
              status: "active",
              current_period_start: currentDate.toISOString(),
              current_period_end: expiresDate.toISOString(),
              cancel_at_period_end: false,
              provider_subscription_id: orderId, // 关联 PayPal orderId
            })
            .select("id")
            .single();

        if (subInsertError) {
          logError("Error creating subscription from webhook", subInsertError, {
            operationId,
            userId,
          });
        } else if (newSubscription && paymentId) {
          subscriptionId = newSubscription.id;
          logInfo("Subscription created from webhook", {
            operationId,
            subscriptionId: newSubscription.id,
          });

          // 关联支付记录和订阅
          const { error: linkError } = await supabaseAdmin
            .from("payments")
            .update({ subscription_id: newSubscription.id })
            .eq("id", paymentId);

          if (linkError) {
            logError("Error linking payment to subscription", linkError, {
              operationId,
              paymentId,
              subscriptionId: newSubscription.id,
            });
          }
        }
      }

      // 3️⃣ 延长会员时间（更新 auth metadata）
      // Supabase: 避免 webhook / confirm 双重扩展，优先检查 subscriptions 中是否已存在与 transaction 关联的记录
      let success = false;
      if (!isChinaRegion()) {
        try {
          const { data: existingSub } = await supabaseAdmin
            .from("subscriptions")
            .select("id")
            .or(
              `transaction_id.eq.${orderId},provider_subscription_id.eq.${orderId}`
            )
            .maybeSingle();

          if (existingSub && existingSub.id) {
            logInfo(
              "Subscription already exists for transaction - skipping extendMembership (webhook)",
              {
                operationId,
                userId,
                orderId,
                subscriptionId: existingSub.id,
              }
            );
            success = true; // 已处理
          } else {
            console.log("✅✅✅ [PayPal Webhook] No existing subscription found - calling extendMembership", {
              operationId,
              userId,
              orderId,
              days,
            });
            success = await extendMembership(userId, days, orderId);
          }
        } catch (err) {
          logWarn(
            "Error during supabase subscription idempotency check (webhook)",
            {
              operationId,
              userId,
              orderId,
              err,
            }
          );
          // 兜底：尝试延长
          console.log("⚠️⚠️⚠️ [PayPal Webhook] Idempotency check failed - calling extendMembership as fallback", {
            operationId,
            userId,
            orderId,
            days,
          });
          success = await extendMembership(userId, days, orderId);
        }
      } else {
        console.log("🇨🇳🇨🇳🇨🇳 [PayPal Webhook] China region - calling extendMembership", {
          operationId,
          userId,
          orderId,
          days,
        });
        success = await extendMembership(userId, days, orderId);
      }

      if (success) {
        await supabaseAdmin
          .from("webhook_events")
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
          })
          .eq("id", `paypal_${body.id}`);

        logBusinessEvent("paypal_onetime_payment_processed", userId, {
          operationId,
          transactionId: orderId,
          paymentId,
          subscriptionId,
          amount,
          currency,
          days,
        });

        logInfo("PayPal webhook processing completed successfully", {
          operationId,
          userId,
          orderId,
          paymentId,
          subscriptionId,
        });
      } else {
        logError("Failed to extend membership from webhook", undefined, {
          operationId,
          userId,
          orderId,
        });
      }
    } else if (body.event_type === "CHECKOUT.ORDER.APPROVED") {
      // ✅ 只记录日志,不处理支付成功逻辑(避免重复增加会员时间)
      const resource = body.resource;
      logInfo("PayPal order approved, waiting for capture completion", {
        operationId,
        eventType: body.event_type,
        orderId: resource.id,
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logError("PayPal webhook error", error as Error, { operationId });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // 根据请求头判断是哪个提供商的 webhook
  const stripeSignature = request.headers.get("stripe-signature");

  if (stripeSignature) {
    return handleStripeWebhook(request);
  } else {
    // 默认为 PayPal
    return handlePayPalWebhook(request);
  }
}
