// app/api/payment/continue/route.ts - 继续支付API路由
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PayPalProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/paypal-provider";
import { StripeProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/stripe-provider";
import { AlipayProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/alipay-provider";
import { paymentRateLimit } from "@/lib/rate-limit";
import { logBusinessEvent, logError, logSecurityEvent } from "@/lib/logger";
import { getDatabase } from "@/lib/auth-utils";
import { isChinaRegion } from "@/lib/config/region";

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
      resolve(await handlePaymentContinue(request));
    });
  });
}

async function handlePaymentContinue(request: NextRequest) {
  const operationId = `payment_continue_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  try {
    const body = await request.json();
    const { paymentId } = body;

    if (!paymentId) {
      return NextResponse.json(
        { success: false, error: "Payment ID is required" },
        { status: 400 }
      );
    }

    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      logSecurityEvent(
        "payment_continue_unauthorized",
        undefined,
        request.headers.get("x-forwarded-for") || "unknown",
        {
          operationId,
          reason: "missing_authorization_header",
        }
      );
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    logBusinessEvent("payment_continue_requested", undefined, {
      operationId,
      paymentId,
    });

    // 从数据库获取支付记录
    let payment: any = null;
    let fetchError: any = null;

    if (isChinaRegion()) {
      // CloudBase 查询
      try {
        const db = getDatabase();
        const result = await db.collection("payments").doc(paymentId).get();
        if (result.data && result.data.length > 0) {
          payment = result.data[0];
        }
      } catch (error) {
        fetchError = error;
      }
    } else {
      // Supabase 查询
      const { data, error } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("id", paymentId)
        .single();

      payment = data;
      fetchError = error;
    }

    if (fetchError || !payment) {
      logBusinessEvent("payment_continue_not_found", undefined, {
        operationId,
        paymentId,
        fetchError: fetchError?.message || String(fetchError),
      });
      return NextResponse.json(
        { success: false, error: "Payment not found" },
        { status: 404 }
      );
    }

    // 只有待处理的订单可以继续支付
    if (payment.status !== "pending") {
      logBusinessEvent("payment_continue_invalid_status", payment.user_id, {
        operationId,
        paymentId,
        currentStatus: payment.status,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Only pending payments can be continued",
        },
        { status: 400 }
      );
    }

    // 检查订单是否过期（创建后30分钟）
    const createdAt = new Date(payment.created_at);
    const now = new Date();
    const timeDiff = now.getTime() - createdAt.getTime();
    const minutesDiff = timeDiff / (1000 * 60);

    logBusinessEvent("payment_continue_expiry_check", payment.user_id, {
      operationId,
      paymentId,
      minutesDiff,
      isExpired: minutesDiff > 30,
    });

    // 如果超过30分钟，需要创建新的支付会话
    if (minutesDiff > 30) {
      // 从 payment 记录中提取必要信息重新创建支付
      const order = {
        amount: payment.amount,
        currency: payment.currency,
        description: `Retry payment for order ${payment.id}`,
        userId: payment.user_id,
        planType: extractPlanTypeFromPayment(payment),
        billingCycle: extractBillingCycleFromPayment(payment),
      };

      let result;

      // 根据原支付方式重新创建支付
      if (payment.payment_method === "paypal") {
        logBusinessEvent("payment_continue_paypal_retry", payment.user_id, {
          operationId,
          paymentId,
        });
        const paypalProvider = new PayPalProvider(process.env);
        result = await paypalProvider.createPayment(order);
      } else if (payment.payment_method === "stripe") {
        logBusinessEvent("payment_continue_stripe_retry", payment.user_id, {
          operationId,
          paymentId,
        });
        const stripeProvider = new StripeProvider(process.env);
        result = await stripeProvider.createPayment(order);
      } else {
        logBusinessEvent(
          "payment_continue_unsupported_method",
          payment.user_id,
          {
            operationId,
            paymentId,
            method: payment.payment_method,
          }
        );
        return NextResponse.json(
          { success: false, error: "Unsupported payment method" },
          { status: 400 }
        );
      }

      if (result && result.success) {
        // 更新原订单的 transaction_id
        if (isChinaRegion()) {
          // CloudBase 更新
          const db = getDatabase();
          await db.collection("payments").doc(paymentId).update({
            transaction_id: result.paymentId,
            updated_at: new Date().toISOString(),
          });
        } else {
          // Supabase 更新
          await supabaseAdmin
            .from("payments")
            .update({
              transaction_id: result.paymentId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", paymentId);
        }

        logBusinessEvent(
          "payment_continue_new_session_created",
          payment.user_id,
          {
            operationId,
            paymentId,
            newTransactionId: result.paymentId,
            paymentUrl: result.paymentUrl,
          }
        );

        return NextResponse.json({
          success: true,
          paymentUrl: result.paymentUrl,
          paymentId: result.paymentId,
        });
      } else {
        logError(
          "payment_continue_new_session_failed",
          new Error("Failed to create new payment session"),
          {
            operationId,
            paymentId,
            userId: payment.user_id,
            result,
          }
        );
        return NextResponse.json(
          { success: false, error: "Failed to create new payment session" },
          { status: 500 }
        );
      }
    }

    // 如果未过期，尝试获取原支付链接
    // 注意：实际实现中，PayPal 和 Stripe 的支付链接可能需要重新获取
    // 这里简化处理，假设可以从 transaction_id 重新构建支付链接

    let paymentUrl = "";

    if (payment.payment_method === "paypal") {
      // PayPal 的支付链接格式
      const environment = process.env.PAYPAL_ENVIRONMENT || "sandbox";
      const baseUrl =
        environment === "production"
          ? "https://www.paypal.com"
          : "https://www.sandbox.paypal.com";
      paymentUrl = `${baseUrl}/checkoutnow?token=${payment.transaction_id}`;

      logBusinessEvent("payment_continue_paypal_existing", payment.user_id, {
        operationId,
        paymentId,
        paymentUrl,
      });
    } else if (payment.payment_method === "stripe") {
      // Stripe 的支付链接需要重新创建，因为 checkout session 有时效性
      // 这里重新创建一个新的会话
      const order = {
        amount: payment.amount,
        currency: payment.currency,
        description: `Continue payment for order ${payment.id}`,
        userId: payment.user_id,
        planType: extractPlanTypeFromPayment(payment),
        billingCycle: extractBillingCycleFromPayment(payment),
      };

      logBusinessEvent("payment_continue_stripe_refresh", payment.user_id, {
        operationId,
        paymentId,
      });

      const stripeProvider = new StripeProvider(process.env);
      const result = await stripeProvider.createPayment(order);

      if (result && result.success) {
        paymentUrl = result.paymentUrl || "";

        // 更新 transaction_id
        if (isChinaRegion()) {
          // CloudBase 更新
          const db = getDatabase();
          await db.collection("payments").doc(paymentId).update({
            transaction_id: result.paymentId,
            updated_at: new Date().toISOString(),
          });
        } else {
          // Supabase 更新
          await supabaseAdmin
            .from("payments")
            .update({
              transaction_id: result.paymentId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", paymentId);
        }

        logBusinessEvent("payment_continue_stripe_refreshed", payment.user_id, {
          operationId,
          paymentId,
          newTransactionId: result.paymentId,
          paymentUrl,
        });
      }
    } else if (payment.payment_method === "alipay") {
      // Alipay 支付链接需要重新创建，因为支付链接有时效性
      const order = {
        amount: payment.amount,
        currency: payment.currency,
        description: `Continue payment for order ${payment.id}`,
        userId: payment.user_id,
        planType: extractPlanTypeFromPayment(payment),
        billingCycle: extractBillingCycleFromPayment(payment),
      };

      logBusinessEvent("payment_continue_alipay_refresh", payment.user_id, {
        operationId,
        paymentId,
      });

      const alipayProvider = new AlipayProvider(process.env);
      const result = await alipayProvider.createPayment(order);

      if (result && result.success) {
        paymentUrl = result.paymentUrl || "";

        // 更新 transaction_id
        if (isChinaRegion()) {
          // CloudBase 更新
          const db = getDatabase();
          await db.collection("payments").doc(paymentId).update({
            transaction_id: result.paymentId,
            updated_at: new Date().toISOString(),
          });
        } else {
          // Supabase 更新
          await supabaseAdmin
            .from("payments")
            .update({
              transaction_id: result.paymentId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", paymentId);
        }

        logBusinessEvent("payment_continue_alipay_refreshed", payment.user_id, {
          operationId,
          paymentId,
          newTransactionId: result.paymentId,
          paymentUrl: paymentUrl.substring(0, 100) + "...", // 截断日志
        });
      }
    }

    if (!paymentUrl) {
      logError(
        "payment_continue_url_generation_failed",
        new Error("Unable to generate payment URL"),
        {
          operationId,
          paymentId,
          userId: payment.user_id,
          method: payment.payment_method,
        }
      );
      return NextResponse.json(
        { success: false, error: "Unable to generate payment URL" },
        { status: 500 }
      );
    }

    logBusinessEvent("payment_continue_success", payment.user_id, {
      operationId,
      paymentId,
      paymentUrl,
    });

    return NextResponse.json({
      success: true,
      paymentUrl,
    });
  } catch (error) {
    logError(
      "payment_continue_error",
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
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// 从支付记录中提取计划类型
function extractPlanTypeFromPayment(payment: any): string {
  // 这里需要根据实际的数据库结构来提取
  // 假设金额可以映射到计划类型
  const amount = payment.amount;

  if (amount === 0) return "free";
  if (amount < 20) return "pro";
  return "team";
}

// 从支付记录中提取计费周期
function extractBillingCycleFromPayment(payment: any): "monthly" | "yearly" {
  // 这里需要根据实际的数据库结构来提取
  // 假设金额可以判断周期
  const amount = payment.amount;

  // 如果金额接近年付价格（通常较大），返回 yearly
  if (amount > 50) return "yearly";
  return "monthly";
}
