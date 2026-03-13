/**
 * Payment Success Handler
 * 处理支付成功事件
 */

import { supabaseAdmin } from "../../supabase-admin";
import { getDatabase } from "../../cloudbase-service";
import { isChinaRegion } from "../../config/region";
import {
  logError,
  logInfo,
  logWarn,
  logBusinessEvent,
} from "../../logger";
import {
  seedWalletForPlan,
  addAddonCredits,
} from "@/services/wallet-supabase";
import {
  seedCloudBaseWalletForPlan,
  addCloudBaseAddonCredits,
} from "@/services/wallet-cloudbase";
import { getAddonPackageById } from "@/constants/addon-packages";
import { updateSubscriptionStatus, findUserBySubscriptionId } from "./subscription-db";
import { grantReferralFirstPaymentReward } from "@/lib/market/referrals";
import { ensureCreditWallet, grantRechargeCredits } from "@/lib/billing/wallet";
import { getBillingSettings } from "@/lib/billing/settings";
import type { PaymentData, PaymentRecord } from "./types";

/**
 * 处理支付成功事件
 */
export async function handlePaymentSuccess(
  provider: string,
  data: any
): Promise<boolean> {
  console.log("🔥🔥🔥 [handlePaymentSuccess] CALLED", {
    provider,
    dataId: data.id,
    dataKeys: Object.keys(data).slice(0, 10),
  });

  try {
    const paymentData = await extractPaymentData(provider, data);
    if (!paymentData) {
      return false;
    }

    const { subscriptionId, userId, amount, currency, days, paypalOrderId } = paymentData;

    const pendingPayment = await findPendingPayment(
      provider,
      subscriptionId,
      userId,
      amount,
      paypalOrderId
    );

    const productType = String(
      pendingPayment?.type || pendingPayment?.metadata?.productType || "SUBSCRIPTION"
    ).toUpperCase();

    // ADDON/CREDITS: 仅发放额度，不更新订阅状态
    if (productType === "ADDON" || productType === "CREDITS") {
      try {
        if (!pendingPayment) {
          logWarn("non-subscription payment webhook received but payment record missing", {
            provider,
            subscriptionId,
            userId,
          });
          return false;
        }

        const nowIso = new Date().toISOString();

        if (isChinaRegion()) {
          const db = getDatabase();
          const docId = pendingPayment._id;
          if (docId && pendingPayment.status !== "completed") {
            await db.collection("payments").doc(docId).update({
              status: "completed",
              updated_at: nowIso,
            });
          }
        } else {
          const rowId = pendingPayment.id;
          if (rowId && pendingPayment.status !== "completed") {
            await supabaseAdmin
              .from("payments")
              .update({
                status: "completed",
                updated_at: nowIso,
              })
              .eq("id", rowId);
          }
        }

        await updateUserWallet(userId, pendingPayment, provider);

        const mergedMetadata = {
          ...(pendingPayment?.metadata || {}),
          creditsGranted: true,
          creditsGrantedAt: nowIso,
          grantedProductType: productType,
        };

        if (isChinaRegion()) {
          const docId = pendingPayment._id;
          if (docId) {
            await getDatabase().collection("payments").doc(docId).update({
              metadata: mergedMetadata,
              updated_at: nowIso,
            });
          }
        } else {
          const rowId = pendingPayment.id;
          if (rowId) {
            await supabaseAdmin
              .from("payments")
              .update({
                metadata: mergedMetadata,
                updated_at: nowIso,
              })
              .eq("id", rowId);
          }
        }

        logBusinessEvent("payment_success_processed", userId, {
          provider,
          subscriptionId,
          amount,
          currency,
          productType,
        });

        return true;
      } catch (addonError) {
        logError("Failed to process ADDON payment in webhook", addonError as Error, {
          provider,
          subscriptionId,
          userId,
        });
        return false;
      }
    }

    const finalDays = getDaysFromPayment(pendingPayment, provider, amount, currency, days);

    const success = await updateSubscriptionStatus(
      userId,
      subscriptionId,
      "active",
      provider,
      amount > 0 ? amount : undefined,
      amount > 0 ? currency : undefined,
      finalDays,
      paypalOrderId
    );

    if (success) {
      logBusinessEvent("payment_success_processed", userId, {
        provider,
        subscriptionId,
        amount,
        currency,
        daysAdded: finalDays,
      });

      if (pendingPayment) {
        await updateUserWallet(userId, pendingPayment, provider);
      }

      const rewardTransactionId = String(
        pendingPayment?.transaction_id ||
          pendingPayment?.out_trade_no ||
          paypalOrderId ||
          subscriptionId ||
          data?.id ||
          ""
      ).trim();

      if (rewardTransactionId) {
        await grantReferralFirstPaymentReward({
          invitedUserId: userId,
          transactionId: rewardTransactionId,
          provider,
          region: isChinaRegion() ? "CN" : "INTL",
        }).catch((rewardError) => {
          logWarn("Failed to grant referral first-payment reward in webhook success", {
            provider,
            userId,
            transactionId: rewardTransactionId,
            error: rewardError instanceof Error ? rewardError.message : String(rewardError),
          });
        });
      }
    }

    return success;
  } catch (error) {
    logError(
      `Error handling payment success for ${provider}`,
      error as Error,
      { provider, data: JSON.stringify(data) }
    );
    return false;
  }
}
/**
 * 从不同支付提供商提取支付数据
 */
