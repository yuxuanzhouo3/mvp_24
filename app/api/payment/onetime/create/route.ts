// app/api/payment/onetime/create/route.ts - 一次性支付创建API
import { NextRequest, NextResponse } from "next/server";
import { PayPalProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/paypal-provider";
import { StripeProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/stripe-provider";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, createAuthErrorResponse } from "@/lib/auth";
import { paymentRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";
import { logInfo, logError, logWarn } from "@/lib/logger";

export async function POST(request: NextRequest) {
  // 应用速率限制
  return new Promise<NextResponse>((resolve) => {
    const mockRes = {
      status: (code: number) => ({
        json: (data: any) => resolve(NextResponse.json(data, { status: code })),
      }),
      setHeader: () => {},
      getHeader: () => undefined,
    };

    paymentRateLimit(request as any, mockRes as any, async () => {
      resolve(await handleOnetimePaymentCreate(request));
    });
  });
}

async function handleOnetimePaymentCreate(request: NextRequest) {
  const startTime = Date.now();
  const operationId = `onetime_create_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  try {
    // 验证用户认证
    const authResult = await requireAuth(request);
    if (!authResult) {
      return createAuthErrorResponse();
    }

    const { user } = authResult;
    const body = await request.json();
    const { method, billingCycle } = body;

    logInfo("Creating one-time payment", {
      operationId,
      userId: user.id,
      method,
      billingCycle,
    });

    // 验证必需参数
    if (!method || !billingCycle) {
      logWarn("Missing required parameters", {
        operationId,
        userId: user.id,
        method,
        billingCycle,
      });
      return NextResponse.json(
        { success: false, error: "Missing payment method or billing cycle" },
        { status: 400 }
      );
    }

    // 验证 billingCycle
    if (!["monthly", "yearly"].includes(billingCycle)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid billing cycle. Must be 'monthly' or 'yearly'",
        },
        { status: 400 }
      );
    }

    // 确定金额和天数
    const amount = billingCycle === "monthly" ? 9.99 : 99.99;
    const currency = "USD";
    const days = billingCycle === "monthly" ? 30 : 365;

    // 检查最近1分钟内是否有相同的pending或completed支付(防止重复点击)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recentPayments, error: checkError } = await supabaseAdmin
      .from("payments")
      .select("id, status, created_at")
      .eq("user_id", user.id)
      .eq("amount", amount)
      .eq("currency", currency)
      .eq("payment_method", method)
      .gte("created_at", oneMinuteAgo)
      .in("status", ["pending", "completed"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (checkError && checkError.code !== "PGRST116") {
      logError("Error checking existing payment", checkError, {
        operationId,
        userId: user.id,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Unable to verify payment uniqueness, please try again",
        },
        { status: 500 }
      );
    }

    // 如果存在最近的支付,拒绝创建新订单
    if (recentPayments && recentPayments.length > 0) {
      const latestPayment = recentPayments[0];
      const paymentAge =
        Date.now() - new Date(latestPayment.created_at).getTime();

      logWarn("Duplicate payment request blocked", {
        operationId,
        userId: user.id,
        existingPaymentId: latestPayment.id,
        paymentAge: `${Math.floor(paymentAge / 1000)}s`,
      });

      return NextResponse.json(
        {
          success: false,
          error:
            "You have a recent payment request. Please wait a moment before trying again.",
          code: "DUPLICATE_PAYMENT_REQUEST",
          existingPaymentId: latestPayment.id,
          waitTime: Math.ceil((60000 - paymentAge) / 1000),
        },
        { status: 429 }
      );
    }

    // 创建支付订单数据
    const order = {
      amount,
      currency,
      description: `${
        billingCycle === "monthly" ? "1 Month" : "1 Year"
      } Premium Membership (One-time Payment)`,
      userId: user.id,
      planType: "onetime", // 标记为一次性支付
      billingCycle,
      metadata: {
        userId: user.id,
        days, // 会员天数
        paymentType: "onetime",
        billingCycle,
      },
    };

    // 根据支付方式创建支付
    let result;

    try {
      if (method === "stripe") {
        logInfo("Creating Stripe one-time payment", {
          operationId,
          userId: user.id,
          amount,
        });
        const stripeProvider = new StripeProvider(process.env);
        // Stripe 一次性支付(使用 payment mode 而不是 subscription mode)
        result = await stripeProvider.createOnetimePayment(order);
      } else if (method === "paypal") {
        logInfo("Creating PayPal one-time payment", {
          operationId,
          userId: user.id,
          amount,
        });
        const paypalProvider = new PayPalProvider(process.env);
        // PayPal 一次性支付(使用 order 而不是 subscription)
        result = await paypalProvider.createOnetimePayment(order);
      } else {
        return NextResponse.json(
          { success: false, error: `Unsupported payment method: ${method}` },
          { status: 400 }
        );
      }
    } catch (providerError) {
      logError("Payment provider error", providerError as Error, {
        operationId,
        userId: user.id,
        method,
      });
      return NextResponse.json(
        {
          success: false,
          error:
            providerError instanceof Error
              ? providerError.message
              : "Payment provider error",
        },
        { status: 500 }
      );
    }

    // 记录到数据库
    if (result && result.success && result.paymentId) {
      const paymentData: any = {
        user_id: user.id,
        amount,
        currency,
        status: "pending",
        payment_method: method,
        transaction_id: result.paymentId,
      };

      // 如果数据库支持 metadata 字段,则添加
      try {
        paymentData.metadata = {
          days,
          paymentType: "onetime",
          billingCycle,
        };
      } catch (e) {
        // 如果不支持 metadata,忽略
      }

      const { error: paymentRecordError } = await supabaseAdmin
        .from("payments")
        .insert(paymentData);

      if (paymentRecordError) {
        logError("Error recording payment", paymentRecordError, {
          operationId,
          userId: user.id,
          transactionId: result.paymentId,
        });
        // 继续执行,不阻断支付流程
      } else {
        logInfo("Payment record created", {
          operationId,
          userId: user.id,
          transactionId: result.paymentId,
          amount,
          days,
        });
      }
    }

    if (!result) {
      return NextResponse.json(
        { success: false, error: "Payment creation failed" },
        { status: 500 }
      );
    }

    const duration = Date.now() - startTime;
    logInfo("One-time payment created successfully", {
      operationId,
      userId: user.id,
      method,
      amount,
      days,
      duration: `${duration}ms`,
    });

    return NextResponse.json(result);
  } catch (error) {
    const duration = Date.now() - startTime;
    logError("One-time payment creation error", error as Error, {
      operationId,
      duration: `${duration}ms`,
    });
    captureException(error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
