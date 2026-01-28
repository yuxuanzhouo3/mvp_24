import { NextRequest, NextResponse } from "next/server";
import { getPayment } from "@/lib/payment/adapter";
import { z } from "zod";

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