async function extractPaymentData(
  provider: string,
  data: any
): Promise<PaymentData | null> {
  let subscriptionId = "";
  let userId = "";
  let amount = 0;
  let currency = "USD";
  let paypalOrderId = "";

  switch (provider) {
    case "paypal":
      return extractPayPalPaymentData(data);

    case "stripe":
      subscriptionId = data.subscription || data.id;
      userId = data.metadata?.userId || data.customer;
      amount = (data.amount_total || 0) / 100;
      currency = data.currency?.toUpperCase() || "USD";
      break;

    case "alipay":
      subscriptionId = data.out_trade_no;
      userId = data.passback_params || "";
      amount = parseFloat(data.total_amount || "0");
      currency = "CNY";
      break;

    case "wechat":
      subscriptionId = data.out_trade_no;
      userId = data.attach?.userId || "";
      amount = (data.amount?.total || 0) / 100;
      currency = "CNY";
      break;
  }

  if (!userId || !subscriptionId) {
    logError(
      `Missing userId or subscriptionId for ${provider} payment`,
      undefined,
      {
        provider,
        subscriptionId,
        userId,
        dataStructure: {
          hasId: !!data.id,
          keys: Object.keys(data).join(", "),
        },
      }
    );
    return null;
  }

  return {
    subscriptionId,
    userId,
    amount,
    currency,
    days: 0,
    paypalOrderId,
  };
}

/**
 * 提取 PayPal 支付数据
 */
async function extractPayPalPaymentData(data: any): Promise<PaymentData | null> {
  let subscriptionId = data.billing_agreement_id || data.id;
  let userId = "";
  let amount = 0;
  let currency = "USD";
  let paypalOrderId = "";

  // 提取 Order ID
  if (data.supplementary_data?.related_ids?.order_id) {
    paypalOrderId = data.supplementary_data.related_ids.order_id;
  } else if (data.links && data.links.length > 0) {
    const orderLink = data.links.find(
      (l: any) =>
        l.rel === "up" &&
        (l.href?.includes("/orders/") || l.href?.includes("/checkouts/"))
    );
    if (orderLink?.href) {
      const match = orderLink.href.match(/\/orders\/([A-Z0-9]+)/);
      if (match?.[1]) {
        paypalOrderId = match[1];
      }
    }
  }

  logInfo("PayPal payment success data", {
    subscriptionId,
    paypalOrderId: paypalOrderId || "NOT_FOUND",
    dataKeys: Object.keys(data),
    hasAmount: !!data.amount,
    hasPurchaseUnits: !!data.purchase_units,
    id: data.id,
  });

  // 处理不同的 PayPal 事件结构
  if (data.purchase_units && data.purchase_units.length > 0) {
    const purchaseUnit = data.purchase_units[0];
    userId = purchaseUnit.custom_id || purchaseUnit.reference_id || "";

    if (purchaseUnit.amount) {
      amount = parseFloat(purchaseUnit.amount.value || "0");
      currency = purchaseUnit.amount.currency_code || "USD";
    }
  } else if (data.captures && data.captures.length > 0) {
    const capture = data.captures[0];
    userId = capture.custom_id || data.custom_id || "";
    amount = parseFloat(capture.amount?.value || "0");
    currency = capture.amount?.currency_code || "USD";
  } else if (data.custom_id) {
    userId = data.custom_id;
    if (data.amount) {
      amount = parseFloat(data.amount.value || data.amount.total || "0");
      currency = data.amount.currency_code || data.amount.currency || "USD";
    }
  } else {
    // 从订阅中查找用户ID
    const paypalUser = await findUserBySubscriptionId(subscriptionId);
    userId = paypalUser?.userId || "";

    amount = parseFloat(
      data.amount?.total ||
        data.billing_info?.last_payment?.amount?.value ||
        "0"
    );
    currency =
      data.amount?.currency ||
      data.billing_info?.last_payment?.amount?.currency_code ||
      "USD";
  }

  if (!userId || !subscriptionId) {
    logError("Missing userId or subscriptionId for PayPal payment", undefined, {
      subscriptionId,
      userId,
      paypalOrderId,
    });
    return null;
  }

  return {
    subscriptionId,
    userId,
    amount,
    currency,
    days: 0,
    paypalOrderId,
  };
}

