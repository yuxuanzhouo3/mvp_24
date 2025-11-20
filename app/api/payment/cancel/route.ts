// app/api/payment/cancel/route.ts - 取消订单API路由
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { paymentRateLimit } from "@/lib/rate-limit";
import { logBusinessEvent, logError, logSecurityEvent } from "@/lib/logger";

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
      resolve(await handlePaymentCancel(request));
    });
  });
}

async function handlePaymentCancel(request: NextRequest) {
  const operationId = `payment_cancel_${Date.now()}_${Math.random()
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
        "payment_cancel_unauthorized",
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

    logBusinessEvent("payment_cancel_requested", undefined, {
      operationId,
      paymentId,
    });

    // 从数据库获取支付记录
    const { data: payment, error: fetchError } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .single();

    if (fetchError || !payment) {
      logBusinessEvent("payment_cancel_not_found", undefined, {
        operationId,
        paymentId,
        fetchError: fetchError?.message,
      });
      return NextResponse.json(
        { success: false, error: "Payment not found" },
        { status: 404 }
      );
    }

    // 只有待处理的订单可以取消
    if (payment.status !== "pending") {
      logBusinessEvent("payment_cancel_invalid_status", payment.user_id, {
        operationId,
        paymentId,
        currentStatus: payment.status,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Only pending payments can be cancelled",
        },
        { status: 400 }
      );
    }

    // 更新支付状态为 failed (数据库约束只允许: pending, completed, failed, refunded)
    const { error: updateError } = await supabaseAdmin
      .from("payments")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId);

    if (updateError) {
      logError("payment_cancel_update_error", updateError, {
        operationId,
        paymentId,
        userId: payment.user_id,
      });
      return NextResponse.json(
        { success: false, error: "Failed to cancel payment" },
        { status: 500 }
      );
    }

    logBusinessEvent("payment_cancel_success", payment.user_id, {
      operationId,
      paymentId,
      amount: payment.amount,
      currency: payment.currency,
    });

    return NextResponse.json({
      success: true,
      message: "Payment cancelled successfully",
    });
  } catch (error) {
    logError(
      "payment_cancel_error",
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
