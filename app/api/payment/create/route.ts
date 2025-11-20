// app/api/payment/create/route.ts - ֧������API·��
import { NextRequest, NextResponse } from "next/server";
import { getPayment } from "@/lib/payment/adapter";
import { requireAuth, createAuthErrorResponse } from "@/lib/auth";
import { paymentRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isChinaRegion } from "@/lib/config/region";
import { getDatabase } from "@/lib/cloudbase-service";
import { z } from "zod";

// ֧������������֤schema
const createPaymentSchema = z.object({
  method: z.string().min(1, "Payment method is required"),
  amount: z.number().positive("Amount must be positive"),
  currency: z.string().min(1, "Currency is required"),
  description: z.string().optional(),
  planType: z.string().optional(),
  billingCycle: z.enum(["monthly", "yearly"]).optional(),
  idempotencyKey: z.string().optional(),
});

/**
 * POST /api/payment/create
 * ����֧������
 */
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
    // ��֤�û���֤
    const authResult = await requireAuth(request);
    if (!authResult) {
      return createAuthErrorResponse();
    }

    const { user } = authResult;

    // ��֤������
    const body = await request.json();
    const validationResult = createPaymentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid input",
          code: "VALIDATION_ERROR",
          details: validationResult.error.errors,
        },
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
      idempotencyKey,
    } = validationResult.data;

    // ʹ����֤�û���ID
    const userId = user.id;

    // 检查重复支付请求
    let recentPayments: any[] = [];
    let checkError: any = null;

    if (isChinaRegion()) {
      // CloudBase 用户：从 CloudBase 检查重复支付
      try {
        const db = getDatabase();
        const _ = db.command;
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

        const result = await db
          .collection("payments")
          .where({
            user_id: userId,
            amount: amount,
            currency: currency,
            payment_method: method,
            created_at: _.gte(oneMinuteAgo),
            status: _.in(["pending", "completed"]),
          })
          .orderBy("created_at", "desc")
          .limit(1)
          .get();

        recentPayments = result.data || [];
      } catch (error) {
        console.error("Error checking existing CloudBase payment:", error);
        checkError = error;
      }
    } else {
      // 国际用户：从 Supabase 检查重复支付
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
      const { data, error } = await supabaseAdmin
        .from("payments")
        .select("id, status, created_at, transaction_id")
        .eq("user_id", userId)
        .eq("amount", amount)
        .eq("currency", currency)
        .eq("payment_method", method)
        .gte("created_at", oneMinuteAgo)
        .in("status", ["pending", "completed"])
        .order("created_at", { ascending: false })
        .limit(1);

      recentPayments = data || [];
      checkError = error;
    }

    if (
      checkError &&
      (!isChinaRegion() || (checkError as any)?.code !== "PGRST116")
    ) {
      console.error("Error checking existing payment:", checkError);
      return NextResponse.json(
        {
          success: false,
          error: "Unable to verify payment uniqueness, please try again",
        },
        { status: 500 }
      );
    }

    // 处理重复支付请求
    if (recentPayments && recentPayments.length > 0) {
      const latestPayment = recentPayments[0];
      const paymentAge =
        Date.now() -
        new Date(latestPayment.created_at || latestPayment.createdAt).getTime();

      console.warn(
        `Duplicate payment request blocked: User ${userId} tried to create payment within ${Math.floor(
          paymentAge / 1000
        )}s of existing payment ${
          latestPayment.id || latestPayment._id
        } (status: ${latestPayment.status})`
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "You have a recent payment request. Please wait a moment before trying again.",
          code: "DUPLICATE_PAYMENT_REQUEST",
          existingPaymentId: latestPayment.id || latestPayment._id,
          waitTime: Math.ceil((60000 - paymentAge) / 1000),
        },
        { status: 429 }
      );
    }

    // ��ȡ֧��������
    const payment = getPayment();

    // ����֧������
    const order = {
      amount,
      currency,
      description:
        description ||
        `${
          billingCycle === "monthly" ? "1 Month" : "1 Year"
        } Premium Membership`,
      userId,
      planType: planType || "pro",
      billingCycle: billingCycle || "monthly",
      method,
    };

    console.log(`Creating payment with method: ${method} using adapter`);

    // 使用适配器创建支付订单
    const orderResult = await payment.createOrder(amount, userId);

    // 记录支付到相应数据库
    let paymentRecordError: any = null;

    if (isChinaRegion()) {
      // CloudBase 用户：记录到 CloudBase
      try {
        const db = getDatabase();
        const paymentsCollection = db.collection("payments");

        await paymentsCollection.add({
          user_id: userId,
          amount,
          currency: currency || "CNY",
          status: "pending",
          payment_method: method,
          transaction_id: orderResult.orderId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Error recording CloudBase payment:", error);
        paymentRecordError = error;
      }
    } else {
      // 国际用户：记录到 Supabase
      const days = billingCycle === "yearly" ? 365 : 30;
      const metadataObj = {
        days,
        billingCycle: billingCycle || "monthly",
        planType: planType || "pro",
      };

      const { error } = await supabaseAdmin.from("payments").insert({
        user_id: userId,
        amount,
        currency,
        status: "pending",
        payment_method: method,
        transaction_id: orderResult.orderId,
        metadata: metadataObj,
      });

      if (!error) {
        console.log("✅ Payment recorded with metadata:", {
          transactionId: orderResult.orderId,
          metadata: metadataObj,
        });
      }

      paymentRecordError = error;
    }

    if (paymentRecordError) {
      console.error("Error recording payment:", paymentRecordError);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to record payment",
        },
        { status: 500 }
      );
    }

    // 返回支付信息
    const response = {
      success: true,
      orderId: orderResult.orderId,
      paymentUrl: orderResult.paymentUrl,
      formHtml: orderResult.formHtml,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Payment creation error:", error);
    captureException(error);

    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