/**
 * 查找待处理的支付记录
 */
async function findPendingPayment(
  provider: string,
  subscriptionId: string,
  userId: string,
  amount: number,
  paypalOrderId?: string
): Promise<PaymentRecord | null> {
  try {
    if (isChinaRegion()) {
      return await findPendingPaymentCloudBase(provider, subscriptionId);
    } else {
      return await findPendingPaymentSupabase(
        provider,
        subscriptionId,
        userId,
        amount,
        paypalOrderId
      );
    }
  } catch (error) {
    logError(
      `Error reading payment record for ${provider}`,
      error as Error,
      { provider, subscriptionId, userId }
    );
    return null;
  }
}

async function findPendingPaymentCloudBase(
  provider: string,
  subscriptionId: string
): Promise<PaymentRecord | null> {
  const db = getDatabase();

  let result = await db
    .collection("payments")
    .where({ transaction_id: subscriptionId })
    .orderBy("created_at", "desc")
    .limit(1)
    .get();

  let payment = result.data?.[0] || null;

  if (!payment && provider === "alipay") {
    result = await db
      .collection("payments")
      .where({ out_trade_no: subscriptionId })
      .orderBy("created_at", "desc")
      .limit(1)
      .get();
    payment = result.data?.[0] || null;
  }

  return payment;
}

async function findPendingPaymentSupabase(
  provider: string,
  subscriptionId: string,
  userId: string,
  amount: number,
  paypalOrderId?: string
): Promise<PaymentRecord | null> {
  logInfo("🔍 Querying Supabase for payment record", {
    provider,
    subscriptionId,
    userId,
    paypalOrderId,
    amount,
  });

  // 策略1: transaction_id
  let { data: payment } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("transaction_id", subscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (payment) {
    logInfo("✅ Strategy 1: Payment found by transaction_id", {
      subscriptionId,
      metadata: payment.metadata,
    });
    return payment;
  }

  // 策略2: PayPal Order ID
  if (provider === "paypal" && paypalOrderId) {
    const { data: paymentByOrder } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("transaction_id", paypalOrderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentByOrder) {
      logInfo("✅ Strategy 2: Found PayPal payment using paypalOrderId", {
        subscriptionId,
        paypalOrderId,
        metadata: paymentByOrder.metadata,
      });
      return paymentByOrder;
    }
  }

  // 策略3: user + amount
  if (provider === "paypal" && userId && amount > 0) {
    const { data: paymentByAmount } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("user_id", userId)
      .eq("amount", amount)
      .eq("payment_method", provider)
      .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentByAmount) {
      logInfo("✅ Strategy 3: Found PayPal payment using user+amount", {
        subscriptionId,
        metadata: paymentByAmount.metadata,
      });
      return paymentByAmount;
    }
  }

  // 策略4: Alipay out_trade_no
  if (provider === "alipay" && userId) {
    const { data: paymentByTradeNo } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("out_trade_no", subscriptionId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentByTradeNo) {
      logInfo("✅ Strategy 4: Found Alipay payment using out_trade_no", {
        subscriptionId,
        metadata: paymentByTradeNo.metadata,
      });
      return paymentByTradeNo;
    }
  }

  logWarn("❌ Payment record not found after all strategies", {
    provider,
    subscriptionId,
    paypalOrderId,
    userId,
    amount,
  });

  return null;
}

