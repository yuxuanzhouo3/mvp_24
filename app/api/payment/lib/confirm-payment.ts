import { PayPalProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/paypal-provider";
import { StripeProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/stripe-provider";
import { AlipayProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/alipay-provider";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isChinaRegion } from "@/lib/config/region";
import { getDatabase } from "@/lib/cloudbase-service";
import { logInfo, logWarn, logError } from "@/lib/logger";

export interface PaymentConfirmationParams {
  sessionId?: string;
  token?: string;
  outTradeNo?: string;
  tradeNo?: string;
  wechatOutTradeNo?: string;
  userId: string;
  operationId: string;
}

export interface ConfirmedPaymentResult {
  transactionId: string;
  amount: number;
  currency: string;
  days: number;
}

export class PaymentConfirmationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function confirmPayment(
  params: PaymentConfirmationParams
): Promise<ConfirmedPaymentResult> {
  const {
    sessionId,
    token,
    outTradeNo,
    tradeNo,
    wechatOutTradeNo,
    userId,
    operationId,
  } = params;

  logInfo("Confirming payment parameters", {
    operationId,
    userId,
    hasSessionId: !!sessionId,
    hasToken: !!token,
    hasOutTradeNo: !!outTradeNo,
    hasTradeNo: !!tradeNo,
    hasWechatOutTradeNo: !!wechatOutTradeNo,
  });

  if (sessionId) {
    return confirmStripePayment({ sessionId, userId, operationId });
  }

  if (token) {
    return confirmPayPalPayment({ token, userId, operationId });
  }

  if (outTradeNo || tradeNo) {
    return confirmAlipayPayment({
      outTradeNo,
      tradeNo,
      userId,
      operationId,
    });
  }

  if (wechatOutTradeNo) {
    return confirmWeChatPayment({
      wechatOutTradeNo,
      userId,
      operationId,
    });
  }

  throw new PaymentConfirmationError(
    "Missing payment confirmation parameters",
    400
  );
}

async function confirmStripePayment({
  sessionId,
  userId,
  operationId,
}: {
  sessionId: string;
  userId: string;
  operationId: string;
}): Promise<ConfirmedPaymentResult> {
  logInfo("Confirming Stripe payment", {
    operationId,
    userId,
    sessionId,
  });

  const stripeProvider = new StripeProvider(process.env);
  const confirmation = await stripeProvider.confirmPayment(sessionId);

  if (!confirmation.success) {
    logWarn("Stripe payment confirmation failed", {
      operationId,
      userId,
      sessionId,
    });
    throw new PaymentConfirmationError("Payment not completed", 400);
  }

  let days = 0;
  try {
    const { data: stripePendingPayment } = await supabaseAdmin
      .from("payments")
      .select("metadata")
      .eq("transaction_id", sessionId)
      .eq("status", "pending")
      .maybeSingle();

    days =
      stripePendingPayment?.metadata?.days ||
      (confirmation.amount > 50 ? 365 : 30);
  } catch (error) {
    logWarn("Stripe pending payment lookup failed", {
      operationId,
      userId,
      sessionId,
      error,
    });
    days = confirmation.amount > 50 ? 365 : 30;
  }

  return {
    transactionId: confirmation.transactionId,
    amount: confirmation.amount,
    currency: confirmation.currency,
    days,
  };
}

async function confirmPayPalPayment({
  token,
  userId,
  operationId,
}: {
  token: string;
  userId: string;
  operationId: string;
}): Promise<ConfirmedPaymentResult> {
  logInfo("Confirming PayPal payment", {
    operationId,
    userId,
    token,
  });

  const paypalProvider = new PayPalProvider(process.env);

  try {
    const { data: paypalPendingPayment } = await supabaseAdmin
      .from("payments")
      .select("amount, currency, metadata")
      .eq("transaction_id", token)
      .eq("status", "pending")
      .maybeSingle();

    const captureResult = await paypalProvider.captureOnetimePayment(token);

    if (captureResult.status !== "COMPLETED") {
      logWarn("PayPal payment not completed", {
        operationId,
        userId,
        token,
        status: captureResult.status,
      });
      throw new PaymentConfirmationError("Payment not completed", 400);
    }

    const captureId = captureResult.id;
    let amount = 0;
    let currency = "USD";

    const purchaseUnit = captureResult.purchase_units?.[0];

    if (purchaseUnit?.payments?.captures?.[0]) {
      const capture = purchaseUnit.payments.captures[0];
      amount = parseFloat(capture?.amount?.value || "0");
      currency =
        capture?.amount?.currency_code || purchaseUnit?.amount?.currency_code ||
        "USD";
      logInfo("Amount from captures", { amount, currency });
    } else if (purchaseUnit?.amount) {
      amount = parseFloat(purchaseUnit.amount.value || "0");
      currency = purchaseUnit.amount.currency_code || "USD";
      logInfo("Amount from purchase_units", { amount, currency });
    } else {
      const processor = captureResult.payment_source?.paypal?.processor_response;
      if (processor?.verify_response?.gross_amount) {
        amount = parseFloat(processor.verify_response.gross_amount);
        currency = processor.verify_response.currency_code || "USD";
        logInfo("Amount from processor_response", { amount, currency });
      }
    }

    if (amount === 0 && paypalPendingPayment?.amount) {
      amount = paypalPendingPayment.amount;
      currency = paypalPendingPayment.currency || "USD";
      logInfo("Recovered amount from pending payment", {
        operationId,
        userId,
        amount,
        currency,
      });
    }

    const days =
      paypalPendingPayment?.metadata?.days || (amount > 50 ? 365 : 30);

    logInfo("PayPal capture successful", {
      operationId,
      userId,
      transactionId: captureId,
      amount,
      currency,
      days,
      captureStatus: captureResult.status,
    });

    return {
      transactionId: captureId,
      amount,
      currency,
      days,
    };
  } catch (error) {
    logError("PayPal capture error", error as Error, {
      operationId,
      userId,
      token,
    });
    throw new PaymentConfirmationError(
      error instanceof Error ? error.message : "Failed to capture PayPal payment",
      500
    );
  }
}

async function confirmAlipayPayment({
  outTradeNo,
  tradeNo,
  userId,
  operationId,
}: {
  outTradeNo?: string;
  tradeNo?: string;
  userId: string;
  operationId: string;
}): Promise<ConfirmedPaymentResult> {
  logInfo("Confirming Alipay payment", {
    operationId,
    userId,
    outTradeNo,
    tradeNo,
  });

  const isAlipayAppChannel = !!outTradeNo && !tradeNo;

  if (isAlipayAppChannel) {
    const transactionId = outTradeNo!;
    let alipayPendingPayment: any = null;

    if (isChinaRegion()) {
      try {
        const db = getDatabase();
        const result = await db
          .collection("payments")
          .where({
            transaction_id: outTradeNo,
            user_id: userId,
          })
          .orderBy("created_at", "desc")
          .limit(1)
          .get();
        alipayPendingPayment = result.data?.[0] || null;
      } catch (error) {
        logWarn("Error fetching CloudBase pending Alipay payment", {
          operationId,
          userId,
          outTradeNo,
          error,
        });
      }
    } else {
      try {
        const { data } = await supabaseAdmin
          .from("payments")
          .select("id, amount, currency, metadata, payment_method, status")
          .eq("transaction_id", outTradeNo)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        alipayPendingPayment = data || null;
      } catch (error) {
        logWarn("Error fetching Supabase pending Alipay payment", {
          operationId,
          userId,
          outTradeNo,
          error,
        });
      }
    }

    if (
      !alipayPendingPayment ||
      alipayPendingPayment.payment_method !== "alipay"
    ) {
      logWarn("Alipay app confirm: pending payment not found or method mismatch", {
        operationId,
        userId,
        outTradeNo,
        hasPending: !!alipayPendingPayment,
        method: alipayPendingPayment?.payment_method,
      });
    }

    const days =
      alipayPendingPayment?.metadata?.days ||
      (alipayPendingPayment?.amount > 50 ? 365 : 30);

    try {
      const alipayProvider = new AlipayProvider(process.env);
      const confirmation = await alipayProvider.confirmPayment(outTradeNo!);
      if (!confirmation?.success) {
        throw new PaymentConfirmationError("Alipay payment not completed", 400);
      }

      const amount =
        confirmation.amount || alipayPendingPayment?.amount || 0;
      const currency =
        confirmation.currency || alipayPendingPayment?.currency || "CNY";

      return {
        transactionId,
        amount,
        currency,
        days,
      };
    } catch (error) {
      if (error instanceof PaymentConfirmationError) {
        throw error;
      }
      logError("Alipay verification error", error as Error, {
        operationId,
        userId,
        outTradeNo,
        tradeNo,
      });
      throw new PaymentConfirmationError(
        error instanceof Error ? error.message : "Failed to verify Alipay payment",
        500
      );
    }
  }

  // For Alipay sync return: outTradeNo is our merchant order number (stored as transaction_id in DB)
  // tradeNo is Alipay's transaction number (used for verification only)
  const actualOutTradeNo = outTradeNo || tradeNo;
  if (!actualOutTradeNo || !tradeNo) {
    logWarn("Alipay return missing required parameters", {
      operationId,
      userId,
      actualOutTradeNo,
      tradeNo,
    });
    throw new PaymentConfirmationError("Missing Alipay order parameters", 400);
  }

  logInfo("Alipay sync return validated", {
    operationId,
    userId,
    outTradeNo: actualOutTradeNo,
    tradeNo,
  });

  // Query payment record to get days, amount, currency for sync return
  let alipayPayment: any = null;
  
  if (isChinaRegion()) {
    try {
      const db = getDatabase();
      const result = await db
        .collection("payments")
        .where({
          transaction_id: outTradeNo,
          user_id: userId,
        })
        .orderBy("created_at", "desc")
        .limit(1)
        .get();
      alipayPayment = result.data?.[0] || null;
    } catch (error) {
      logWarn("Error fetching CloudBase payment for sync return", {
        operationId,
        userId,
        outTradeNo,
        error,
      });
    }
  } else {
    try {
      const { data } = await supabaseAdmin
        .from("payments")
        .select("amount, currency, metadata")
        .eq("transaction_id", outTradeNo)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      alipayPayment = data || null;
    } catch (error) {
      logWarn("Error fetching Supabase payment for sync return", {
        operationId,
        userId,
        outTradeNo,
        error,
      });
    }
  }

  const days = alipayPayment?.metadata?.days || (alipayPayment?.amount > 50 ? 365 : 30);
  const amount = alipayPayment?.amount || 0;
  const currency = alipayPayment?.currency || "CNY";

  return {
    transactionId: outTradeNo || tradeNo || "",
    amount,
    currency,
    days,
  };
}

async function confirmWeChatPayment({
  wechatOutTradeNo,
  userId,
  operationId,
}: {
  wechatOutTradeNo: string;
  userId: string;
  operationId: string;
}): Promise<ConfirmedPaymentResult> {
  logInfo("Confirming WeChat payment", {
    operationId,
    userId,
    wechatOutTradeNo,
  });

  let wechatPendingPayment: any = null;

  if (isChinaRegion()) {
    try {
      const db = getDatabase();
      const paymentsCollection = db.collection("payments");

      const result = await paymentsCollection
        .where({
          $or: [
            { out_trade_no: wechatOutTradeNo },
            { transaction_id: wechatOutTradeNo },
            { _id: wechatOutTradeNo },
          ],
        })
        .get();

      wechatPendingPayment = result.data?.[0] || null;
    } catch (error) {
      logError("Error fetching CloudBase pending WeChat payment", error as Error, {
        operationId,
        userId,
        wechatOutTradeNo,
      });
    }
  } else {
    try {
      const { data } = await supabaseAdmin
        .from("payments")
        .select("*")
        .or(
          `out_trade_no.eq.${wechatOutTradeNo},transaction_id.eq.${wechatOutTradeNo},id.eq.${wechatOutTradeNo}`
        )
        .single();

      wechatPendingPayment = data || null;
    } catch (error) {
      logError("Error fetching Supabase pending WeChat payment", error as Error, {
        operationId,
        userId,
        wechatOutTradeNo,
      });
    }
  }

  if (!wechatPendingPayment) {
    logWarn("WeChat payment record not found", {
      operationId,
      userId,
      wechatOutTradeNo,
    });
    throw new PaymentConfirmationError("Payment record not found", 400);
  }

  const transactionId =
    wechatPendingPayment.transaction_id ||
    wechatPendingPayment.out_trade_no ||
    wechatOutTradeNo;
  const amount = wechatPendingPayment.amount || 0;
  const currency = wechatPendingPayment.currency || "CNY";
  const days = wechatPendingPayment.metadata?.days
    ? wechatPendingPayment.metadata.days
    : amount >= 300
    ? 365
    : 30;

  logInfo("WeChat payment details extracted", {
    operationId,
    userId,
    transactionId,
    amount,
    currency,
    days,
  });

  return {
    transactionId,
    amount,
    currency,
    days,
  };
}
