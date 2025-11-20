// app/api/payment/confirm/route.ts - 支付确认API路由
import { NextRequest, NextResponse } from "next/server";
import { PayPalProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/paypal-provider";
import { StripeProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/stripe-provider";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { paymentRateLimit } from "@/lib/rate-limit";
import { logBusinessEvent, logError } from "@/lib/logger";

export async function POST(request: NextRequest) {
  // Apply payment rate limiting
  return new Promise<NextResponse>((resolve) => {
    const mockRes = {
      status: (code: number) => ({
        json: (data: any) => resolve(NextResponse.json(data, { status: code })),
      }),
      setHeader: () => {},
      getHeader: () => undefined,
    };

    paymentRateLimit(request as any, mockRes as any, async () => {
      // Rate limit not exceeded, handle the request
      resolve(await handlePaymentConfirm(request));
    });
  });
}

async function handlePaymentConfirm(request: NextRequest) {
  const operationId = `payment_confirm_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  try {
    const body = await request.json();
    const { subscriptionId, baToken, token, planType, billingCycle, userId } =
      body;

    if (!subscriptionId || !planType || !billingCycle || !userId) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters" },
        { status: 400 }
      );
    }

    logBusinessEvent("payment_confirm_started", userId, {
      operationId,
      subscriptionId,
      planType,
      billingCycle,
      hasBaToken: !!baToken,
      hasToken: !!token,
    });

    let confirmation;
    let paymentMethod;

    // 检测支付提供商类型（更健壮：PayPal 可能只带 subscription_id）
    const isPayPal =
      Boolean(baToken || token) ||
      (typeof subscriptionId === "string" && subscriptionId.startsWith("I-"));

    if (isPayPal) {
      // PayPal支付
      paymentMethod = "paypal";
      logBusinessEvent("payment_confirm_paypal", userId, {
        operationId,
        subscriptionId,
        baToken: !!baToken,
        token: !!token,
      });

      const paypalProvider = new PayPalProvider(process.env);
      confirmation = await paypalProvider.confirmPayment(subscriptionId);
    } else {
      // Stripe支付 (subscriptionId 实际上是 session_id)
      paymentMethod = "stripe";
      logBusinessEvent("payment_confirm_stripe", userId, {
        operationId,
        subscriptionId,
      });

      const stripeProvider = new StripeProvider(process.env);
      confirmation = await stripeProvider.confirmPayment(subscriptionId);
    }

    if (confirmation.success) {
      // 更新用户订阅状态 - 订阅模式
      const now = new Date();

      // 更新用户资料中的订阅状态
      const { error: profileUpdateError } = await supabaseAdmin
        .from("user_profiles")
        .update({
          subscription_plan: planType, // pro 或 team
          subscription_status: "active",
          updated_at: now.toISOString(),
        })
        .eq("id", userId);

      if (profileUpdateError) {
        logError("user_profile_update_error", profileUpdateError, {
          operationId,
          userId,
        });
        return NextResponse.json(
          { success: false, error: "Failed to update subscription" },
          { status: 500 }
        );
      }

      // 创建或更新订阅记录
      const { data: existingSubscription, error: checkError } =
        await supabaseAdmin
          .from("subscriptions")
          .select("*")
          .eq("user_id", userId)
          .eq("status", "active")
          .maybeSingle();

      let subscription;

      if (existingSubscription) {
        // 更新现有订阅记录
        const currentPeriodEnd = new Date(now);
        if (billingCycle === "yearly") {
          currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
        } else {
          currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
        }

        const { data: updatedSubscription, error: updateError } =
          await supabaseAdmin
            .from("subscriptions")
            .update({
              plan_id: planType,
              status: "active",
              current_period_start: now.toISOString(),
              current_period_end: currentPeriodEnd.toISOString(),
              cancel_at_period_end: false,
              updated_at: now.toISOString(),
            })
            .eq("id", existingSubscription.id)
            .select()
            .single();

        if (updateError) {
          logError("subscription_update_error", updateError, {
            operationId,
            userId,
            subscriptionId: existingSubscription.id,
          });
          // 不返回错误，继续处理支付记录
        } else {
          subscription = updatedSubscription;
        }
      } else {
        // 创建新的订阅记录
        const currentPeriodEnd = new Date(now);
        if (billingCycle === "yearly") {
          currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
        } else {
          currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
        }

        const { data: newSubscription, error: insertError } =
          await supabaseAdmin
            .from("subscriptions")
            .insert({
              user_id: userId,
              plan_id: planType,
              status: "active",
              current_period_start: now.toISOString(),
              current_period_end: currentPeriodEnd.toISOString(),
              cancel_at_period_end: false,
            })
            .select()
            .single();

        if (insertError) {
          logError("subscription_create_error", insertError, {
            operationId,
            userId,
            planType,
            billingCycle,
          });
          // 不返回错误，继续处理支付记录
        } else {
          subscription = newSubscription;
        }
      }

      // 记录或更新支付信息
      if (subscription && subscription.id) {
        // 关键修复：首先查找是否已有 pending 状态的支付记录
        const { data: existingPayment, error: findPaymentError } =
          await supabaseAdmin
            .from("payments")
            .select("id, status, created_at")
            .eq("user_id", userId)
            .in("status", ["pending", "completed"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (findPaymentError && findPaymentError.code !== "PGRST116") {
          logError("find_payment_error", findPaymentError, {
            operationId,
            userId,
            subscriptionId: subscription.id,
          });
        }

        if (existingPayment) {
          // 更新现有的支付记录为 completed
          if (existingPayment.status === "pending") {
            logBusinessEvent("payment_update_to_completed", userId, {
              operationId,
              paymentId: existingPayment.id,
              transactionId: confirmation.transactionId,
            });

            const { error: updatePaymentError } = await supabaseAdmin
              .from("payments")
              .update({
                subscription_id: subscription.id,
                status: "completed",
                transaction_id: confirmation.transactionId,
                amount: confirmation.amount,
                currency: confirmation.currency,
                updated_at: now.toISOString(),
              })
              .eq("id", existingPayment.id);

            if (updatePaymentError) {
              logError("payment_update_error", updatePaymentError, {
                operationId,
                userId,
                paymentId: existingPayment.id,
              });
            }
          } else {
            // 已经是 completed 状态，可能是 webhook 先处理了
            logBusinessEvent("payment_already_completed", userId, {
              operationId,
              paymentId: existingPayment.id,
              existingStatus: existingPayment.status,
            });
          }
        } else {
          // 没有找到现有支付记录，创建新的（兜底逻辑）
          logBusinessEvent("payment_create_new", userId, {
            operationId,
            subscriptionId: subscription.id,
            transactionId: confirmation.transactionId,
            note: "No existing payment found, creating new",
          });

          const { error: paymentError } = await supabaseAdmin
            .from("payments")
            .insert({
              user_id: userId,
              subscription_id: subscription.id,
              amount: confirmation.amount,
              currency: confirmation.currency,
              status: "completed",
              payment_method: paymentMethod,
              transaction_id: confirmation.transactionId,
            });

          if (paymentError) {
            logError("payment_record_error", paymentError, {
              operationId,
              userId,
              subscriptionId: subscription.id,
              transactionId: confirmation.transactionId,
            });
            // 不返回错误，因为主要操作已成功
          }
        }
      }

      logBusinessEvent("payment_confirm_success", userId, {
        operationId,
        transactionId: confirmation.transactionId,
        amount: confirmation.amount,
        currency: confirmation.currency,
        paymentMethod,
        subscriptionId: subscription?.id || null,
        planType,
        billingCycle,
      });

      return NextResponse.json({
        success: true,
        transactionId: confirmation.transactionId,
        amount: confirmation.amount,
        currency: confirmation.currency,
        subscription: {
          id: subscription?.id || null,
          planId: planType,
          status: "active",
          billingCycle,
        },
      });
    } else {
      logBusinessEvent("payment_confirm_failed", userId, {
        operationId,
        subscriptionId,
        paymentMethod,
        confirmation,
      });
      return NextResponse.json(
        { success: false, error: "Payment confirmation failed" },
        { status: 400 }
      );
    }
  } catch (error) {
    logError(
      "payment_confirm_error",
      error instanceof Error ? error : new Error(String(error)),
      {
        operationId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }
    );
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