/**
 * 从支付记录中获取天数
 */
function getDaysFromPayment(
  payment: PaymentRecord | null,
  provider: string,
  amount: number,
  currency: string,
  defaultDays: number
): number {
  const rawDays = payment?.metadata?.days;
  const parsedDays =
    typeof rawDays === "number"
      ? rawDays
      : typeof rawDays === "string"
      ? parseInt(rawDays, 10)
      : NaN;

  if (Number.isFinite(parsedDays) && parsedDays > 0) {
    logInfo(`Days extracted from ${provider} payment metadata`, {
      days: parsedDays,
      metadata: payment?.metadata,
    });
    return parsedDays;
  }

  const billingCycle = String(payment?.metadata?.billingCycle || "").toLowerCase();
  if (billingCycle === "yearly" || billingCycle === "annual" || billingCycle === "year") {
    return 365;
  }
  if (billingCycle === "monthly" || billingCycle === "month") {
    return 30;
  }

  if (defaultDays && Number.isFinite(defaultDays) && defaultDays > 0) {
    return defaultDays;
  }

  logWarn(`Days metadata missing for ${provider}, using safe default`, {
    provider,
    amount,
    currency,
    hasPayment: !!payment,
    defaultDays,
  });

  return 30;
}

/**
 * 更新用户钱包
 */
async function updateUserWallet(
  userId: string,
  payment: PaymentRecord,
  provider: string
): Promise<void> {
  try {
    const metadata = (payment.metadata || {}) as any;
    const productType = payment.type || metadata.productType;
    const productId = payment.addon_package_id || metadata.productId;
    const planType = metadata.planType;
    const addonImageCredits = Math.max(
      0,
      Math.floor(
        Number(
          payment.image_credits ?? metadata.imageCredits ?? metadata.addonImageCredits ?? 0
        )
      )
    );
    const addonVideoAudioCredits = Math.max(
      0,
      Math.floor(
        Number(
          payment.video_audio_credits ??
            metadata.videoAudioCredits ??
            metadata.addonVideoAudioCredits ??
            0
        )
      )
    );

    if (isChinaRegion()) {
      await updateCloudBaseWallet(
        userId,
        productType,
        productId,
        planType,
        provider,
        addonImageCredits,
        addonVideoAudioCredits
      );
    } else {
      await updateSupabaseWallet(
        userId,
        productType,
        productId,
        planType,
        provider,
        addonImageCredits,
        addonVideoAudioCredits
      );
    }

    await updateUnifiedCredits(userId, payment, provider);
  } catch (walletError) {
    logError("Wallet update error (non-fatal)", walletError as Error, {
      userId,
      provider,
      region: isChinaRegion() ? "CN" : "INTL",
    });
  }
}

async function updateUnifiedCredits(
  userId: string,
  payment: PaymentRecord,
  provider: string
): Promise<void> {
  const metadata = (payment.metadata || {}) as any;
  const productType = String(
    payment.type || metadata.productType || "SUBSCRIPTION"
  ).toUpperCase();
  const billingSettings = await getBillingSettings(isChinaRegion() ? "CN" : "INTL");
  const basePaymentId = String(
    payment.transaction_id ||
      payment.out_trade_no ||
      payment.id ||
      payment._id ||
      provider + ":" + Date.now()
  );

  if (productType === "SUBSCRIPTION" || metadata.planId || metadata.planType) {
    const plan = String(
      metadata.planId || metadata.planType || metadata.productId || "pro"
    ).toLowerCase();
    await ensureCreditWallet(userId, plan);
    logInfo("Unified credits seeded for subscription", {
      userId,
      plan,
      provider,
    });
    return;
  }

  if (productType === "ADDON" || productType === "CREDITS") {
    const fallbackCredits = Math.max(
      0,
      Math.floor(
        Number(payment.amount || metadata.rechargeAmount || 0) *
          billingSettings.rechargeCreditRate
      )
    );
    const creditAmount = Math.max(
      0,
      Math.floor(Number(metadata.creditAmount || fallbackCredits || 0))
    );

    if (creditAmount <= 0) {
      return;
    }

    await grantRechargeCredits({
      userId,
      credits: creditAmount,
      planId: String(metadata.planId || "free"),
      entryType: productType === "ADDON" ? "addon_recharge" : "recharge",
      idempotencyKey: "payment-credit:" + basePaymentId + ":" + productType,
      metadata: {
        provider,
        productType,
      },
    });

    logInfo("Unified credits granted from payment", {
      userId,
      provider,
      productType,
      creditAmount,
    });
  }
}

