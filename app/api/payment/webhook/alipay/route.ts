// app/api/payment/webhook/alipay/route.ts - 支付宝webhook处理
import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { WebhookHandler } from "../../../../../lib/payment/webhook-handler";

// Alipay Webhook 依赖 Node.js 加密库
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    // 支付宝使用GET参数传递数据
    const searchParams = request.nextUrl.searchParams;
    const params: Record<string, string> = {};

    // 收集所有参数
    searchParams.forEach((value, key) => {
      params[key] = value;
    });

    // 验证支付宝签名
    const isValidSignature = verifyAlipaySignature(
      params,
      process.env.ALIPAY_PUBLIC_KEY
    );

    if (!isValidSignature) {
      console.error("Invalid Alipay webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 检查支付状态
    const tradeStatus = params.trade_status;
    if (tradeStatus !== "TRADE_SUCCESS" && tradeStatus !== "TRADE_FINISHED") {
      console.log("Alipay payment not completed:", tradeStatus);
      return NextResponse.json({ status: "ignored" });
    }

    console.log("Received Alipay webhook:", {
      outTradeNo: params.out_trade_no,
      tradeNo: params.trade_no,
      tradeStatus,
      totalAmount: params.total_amount,
    });

    // 处理webhook事件
    const webhookHandler = WebhookHandler.getInstance();
    const success = await webhookHandler.processWebhook(
      "alipay",
      tradeStatus,
      params
    );

    if (success) {
      // 支付宝要求返回success字符串
      return new NextResponse("success");
    } else {
      console.error("Failed to process Alipay webhook");
      return new NextResponse("failure");
    }
  } catch (error) {
    console.error("Alipay webhook error:", error);
    return new NextResponse("failure");
  }
}

/**
 * 验证支付宝签名
 */
function verifyAlipaySignature(
  params: Record<string, string>,
  publicKey?: string
): boolean {
  try {
    // 在开发环境下跳过签名验证
    if (process.env.NODE_ENV === "development") {
      return true;
    }

    if (!publicKey) {
      console.error("Missing Alipay public key");
      return false;
    }

    // 从参数中提取签名
    const sign = params.sign;
    const signType = params.sign_type;

    if (!sign || signType !== "RSA2") {
      console.error("Missing or invalid Alipay signature");
      return false;
    }

    // 移除签名相关参数
    const paramsToSign = { ...params };
    delete paramsToSign.sign;
    delete paramsToSign.sign_type;

    // 排序参数
    const sortedKeys = Object.keys(paramsToSign).sort();
    const signString = sortedKeys
      .map((key) => `${key}=${paramsToSign[key]}`)
      .join("&");

    // 验证RSA2签名
    const verify = crypto.createVerify("RSA-SHA256");
    verify.update(signString, "utf8");

    const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;

    const isValid = verify.verify(publicKeyPem, sign, "base64");

    if (!isValid) {
      console.error("Alipay signature verification failed");
    }

    return isValid;
  } catch (error) {
    console.error("Alipay signature verification error:", error);
    return false;
  }
}
