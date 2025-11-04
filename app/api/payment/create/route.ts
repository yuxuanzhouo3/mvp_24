// app/api/payment/create/route.ts - 支付创建API路由
import { NextRequest, NextResponse } from "next/server";
import { PayPalProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/paypal-provider";
import { StripeProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/stripe-provider";
import { paymentRouter } from "@/lib/architecture-modules/layers/third-party/payment/router";
import { RegionType } from "@/lib/architecture-modules/core/types";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, createAuthErrorResponse } from "@/lib/auth";
import { paymentRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";
import { ApiValidator, commonSchemas } from "@/lib/api-validation";

// 订阅计划层级定义（时间累加模式下已不再使用）
const PLAN_HIERARCHY = {
  free: 0,
  premium: 1, // 统一使用premium
};

// 检查用户当前活跃订阅（简化版，用于历史记录）
async function checkUserSubscription(userId: string) {
  try {
    const { data: subscription, error } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("Error checking subscription:", error);
      return null;
    }

    return subscription;
  } catch (error) {
    console.error("Error in checkUserSubscription:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  // Apply rate limiting
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
      resolve(await handlePaymentCreate(request));
    });
  });
}

async function handlePaymentCreate(request: NextRequest) {
  try {
    // 验证用户认证
    const authResult = await requireAuth(request);
    if (!authResult) {
      return createAuthErrorResponse();
    }

    const { user } = authResult;

    // 验证请求体
    const bodyValidation = await ApiValidator.validateBody(
      request,
      commonSchemas.createPayment
    );

    if (!bodyValidation.success) {
      return NextResponse.json(
        { success: false, error: bodyValidation.error },
        { status: 400 }
      );
    }

    const {
      method,
      amount,
      currency,
      description,
      planType,
      billingCycle,
      region,
      idempotencyKey,
    } = bodyValidation.data;

    // 使用认证用户的ID
    const userId = user.id;

    // 生成或使用幂等性键
    const key = idempotencyKey || `${userId}-${billingCycle}-${Date.now()}`;

    // 关键修复：更严格的重复检查 - 防止用户快速点击创建多个订单
    // 检查最近1分钟内是否有相同的pending或completed支付
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recentPayments, error: checkError } = await supabaseAdmin
      .from("payments")
      .select("id, status, created_at, transaction_id")
      .eq("user_id", userId)
      .eq("amount", Number(amount))
      .eq("currency", currency)
      .eq("payment_method", method)
      .gte("created_at", oneMinuteAgo)
      .in("status", ["pending", "completed"]) // 只检查pending和completed状态
      .order("created_at", { ascending: false })
      .limit(1);

    if (checkError && checkError.code !== "PGRST116") {
      console.error("Error checking existing payment:", checkError);
      // 即使检查失败，为了安全起见，也不创建新支付
      return NextResponse.json(
        {
          success: false,
          error: "Unable to verify payment uniqueness, please try again",
        },
        { status: 500 }
      );
    }

    // 如果存在最近1分钟内的pending或completed支付，拒绝创建新订单
    if (recentPayments && recentPayments.length > 0) {
      const latestPayment = recentPayments[0];
      const paymentAge =
        Date.now() - new Date(latestPayment.created_at).getTime();

      console.warn(
        `Duplicate payment request blocked: User ${userId} tried to create payment within ${Math.floor(
          paymentAge / 1000
        )}s of existing payment ${latestPayment.id} (status: ${
          latestPayment.status
        })`
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "You have a recent payment request. Please wait a moment before trying again.",
          code: "DUPLICATE_PAYMENT_REQUEST",
          existingPaymentId: latestPayment.id,
          waitTime: Math.ceil((60000 - paymentAge) / 1000), // 秒
        },
        { status: 429 } // 429 Too Many Requests
      );
    }

    // 验证支付方式是否支持当前区域
    const availableMethods = paymentRouter.getAvailableMethods(
      region as RegionType
    );
    if (!availableMethods.includes(method)) {
      return NextResponse.json(
        {
          success: false,
          error: `Payment method '${method}' not available in your region`,
        },
        { status: 400 }
      );
    }

    // 时间累加模式：用户可以随时购买更多会员时间，不需要检查当前订阅状态

    // 创建支付订单
    const order = {
      amount: Number(amount),
      currency,
      description: `${
        billingCycle === "monthly" ? "1 Month" : "1 Year"
      } Premium Membership`,
      userId,
      planType: "pro", // 使用pro计划类型匹配Stripe价格ID
      billingCycle,
    };

    // 根据用户选择的支付方式创建支付
    let result;

    console.log(`Creating payment with method: ${method}`);

    try {
      if (method === "stripe") {
        const stripeProvider = new StripeProvider(process.env);
        result = await stripeProvider.createPayment(order);
      } else if (method === "paypal") {
        console.log("Initializing PayPal provider...");
        try {
          const paypalProvider = new PayPalProvider(process.env);
          console.log("PayPal provider initialized, creating payment...");
          result = await paypalProvider.createPayment(order);
          console.log("PayPal payment result:", result);
        } catch (paypalError) {
          console.error("PayPal provider error:", paypalError);
          return NextResponse.json(
            {
              success: false,
              error:
                paypalError instanceof Error
                  ? paypalError.message
                  : "PayPal initialization failed",
            },
            { status: 500 }
          );
        }
      } else {
        // 其他支付方式，使用 paymentRouter
        result = await paymentRouter.createPayment(region as RegionType, order);
      }
    } catch (providerError) {
      console.error("Payment provider error:", providerError);
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

    // 如果支付创建成功，记录到数据库
    if (result && result.success && result.paymentId) {
      const { error: paymentRecordError } = await supabaseAdmin
        .from("payments")
        .insert({
          user_id: userId,
          amount: Number(amount),
          currency,
          status: "pending",
          payment_method: method,
          transaction_id: result.paymentId,
        });

      if (paymentRecordError) {
        console.error("Error recording payment:", paymentRecordError);
        // 不返回错误，继续处理
      }
    }

    if (!result) {
      return NextResponse.json(
        { success: false, error: "Payment provider not available" },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Payment creation error:", error);
    captureException(error);

    // 返回用户友好的错误信息
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