async function updateCloudBaseWallet(
  userId: string,
  productType: string | undefined,
  productId: string | undefined,
  planType: string | undefined,
  provider: string,
  addonImageCredits = 0,
  addonVideoAudioCredits = 0
): Promise<void> {
  if (productType === "ADDON" && productId) {
    const addon = getAddonPackageById(productId);
    const imageCredits = addonImageCredits > 0 ? addonImageCredits : addon?.imageCredits || 0;
    const videoAudioCredits =
      addonVideoAudioCredits > 0 ? addonVideoAudioCredits : addon?.videoAudioCredits || 0;
    if (imageCredits > 0 || videoAudioCredits > 0) {
      const addResult = await addCloudBaseAddonCredits(
        userId,
        imageCredits,
        videoAudioCredits
      );
      if (addResult.success) {
        logInfo("CloudBase: Addon credits added to wallet", {
          userId,
          productId,
          imageCredits,
          videoAudioCredits,
          provider,
        });
      } else {
        logError("CloudBase: Failed to add addon credits", undefined, {
          userId,
          productId,
          error: addResult.error,
        });
      }
    }
  } else if (productType === "SUBSCRIPTION" || planType) {
    const plan = planType || productId || "pro";
    const wallet = await seedCloudBaseWalletForPlan(userId, plan.toLowerCase(), {
      forceReset: true,
    });
    if (wallet) {
      logInfo("CloudBase: Wallet seeded for subscription", {
        userId,
        plan,
        monthlyImageBalance: wallet.monthly_image_balance,
        monthlyVideoBalance: wallet.monthly_video_balance,
        provider,
      });
    } else {
      logError("CloudBase: Failed to seed wallet for subscription", undefined, {
        userId,
        plan,
      });
    }
  }
}

async function updateSupabaseWallet(
  userId: string,
  productType: string | undefined,
  productId: string | undefined,
  planType: string | undefined,
  provider: string,
  addonImageCredits = 0,
  addonVideoAudioCredits = 0
): Promise<void> {
  if (productType === "ADDON" && productId) {
    const addon = getAddonPackageById(productId);
    const imageCredits = addonImageCredits > 0 ? addonImageCredits : addon?.imageCredits || 0;
    const videoAudioCredits =
      addonVideoAudioCredits > 0 ? addonVideoAudioCredits : addon?.videoAudioCredits || 0;
    if (imageCredits > 0 || videoAudioCredits > 0) {
      const addResult = await addAddonCredits(
        userId,
        imageCredits,
        videoAudioCredits
      );
      if (addResult.success) {
        logInfo("Supabase: Addon credits added to wallet", {
          userId,
          productId,
          imageCredits,
          videoAudioCredits,
          provider,
        });
      } else {
        logError("Supabase: Failed to add addon credits", undefined, {
          userId,
          productId,
          error: addResult.error,
        });
      }
    }
  } else if (productType === "SUBSCRIPTION" || planType) {
    const plan = planType || productId || "pro";
    const wallet = await seedWalletForPlan(userId, plan.toLowerCase(), {
      forceReset: true,
    });
    if (wallet) {
      logInfo("Supabase: Wallet seeded for subscription", {
        userId,
        plan,
        monthlyImageBalance: wallet.monthly_image_balance,
        monthlyVideoBalance: wallet.monthly_video_balance,
        provider,
      });
    } else {
      logError("Supabase: Failed to seed wallet for subscription", undefined, {
        userId,
        plan,
      });
    }
  }
}
