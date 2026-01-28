// app/api/payment/webhook/stripe/route.ts - Stripe webhook处理
import { NextRequest, NextResponse } from "next/server";
import { WebhookHandler } from "../../../../../lib/payment/webhook-handler";
import { webhookRateLimit } from "../../../../../lib/rate-limit";
import {
  logSecurityEvent,
  logBusinessEvent,
  logError,
} from "../../../../../lib/logger";

// Stripe Webhook 必须在 Node.js Runtime 下运行（SDK 需要 Node 环境）
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // Apply webhook rate limiting
  return new Promise<NextResponse>((resolve) => {
    const mockRes = {
      status: (code: number) => ({
        json: (data: any) => resolve(NextResponse.json(data, { status: code })),
      }),
      setHeader: () => {},
      getHeader: () => undefined,
    };

    webhookRateLimit(request as any, mockRes as any, async () => {
      // Rate limit not exceeded, handle the webhook
      resolve(await handleStripeWebhook(request));
    });
  });
}

async function handleStripeWebhook(request: NextRequest) {
  const operationId = `stripe_webhook_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    logBusinessEvent("webhook_received", operationId, {
      provider: "stripe",
      hasSignature: !!signature,
      bodyLength: body.length,
      userAgent: request.headers.get("user-agent"),
      ip:
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip"),
    });

    // 验证Stripe webhook签名
    const isValidSignature = verifyStripeSignature(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (!isValidSignature) {
      logSecurityEvent(
        "webhook_signature_invalid",
        operationId,
        request.headers.get("x-forwarded-for") || "unknown",
        {
          provider: "stripe",
          signaturePresent: !!signature,
          userAgent: request.headers.get("user-agent"),
        }
      );
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 解析webhook数据
    const webhookData = JSON.parse(body);
    const eventType = webhookData.type;
    const eventId = webhookData.id;
    const livemode = webhookData.livemode;

    logBusinessEvent("webhook_parsed", operationId, {
      provider: "stripe",
      eventType,
      eventId,
      livemode,
      dataSize: JSON.stringify(webhookData).length,
    });

    // 处理webhook事件
    const webhookHandler = WebhookHandler.getInstance();
    const success = await webhookHandler.processWebhook(
      "stripe",
      eventType,
      webhookData
    );

    if (success) {
      logBusinessEvent("webhook_processed_success", operationId, {
        provider: "stripe",
        eventType,
        eventId,
        livemode,
      });
      return NextResponse.json({ status: "success" });
    } else {
      logError("webhook_processing_failed", undefined, {
        operationId,
        provider: "stripe",
        eventType,
        eventId,
        livemode,
      });
      return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
  } catch (error) {
    logError(
      "webhook_processing_error",
      error instanceof Error ? error : new Error(String(error)),
      {
        operationId,
        provider: "stripe",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * 验证Stripe webhook签名
 */
function verifyStripeSignature(
  payload: string,
  signature: string | null,
  secret: string | undefined
): boolean {
  try {
    if (!signature || !secret) {
      console.error("Missing Stripe signature or secret");
      return false;
    }

    const stripe = require("stripe");
    const endpointSecret = secret;

    try {
      // 使用Stripe SDK验证签名
      stripe.webhooks.constructEvent(payload, signature, endpointSecret);
      return true;
    } catch (error) {
      console.error("Stripe signature verification failed:", error);
      return false;
    }
  } catch (error) {
    console.error("Stripe signature verification error:", error);
    return false;
  }
}
