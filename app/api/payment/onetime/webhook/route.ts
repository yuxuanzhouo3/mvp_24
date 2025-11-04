// app/api/payment/onetime/webhook/route.ts - 一次性支付Webhook处理
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logInfo, logError, logWarn, logBusinessEvent } from "@/lib/logger";

/**
 * 延长用户会员时间
 */
async function extendMembership(
  userId: string,
  days: number,
  transactionId: string
): Promise<boolean> {
  try {
    const { data: userProfile, error: fetchError } = await supabaseAdmin
      .from("user_profiles")
      .select("membership_expires_at")
      .eq("id", userId)
      .maybeSingle();

    if (fetchError) {
      logError("Error fetching user profile", fetchError, { userId });
      return false;
    }

    const now = new Date();
    let newExpiresAt: Date;

    if (
      userProfile?.membership_expires_at &&
      new Date(userProfile.membership_expires_at) > now
    ) {
      newExpiresAt = new Date(userProfile.membership_expires_at);
      newExpiresAt.setDate(newExpiresAt.getDate() + days);
    } else {
      newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + days);
    }

    const { error: updateError } = await supabaseAdmin
      .from("user_profiles")
      .update({
        subscription_plan: "premium",
        subscription_status: "active",
        membership_expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

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

        // 更新支付记录
        const { data: payment } = await supabaseAdmin
          .from("payments")
          .select("id, status")
          .eq("transaction_id", transactionId)
          .maybeSingle();

        if (payment && payment.status !== "completed") {
          await supabaseAdmin
            .from("payments")
            .update({
              status: "completed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", payment.id);
        }

        // 延长会员时间
        const success = await extendMembership(userId, days, transactionId);

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
            days,
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

    logInfo("PayPal webhook received", {
      operationId,
      eventType: body.event_type,
      eventId: body.id,
    });

    // 检查事件是否已处理
    const { data: existingEvent } = await supabaseAdmin
      .from("webhook_events")
      .select("id")
      .eq("id", `paypal_${body.id}`)
      .eq("processed", true)
      .maybeSingle();

    if (existingEvent) {
      logInfo("Webhook event already processed", {
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

    // 处理支付成功事件
    if (body.event_type === "CHECKOUT.ORDER.APPROVED") {
      const resource = body.resource;
      const orderId = resource.id;

      // 从 custom_id 获取用户ID
      const userId = resource.purchase_units?.[0]?.custom_id;

      if (!userId) {
        logError("Missing userId in PayPal webhook", undefined, {
          operationId,
          orderId,
        });
        return NextResponse.json({ received: true });
      }

      // 获取支付金额并计算天数
      const amount = parseFloat(
        resource.purchase_units?.[0]?.amount?.value || "0"
      );
      const days = amount > 50 ? 365 : 30;

      // 更新支付记录
      const { data: payment } = await supabaseAdmin
        .from("payments")
        .select("id, status")
        .eq("transaction_id", orderId)
        .maybeSingle();

      if (payment && payment.status !== "completed") {
        await supabaseAdmin
          .from("payments")
          .update({
            status: "completed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", payment.id);
      }

      // 延长会员时间
      const success = await extendMembership(userId, days, orderId);

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
          days,
        });
      }
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
