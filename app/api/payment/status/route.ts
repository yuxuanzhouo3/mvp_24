// app/api/payment/status/route.ts
// 通用支付状态查询接口

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getDatabase } from "@/lib/cloudbase-service";
import { isChinaRegion } from "@/lib/config/region";
import { WechatProviderV3 } from "@/lib/architecture-modules/layers/third-party/payment/providers/wechat-provider-v3";
import { z } from "zod";

// 验证查询参数
const querySchema = z.object({
  paymentId: z.string().min(1, "paymentId is required"),
});

/**
 * GET /api/payment/status?paymentId=xxx
 * 查询支付订单状态（支持所有支付方式）
 */
export async function GET(request: NextRequest) {
  try {
    // 1. 解析查询参数
    const searchParams = request.nextUrl.searchParams;
    const paymentId = searchParams.get("paymentId");

    const validationResult = querySchema.safeParse({ paymentId });
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid input",
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    // 2. 从数据库查询支付记录
    let paymentRecord: any = null;
    let paymentMethod = "";

    if (isChinaRegion()) {
      // CloudBase 查询
      try {
        const db = getDatabase();
        const result = await db
          .collection("payments")
          .where({
            $or: [
              { out_trade_no: paymentId },
              { _id: paymentId },
              { transaction_id: paymentId },
            ],
          })
          .get();

        paymentRecord = result.data?.[0];
        paymentMethod = paymentRecord?.payment_method || "";
      } catch (error) {
        console.error("Error querying CloudBase payment:", error);
      }
    } else {
      // Supabase 查询
      try {
        const { data, error } = await supabaseAdmin
          .from("payments")
          .select("*")
          .or(
            `out_trade_no.eq.${paymentId},transaction_id.eq.${paymentId},id.eq.${paymentId}`
          )
          .single();

        if (!error && data) {
          paymentRecord = data;
          paymentMethod = data.payment_method || "";
        }
      } catch (error) {
        console.error("Error querying Supabase payment:", error);
      }
    }

    if (!paymentRecord) {
      return NextResponse.json(
        {
          success: false,
          error: "Payment record not found",
          status: "unknown",
        },
        { status: 404 }
      );
    }

    // 3. 如果是微信支付，从微信服务器查询最新状态
    let finalStatus = paymentRecord.status || "pending";

    if (paymentMethod === "wechat") {
      try {
        console.log("[Payment Status] 查询微信支付状态", {
          paymentId,
          out_trade_no: paymentRecord.out_trade_no,
          currentStatus: paymentRecord.status,
        });

        const wechatProvider = new WechatProviderV3({
          appId: process.env.WECHAT_APP_ID!,
          mchId: process.env.WECHAT_PAY_MCH_ID!,
          apiV3Key: process.env.WECHAT_PAY_API_V3_KEY!,
          privateKey: process.env.WECHAT_PAY_PRIVATE_KEY!,
          serialNo: process.env.WECHAT_PAY_SERIAL_NO!,
          notifyUrl: `${process.env.APP_URL}/api/payment/webhook/wechat`,
        });

        const out_trade_no = paymentRecord.out_trade_no || paymentId;
        const wechatStatus = await wechatProvider.queryOrderByOutTradeNo(
          out_trade_no
        );

        console.log("[Payment Status] 微信API返回结果", {
          out_trade_no,
          tradeState: wechatStatus.tradeState,
          transactionId: wechatStatus.transactionId,
        });

        if (wechatStatus.tradeState === "SUCCESS") {
          finalStatus = "completed";
          console.log("[Payment Status] ✅ 支付已完成 (来自微信API)");

          // 如果微信报告成功但本地还是pending，更新本地数据库
          if (paymentRecord.status !== "completed") {
            try {
              if (isChinaRegion()) {
                const db = getDatabase();
                await db
                  .collection("payments")
                  .where({ out_trade_no })
                  .update({
                    status: "completed",
                    transaction_id: wechatStatus.transactionId,
                    updated_at: new Date().toISOString(),
                  });
              } else {
                await supabaseAdmin
                  .from("payments")
                  .update({
                    status: "completed",
                    transaction_id: wechatStatus.transactionId,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", paymentRecord.id);
              }
              console.log("[Payment Status] 数据库已更新为completed");
            } catch (updateError) {
              console.error("Error updating payment status:", updateError);
              // 继续返回成功状态，不阻断流程
            }
          }
        } else {
          finalStatus = mapTradeStateToPaymentStatus(wechatStatus.tradeState);
          console.log("[Payment Status] 支付状态", { finalStatus, tradeState: wechatStatus.tradeState });
        }
      } catch (wechatError) {
        console.error("Error querying WeChat status:", wechatError);
        // 微信查询失败时，使用本地状态
        finalStatus = paymentRecord.status || "pending";
        console.log("[Payment Status] ⚠️ 微信查询失败，使用本地状态", { finalStatus });
      }
    }

    // 4. 返回支付状态
    return NextResponse.json(
      {
        success: true,
        paymentId,
        status: finalStatus,
        amount: paymentRecord.amount,
        currency: paymentRecord.currency,
        method: paymentMethod,
        createdAt: paymentRecord.created_at || paymentRecord.createdAt,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Payment status query error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        status: "unknown",
      },
      { status: 500 }
    );
  }
}

/**
 * 将微信支付状态映射到通用支付状态
 */
function mapTradeStateToPaymentStatus(tradeState: string): string {
  const stateMap: Record<string, string> = {
    SUCCESS: "completed",
    NOTPAY: "pending",
    CLOSED: "failed",
    REFUND: "refunded",
    REVOKED: "failed",
    USERPAYING: "pending",
    PAYERROR: "failed",
  };

  return stateMap[tradeState] || "unknown";
}
