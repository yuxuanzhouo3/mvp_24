import { NextRequest, NextResponse } from "next/server";
import { getPayment } from "@/lib/payment/adapter";
import { z } from "zod";
import { requireAuth, createAuthErrorResponse } from "@/lib/auth";
import { isChinaRegion } from "@/lib/config/region";
import { getDatabase } from "@/lib/cloudbase-service";
import { supabaseAdmin } from "@/lib/supabase-admin";

// 验证支付请求验证schema
const verifyPaymentSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
  params: z.record(z.any()).optional(), // 支付回调参数
});

/**
 * POST /api/payment/verify
 * 验证支付结果
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult) {
      return createAuthErrorResponse();
    }

    const { user } = authResult;
    const body = await request.json();

    // 验证输入
    const validationResult = verifyPaymentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          code: "VALIDATION_ERROR",
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { orderId, params = {} } = validationResult.data;

    // 仅允许验证当前用户自己的订单
    let ownsPayment = false;
    if (isChinaRegion()) {
      try {
        const db = getDatabase();
        const result = await db
          .collection("payments")
          .where({
            user_id: user.id,
            transaction_id: orderId,
          })
          .limit(1)
          .get();

        ownsPayment = (result.data?.length || 0) > 0;
      } catch {
        ownsPayment = false;
      }
    } else {
      const { data } = await supabaseAdmin
        .from("payments")
        .select("id")
        .eq("user_id", user.id)
        .eq("transaction_id", orderId)
        .limit(1)
        .maybeSingle();
      ownsPayment = !!data?.id;
    }

    if (!ownsPayment) {
      return NextResponse.json(
        { error: "Payment not found", code: "PAYMENT_NOT_FOUND" },
        { status: 404 }
      );
    }

    // 获取支付适配器
    const payment = getPayment();

    // 验证支付
    const result = await payment.verifyPayment(params);

    console.log(`验证支付结果: ${orderId}, 成功: ${result.success}`);

    if (result.success) {
      // 支付成功，更新用户状态等业务逻辑
      console.log(
        `支付成功: ${result.orderId}, 交易ID: ${result.transactionId}`
      );
    }

    return NextResponse.json({
      success: result.success,
      orderId: result.orderId,
      transactionId: result.transactionId,
      error: result.error,
    });
  } catch (error) {
    console.error("Verify payment error:", error);

    return NextResponse.json(
      {
        error: "Failed to verify payment",
        code: "PAYMENT_VERIFY_ERROR",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
