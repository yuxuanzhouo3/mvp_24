// app/api/payment/webhook/wechat/route.ts - 微信支付webhook处理
import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { WebhookHandler } from "../../../../../lib/payment/webhook-handler";

// WeChat Webhook 依赖 Node.js 运行时
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const params = JSON.parse(body);

    // 验证微信支付签名
    const isValidSignature = verifyWechatSignature(
      params,
      process.env.WECHAT_PAY_API_V3_KEY
    );

    if (!isValidSignature) {
      console.error("Invalid WeChat webhook signature");
      return NextResponse.json(
        { code: "FAIL", message: "Invalid signature" },
        { status: 401 }
      );
    }

    // 检查支付结果
    const returnCode = params.return_code;
    const resultCode = params.result_code;

    if (returnCode !== "SUCCESS" || resultCode !== "SUCCESS") {
      console.log("WeChat payment failed:", { returnCode, resultCode });
      return NextResponse.json({
        code: "SUCCESS",
        message: "Payment not successful, ignored",
      });
    }

    console.log("Received WeChat webhook:", {
      outTradeNo: params.out_trade_no,
      transactionId: params.transaction_id,
      totalFee: params.total_fee,
      tradeType: params.trade_type,
    });

    // 处理webhook事件
    const webhookHandler = WebhookHandler.getInstance();
    const success = await webhookHandler.processWebhook(
      "wechat",
      resultCode,
      params
    );

    if (success) {
      // 微信支付要求返回SUCCESS
      return NextResponse.json({
        code: "SUCCESS",
        message: "OK",
      });
    } else {
      console.error("Failed to process WeChat webhook");
      return NextResponse.json({
        code: "FAIL",
        message: "Processing failed",
      });
    }
  } catch (error) {
    console.error("WeChat webhook error:", error);
    return NextResponse.json({
      code: "FAIL",
      message: "Internal server error",
    });
  }
}

/**
 * 验证微信支付签名
 */
function verifyWechatSignature(params: any, apiKey?: string): boolean {
  try {
    // 在开发环境下跳过签名验证
    if (process.env.NODE_ENV === "development") {
      return true;
    }

    if (!apiKey) {
      console.error("Missing WeChat API key");
      return false;
    }

    // 微信支付V3使用不同的签名验证方式
    // 这里简化处理，实际需要根据微信支付文档实现完整的验证
    console.log("WeChat signature verification - params:", params);

    // 实际项目中应该使用微信支付SDK进行验证
    // 这里暂时返回true，在生产环境中需要实现完整的验证
    return true;
  } catch (error) {
    console.error("WeChat signature verification error:", error);
    return false;
  }
}
