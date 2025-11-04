// app/api/payment/onetime/confirm/route.ts - 一次性支付确认API
import { NextRequest, NextResponse } from "next/server";
import { PayPalProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/paypal-provider";
import { StripeProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/stripe-provider";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, createAuthErrorResponse } from "@/lib/auth";
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
    // 获取用户当前会员到期时间
    const { data: userProfile, error: fetchError } = await supabaseAdmin
      .from("user_profiles")
      .select("membership_expires_at, subscription_plan")
      .eq("id", userId)
      .maybeSingle();

    if (fetchError) {
      logError("Error fetching user profile", fetchError, {
        userId,
        transactionId,
      });
      return false;
    }

    // 计算新的到期时间
    const now = new Date();
    let newExpiresAt: Date;

    if (
      userProfile?.membership_expires_at &&
      new Date(userProfile.membership_expires_at) > now
    ) {
      // 如果当前还有有效会员,从当前到期时间延长
      newExpiresAt = new Date(userProfile.membership_expires_at);
      newExpiresAt.setDate(newExpiresAt.getDate() + days);
      logInfo("Extending existing membership", {
        userId,
        currentExpiresAt: userProfile.membership_expires_at,
        daysToAdd: days,
        newExpiresAt: newExpiresAt.toISOString(),
      });
    } else {
      // 如果没有有效会员或已过期,从现在开始计算
      newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + days);
      logInfo("Creating new membership", {
        userId,
        daysToAdd: days,
        newExpiresAt: newExpiresAt.toISOString(),
      });
    }

    // 更新用户资料
    const { error: updateError } = await supabaseAdmin
      .from("user_profiles")
      .update({
        subscription_plan: "pro", // 设置为专业版会员
        subscription_status: "active",
        membership_expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      logError("Error updating user profile", updateError, {
        userId,
        newExpiresAt: newExpiresAt.toISOString(),
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
  } catch (error) {
    logError("Error extending membership", error as Error, {
      userId,
      days,
      transactionId,
    });
    return false;
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const operationId = `onetime_confirm_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  try {
    // 验证用户认证
    const authResult = await requireAuth(request);
    if (!authResult) {
      return createAuthErrorResponse();
    }

    const { user } = authResult;
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get("session_id"); // Stripe
    const token = searchParams.get("token"); // PayPal

    logInfo("Processing one-time payment confirmation", {
      operationId,
      userId: user.id,
      hasSessionId: !!sessionId,
      hasToken: !!token,
    });

    if (!sessionId && !token) {
      logWarn("Missing payment confirmation parameters", {
        operationId,
        userId: user.id,
      });
      return NextResponse.json(
        { success: false, error: "Missing payment confirmation parameters" },
        { status: 400 }
      );
    }

    let transactionId = "";
    let amount = 0;
    let currency = "USD";
    let days = 0;

    if (sessionId) {
      // Stripe 支付确认
      logInfo("Confirming Stripe one-time payment", {
        operationId,
        userId: user.id,
        sessionId,
      });

      const stripeProvider = new StripeProvider(process.env);
      const confirmation = await stripeProvider.confirmPayment(sessionId);

      if (!confirmation.success) {
        logWarn("Stripe payment confirmation failed", {
          operationId,
          userId: user.id,
          sessionId,
        });
        return NextResponse.json(
          { success: false, error: "Payment not completed" },
          { status: 400 }
        );
      }

      transactionId = confirmation.transactionId;
      amount = confirmation.amount;
      currency = confirmation.currency;

      // 从 pending payment 中获取天数信息
      const { data: pendingPayment } = await supabaseAdmin
        .from("payments")
        .select("metadata")
        .eq("transaction_id", sessionId)
        .eq("status", "pending")
        .maybeSingle();

      days = pendingPayment?.metadata?.days || (amount > 50 ? 365 : 30);
    } else if (token) {
      // PayPal 支付确认
      logInfo("Confirming PayPal one-time payment", {
        operationId,
        userId: user.id,
        token,
      });

      const paypalProvider = new PayPalProvider(process.env);

      try {
        // 捕获 PayPal 订单
        const captureResult = await paypalProvider.captureOnetimePayment(token);

        if (captureResult.status !== "COMPLETED") {
          logWarn("PayPal payment not completed", {
            operationId,
            userId: user.id,
            token,
            status: captureResult.status,
          });
          return NextResponse.json(
            { success: false, error: "Payment not completed" },
            { status: 400 }
          );
        }

        transactionId = captureResult.id;
        const purchaseUnit = captureResult.purchase_units?.[0];
        amount = parseFloat(purchaseUnit?.amount?.value || "0");
        currency = purchaseUnit?.amount?.currency_code || "USD";

        // 从 pending payment 中获取天数信息
        const { data: pendingPayment } = await supabaseAdmin
          .from("payments")
          .select("metadata")
          .eq("transaction_id", token)
          .eq("status", "pending")
          .maybeSingle();

        days = pendingPayment?.metadata?.days || (amount > 50 ? 365 : 30);
      } catch (error) {
        logError("PayPal capture error", error as Error, {
          operationId,
          userId: user.id,
          token,
        });
        return NextResponse.json(
          {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to capture PayPal payment",
          },
          { status: 500 }
        );
      }
    }

    // 检查是否已存在完成状态的支付记录(防止重复)
    const { data: existingCompletedPayment } = await supabaseAdmin
      .from("payments")
      .select("id, status")
      .eq("transaction_id", transactionId)
      .eq("status", "completed")
      .maybeSingle();

    if (existingCompletedPayment) {
      logInfo("Payment already processed", {
        operationId,
        userId: user.id,
        transactionId,
        existingPaymentId: existingCompletedPayment.id,
      });
      return NextResponse.json({
        success: true,
        message: "Payment already processed",
        transactionId,
      });
    }

    // 查找 pending 支付记录并更新为 completed
    const paymentIdToUpdate = sessionId || token;
    const { data: pendingPayment, error: findError } = await supabaseAdmin
      .from("payments")
      .select("id, amount, currency") // 获取原始金额和货币
      .eq("transaction_id", paymentIdToUpdate)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (findError && findError.code !== "PGRST116") {
      logError("Error finding pending payment", findError, {
        operationId,
        userId: user.id,
        transactionId: paymentIdToUpdate,
      });
    }

    if (pendingPayment) {
      // 如果从支付提供商获取的金额为0,使用 pending 记录中的金额
      if (amount === 0 && pendingPayment.amount) {
        amount = pendingPayment.amount;
        logInfo("Using amount from pending payment", {
          operationId,
          userId: user.id,
          amount,
        });
      }
      if (!currency && pendingPayment.currency) {
        currency = pendingPayment.currency;
      }

      // 更新现有 pending 记录
      logInfo("Updating pending payment to completed", {
        operationId,
        userId: user.id,
        paymentId: pendingPayment.id,
        transactionId,
        amount,
        currency,
      });

      const { error: updateError } = await supabaseAdmin
        .from("payments")
        .update({
          status: "completed",
          transaction_id: transactionId, // 更新为最终的 transaction ID
          amount,
          currency,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pendingPayment.id);

      if (updateError) {
        logError("Error updating payment status", updateError, {
          operationId,
          userId: user.id,
          paymentId: pendingPayment.id,
        });
      }
    } else {
      // 创建新的支付记录(如果找不到 pending 记录)
      logWarn("No pending payment found, creating new record", {
        operationId,
        userId: user.id,
        transactionId,
      });

      const paymentData: any = {
        user_id: user.id,
        amount,
        currency,
        status: "completed",
        payment_method: sessionId ? "stripe" : "paypal",
        transaction_id: transactionId,
      };

      // metadata 字段是可选的,如果表中没有此字段也不会报错
      // 但我们不再依赖它,因为天数可以从金额计算

      const { error: insertError } = await supabaseAdmin
        .from("payments")
        .insert(paymentData);

      if (insertError) {
        logError("Error creating payment record", insertError, {
          operationId,
          userId: user.id,
          transactionId,
        });
      }
    }

    // 延长用户会员时间
    const membershipExtended = await extendMembership(
      user.id,
      days,
      transactionId
    );

    if (!membershipExtended) {
      logError("Failed to extend membership", undefined, {
        operationId,
        userId: user.id,
        transactionId,
        days,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Payment confirmed but failed to extend membership",
        },
        { status: 500 }
      );
    }

    const duration = Date.now() - startTime;
    logInfo("One-time payment confirmed successfully", {
      operationId,
      userId: user.id,
      transactionId,
      amount,
      currency,
      daysAdded: days,
      duration: `${duration}ms`,
    });

    return NextResponse.json({
      success: true,
      transactionId,
      amount,
      currency,
      daysAdded: days,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logError("One-time payment confirmation error", error as Error, {
      operationId,
      duration: `${duration}ms`,
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
