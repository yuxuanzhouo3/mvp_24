// app/api/payment/confirm/route.ts - 统一支付确认API
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, createAuthErrorResponse } from "@/lib/auth";
import { isChinaRegion } from "@/lib/config/region";
import { getDatabase } from "@/lib/cloudbase-service";
import { logInfo, logError, logWarn } from "@/lib/logger";
import {
  confirmPayment,
  PaymentConfirmationError,
} from "@/app/api/payment/lib/confirm-payment";
import { extendMembership } from "@/app/api/payment/lib/extend-membership";
import { addAddonCredits } from "@/services/wallet";
import { getAddonPackageById } from "@/constants/addon-packages";
import { grantReferralFirstPaymentReward } from "@/lib/market/referrals";
import {
  executeWithOptionalColumns,
  isMissingColumnError,
  toCompatError,
} from "@/app/api/payment/lib/supabase-schema-compat";

type ResolvedProductType = "ADDON" | "SUBSCRIPTION";

type PaymentStatus = "pending" | "completed";

const OPTIONAL_PAYMENT_INSERT_COLUMNS = [
  "type",
  "metadata",
  "out_trade_no",
];

function resolveProductType(payment: any): ResolvedProductType {
  const type = String(
    payment?.type || payment?.metadata?.productType || "SUBSCRIPTION"
  ).toUpperCase();
  return type === "ADDON" ? "ADDON" : "SUBSCRIPTION";
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    unique.add(trimmed);
  }
  return Array.from(unique);
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function findSupabasePaymentForUser(
  userId: string,
  status: PaymentStatus,
  identifiers: string[],
  operationId: string
): Promise<{ payment: any | null; error: any }> {
  if (identifiers.length === 0) {
    return { payment: null, error: null };
  }

  let lastError: any = null;

  const { data: byTransaction, error: byTransactionError } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .eq("status", status)
    .in("transaction_id", identifiers)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byTransaction) {
    return { payment: byTransaction, error: null };
  }
  if (byTransactionError && (byTransactionError as any)?.code !== "PGRST116") {
    lastError = byTransactionError;
  }

  const { data: byOutTradeNo, error: byOutTradeNoError } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .eq("status", status)
    .in("out_trade_no", identifiers)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byOutTradeNo) {
    return { payment: byOutTradeNo, error: null };
  }
  if (byOutTradeNoError && (byOutTradeNoError as any)?.code !== "PGRST116") {
    if (isMissingColumnError(byOutTradeNoError, "out_trade_no", "payments")) {
      logWarn("payments.out_trade_no column is missing, skipping lookup", {
        operationId,
        userId,
        status,
      });
    } else if (!lastError) {
      lastError = byOutTradeNoError;
    }
  }

  const uuidIdentifiers = identifiers.filter(isUuidLike);
  if (uuidIdentifiers.length > 0) {
    const { data: byId, error: byIdError } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("user_id", userId)
      .eq("status", status)
      .in("id", uuidIdentifiers)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byId) {
      return { payment: byId, error: null };
    }
    if (byIdError && (byIdError as any)?.code !== "PGRST116" && !lastError) {
      lastError = byIdError;
    }
  }

  return { payment: null, error: lastError };
}

async function findCloudbasePaymentForUser(
  userId: string,
  status: PaymentStatus,
  identifiers: string[]
): Promise<{ payment: any | null; error: any }> {
  if (identifiers.length === 0) {
    return { payment: null, error: null };
  }

  try {
    const db = getDatabase();
    const result = await db
      .collection("payments")
      .where({
        user_id: userId,
        status,
      })
      .orderBy("created_at", "desc")
      .limit(100)
      .get();

    const identifierSet = new Set(identifiers);
    const payment =
      (result.data || []).find((row: any) => {
        const candidates = [
          row?.transaction_id,
          row?.out_trade_no,
          row?._id,
          row?.id,
        ];
        return candidates.some(
          (candidate) =>
            typeof candidate === "string" && identifierSet.has(candidate)
        );
      }) || null;

    return { payment, error: null };
  } catch (error) {
    return { payment: null, error };
  }
}

async function findPaymentForUser(
  userId: string,
  status: PaymentStatus,
  identifiers: string[],
  operationId: string
): Promise<{ payment: any | null; error: any }> {
  if (isChinaRegion()) {
    return findCloudbasePaymentForUser(userId, status, identifiers);
  }
  return findSupabasePaymentForUser(userId, status, identifiers, operationId);
}

async function hasSubscriptionForTransaction(
  userId: string,
  transactionId: string,
  operationId: string
): Promise<boolean> {
  if (!transactionId) {
    return false;
  }

  if (isChinaRegion()) {
    try {
      const db = getDatabase();
      const subscriptionsCollection = db.collection("subscriptions");

      const byTransaction = await subscriptionsCollection
        .where({
          user_id: userId,
          transaction_id: transactionId,
        })
        .limit(1)
        .get();

      if ((byTransaction.data?.length || 0) > 0) {
        return true;
      }

      const byProviderSubscription = await subscriptionsCollection
        .where({
          user_id: userId,
          provider_subscription_id: transactionId,
        })
        .limit(1)
        .get();

      return (byProviderSubscription.data?.length || 0) > 0;
    } catch (error) {
      logWarn("CloudBase subscription idempotency lookup failed", {
        operationId,
        userId,
        transactionId,
        error,
      });
      return false;
    }
  }

  try {
    const { data: byTransaction, error: byTransactionError } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("transaction_id", transactionId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byTransaction?.id) {
      return true;
    }

    if (byTransactionError && (byTransactionError as any)?.code !== "PGRST116") {
      if (isMissingColumnError(byTransactionError, "transaction_id", "subscriptions")) {
        logWarn("subscriptions.transaction_id column is missing, retrying idempotency lookup", {
          operationId,
          userId,
          transactionId,
        });
      } else {
        logWarn("Supabase transaction_id idempotency lookup failed", {
          operationId,
          userId,
          transactionId,
          error: byTransactionError,
        });
      }
    }

    const { data: byProviderSubscription, error: byProviderError } =
      await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .eq("provider_subscription_id", transactionId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (byProviderError && (byProviderError as any)?.code !== "PGRST116") {
      if (
        isMissingColumnError(
          byProviderError,
          "provider_subscription_id",
          "subscriptions"
        )
      ) {
        logWarn("subscriptions.provider_subscription_id column is missing during idempotency lookup", {
          operationId,
          userId,
          transactionId,
        });
      } else {
        logWarn("Supabase provider_subscription_id idempotency lookup failed", {
          operationId,
          userId,
          transactionId,
          error: byProviderError,
        });
      }
    }

    if (byProviderSubscription?.id) {
      return true;
    }

    return false;
  } catch (error) {
    logWarn("Supabase subscription idempotency lookup threw unexpectedly", {
      operationId,
      userId,
      transactionId,
      error,
    });
    return false;
  }
}

async function ensureMembershipExtended(
  userId: string,
  days: number,
  transactionId: string,
  operationId: string
): Promise<boolean> {
  const alreadyExtended = await hasSubscriptionForTransaction(
    userId,
    transactionId,
    operationId
  );
  if (alreadyExtended) {
    logInfo("Membership already extended for transaction, skipping duplicate", {
      operationId,
      userId,
      transactionId,
      days,
    });
    return true;
  }

  if (days <= 0) {
    logWarn("Cannot extend membership with non-positive days", {
      operationId,
      userId,
      transactionId,
      days,
    });
    return false;
  }

  return extendMembership(userId, days, transactionId);
}

function resolveAddonCredits(payment: any): {
  addonPackageId?: string;
  imageCredits: number;
  videoAudioCredits: number;
} {
  const addonPackageId =
    payment?.addon_package_id ||
    payment?.metadata?.addonPackageId ||
    payment?.metadata?.productId;

  let imageCredits = Number(
    payment?.image_credits ?? payment?.metadata?.imageCredits ?? 0
  );
  let videoAudioCredits = Number(
    payment?.video_audio_credits ?? payment?.metadata?.videoAudioCredits ?? 0
  );

  if (imageCredits <= 0 && videoAudioCredits <= 0 && addonPackageId) {
    const addonPkg = getAddonPackageById(addonPackageId);
    if (addonPkg) {
      imageCredits = addonPkg.imageCredits;
      videoAudioCredits = addonPkg.videoAudioCredits;
    }
  }

  return {
    addonPackageId: addonPackageId || undefined,
    imageCredits: Math.max(0, imageCredits),
    videoAudioCredits: Math.max(0, videoAudioCredits),
  };
}

function isAddonCreditsGranted(payment: any): boolean {
  return Boolean(
    payment?.addon_credits_granted ||
      payment?.metadata?.addonCreditsGranted ||
      payment?.metadata?.addon_credits_granted
  );
}

async function markAddonCreditsGranted(payment: any) {
  const nowIso = new Date().toISOString();
  const mergedMetadata = {
    ...(payment?.metadata || {}),
    addonCreditsGranted: true,
    addonCreditsGrantedAt: nowIso,
  };

  if (isChinaRegion()) {
    const db = getDatabase();
    const docId = payment?._id;
    if (docId) {
      await db.collection("payments").doc(docId).update({
        metadata: mergedMetadata,
        updated_at: nowIso,
      });
    }
    return;
  }

  const rowId = payment?.id;
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

async function ensureAddonCreditsGranted(
  userId: string,
  payment: any,
  operationId: string
): Promise<
  | {
      success: true;
      addonPackageId?: string;
      imageCredits: number;
      videoAudioCredits: number;
    }
  | { success: false; error: string }
> {
  const { addonPackageId, imageCredits, videoAudioCredits } =
    resolveAddonCredits(payment);

  if (isAddonCreditsGranted(payment)) {
    return {
      success: true,
      addonPackageId,
      imageCredits,
      videoAudioCredits,
    };
  }

  if (imageCredits <= 0 && videoAudioCredits <= 0) {
    return {
      success: false,
      error: "Invalid addon credits configuration",
    };
  }

  const addRes = await addAddonCredits(userId, imageCredits, videoAudioCredits);
  if (!addRes.success) {
    logError("Failed to add addon credits", undefined, {
      operationId,
      userId,
      addonPackageId,
      imageCredits,
      videoAudioCredits,
      error: addRes.error,
    });
    return {
      success: false,
      error: addRes.error || "Failed to add addon credits",
    };
  }

  try {
    await markAddonCreditsGranted(payment);
  } catch (markError) {
    logWarn("Addon credits granted but marker update failed", {
      operationId,
      userId,
      addonPackageId,
      markError,
    });
  }

  return {
    success: true,
    addonPackageId,
    imageCredits,
    videoAudioCredits,
  };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const operationId = `payment_confirm_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  try {
    const authResult = await requireAuth(request);
    if (!authResult) {
      return createAuthErrorResponse();
    }

    const { user } = authResult;
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get("session_id");
    const token = searchParams.get("token");
    const outTradeNo = searchParams.get("out_trade_no");
    const tradeNo = searchParams.get("trade_no");
    const wechatOutTradeNo = searchParams.get("wechat_out_trade_no");

    logInfo("Processing payment confirmation", {
      operationId,
      userId: user.id,
      hasSessionId: !!sessionId,
      hasToken: !!token,
      hasOutTradeNo: !!outTradeNo,
      hasTradeNo: !!tradeNo,
      hasWechatOutTradeNo: !!wechatOutTradeNo,
    });

    if (!sessionId && !token && !outTradeNo && !tradeNo && !wechatOutTradeNo) {
      logWarn("Missing payment confirmation parameters", {
        operationId,
        userId: user.id,
      });
      return NextResponse.json(
        { success: false, error: "Missing payment confirmation parameters" },
        { status: 400 }
      );
    }

    let transactionId = "";
    let amount = 0;
    let currency = "USD";
    let days = 0;

    try {
      const confirmedPayment = await confirmPayment({
        sessionId: sessionId || undefined,
        token: token || undefined,
        outTradeNo: outTradeNo || undefined,
        tradeNo: tradeNo || undefined,
        wechatOutTradeNo: wechatOutTradeNo || undefined,
        userId: user.id,
        operationId,
      });

      transactionId = confirmedPayment.transactionId;
      amount = confirmedPayment.amount;
      currency = confirmedPayment.currency;
      days = confirmedPayment.days;
    } catch (error) {
      if (error instanceof PaymentConfirmationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status }
        );
      }
      throw error;
    }

    const completedLookupKeys = uniqueNonEmpty([
      transactionId,
      sessionId,
      token,
      outTradeNo,
      wechatOutTradeNo,
      tradeNo,
    ]);
    const { payment: existingCompletedPayment, error: existingCheckError } =
      await findPaymentForUser(
        user.id,
        "completed",
        completedLookupKeys,
        operationId
      );

    if (existingCheckError) {
      logError("Error checking existing payment", existingCheckError as Error, {
        operationId,
        userId: user.id,
        transactionId,
      });
    }

    if (existingCompletedPayment) {
      logInfo("Payment already processed", {
        operationId,
        userId: user.id,
        transactionId,
        existingPaymentId:
          existingCompletedPayment.id || existingCompletedPayment._id,
      });

      const existingProductType = resolveProductType(existingCompletedPayment);

      if (existingProductType === "ADDON") {
        const addonGrantResult = await ensureAddonCreditsGranted(
          user.id,
          existingCompletedPayment,
          operationId
        );

        if (!addonGrantResult.success) {
          return NextResponse.json(
            {
              success: false,
              error: addonGrantResult.error,
            },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          message: "Addon payment already processed",
          transactionId,
          productType: "ADDON",
          amount,
          currency,
          imageCredits: addonGrantResult.imageCredits,
          videoAudioCredits: addonGrantResult.videoAudioCredits,
        });
      }

      if (days > 0 && transactionId) {
        logInfo("Ensuring membership extension for already-processed payment", {
          operationId,
          userId: user.id,
          transactionId,
          days,
        });

        const membershipExtended = await ensureMembershipExtended(
          user.id,
          days,
          transactionId,
          operationId
        );

        if (!membershipExtended) {
          logWarn("Failed to ensure membership extension for processed payment", {
            operationId,
            userId: user.id,
            transactionId,
          });
        }
      }

      const existingTransactionId = String(
        existingCompletedPayment.transaction_id || transactionId || ""
      ).trim();
      if (existingTransactionId) {
        await grantReferralFirstPaymentReward({
          invitedUserId: user.id,
          transactionId: existingTransactionId,
          provider:
            String(existingCompletedPayment.payment_method || "").trim() || null,
          region: isChinaRegion() ? "CN" : "INTL",
        }).catch((rewardError) => {
          logWarn("Failed to grant referral first-payment reward for completed payment", {
            operationId,
            userId: user.id,
            transactionId: existingTransactionId,
            error: rewardError instanceof Error ? rewardError.message : String(rewardError),
          });
        });
      }

      return NextResponse.json({
        success: true,
        message: "Payment already processed",
        transactionId,
        productType: "SUBSCRIPTION",
      });
    }

    const paymentIdToUpdate =
      sessionId || token || outTradeNo || wechatOutTradeNo || tradeNo;
    const pendingLookupKeys = uniqueNonEmpty([
      paymentIdToUpdate,
      transactionId,
      sessionId,
      token,
      outTradeNo,
      wechatOutTradeNo,
      tradeNo,
    ]);
    let { payment: pendingPayment, error: findError } = await findPaymentForUser(
      user.id,
      "pending",
      pendingLookupKeys,
      operationId
    );

    if (findError) {
      logError("Error finding pending payment", findError as Error, {
        operationId,
        userId: user.id,
        transactionId: paymentIdToUpdate,
      });
    }

    let productTypeToProcess: ResolvedProductType = "SUBSCRIPTION";

    if (pendingPayment) {
      if (amount === 0 && pendingPayment.amount) {
        amount = pendingPayment.amount;
        logInfo("Using amount from pending payment", {
          operationId,
          userId: user.id,
          amount,
        });
      }
      if (!currency && pendingPayment.currency) {
        currency = pendingPayment.currency;
      }

      productTypeToProcess = resolveProductType(pendingPayment);

      let updateError: any = null;
      const nowIso = new Date().toISOString();

      if (isChinaRegion()) {
        try {
          const db = getDatabase();
          const paymentsCollection = db.collection("payments");

          await paymentsCollection.doc(pendingPayment._id).update({
            status: "completed",
            transaction_id: transactionId,
            amount,
            currency,
            updated_at: nowIso,
          });
        } catch (error) {
          logError("Error updating CloudBase payment status", error as Error, {
            operationId,
            userId: user.id,
            paymentId: pendingPayment._id,
          });
          updateError = error;
        }
      } else {
        const { error } = await supabaseAdmin
          .from("payments")
          .update({
            status: "completed",
            transaction_id: transactionId,
            amount,
            currency,
            updated_at: nowIso,
          })
          .eq("id", pendingPayment.id);

        updateError = error;
      }

      if (updateError) {
        logError("Error updating payment status", updateError as Error, {
          operationId,
          userId: user.id,
          paymentId: pendingPayment.id || pendingPayment._id,
        });
      }

      pendingPayment = {
        ...pendingPayment,
        status: "completed",
        transaction_id: transactionId,
        amount,
        currency,
      };

      if (productTypeToProcess === "ADDON") {
        const addonGrantResult = await ensureAddonCreditsGranted(
          user.id,
          pendingPayment,
          operationId
        );

        if (!addonGrantResult.success) {
          return NextResponse.json(
            {
              success: false,
              error: addonGrantResult.error,
            },
            { status: 500 }
          );
        }

        const duration = Date.now() - startTime;
        logInfo("Addon payment confirmed successfully", {
          operationId,
          userId: user.id,
          transactionId,
          amount,
          currency,
          imageCredits: addonGrantResult.imageCredits,
          videoAudioCredits: addonGrantResult.videoAudioCredits,
          duration: `${duration}ms`,
        });

        return NextResponse.json({
          success: true,
          transactionId,
          amount,
          currency,
          productType: "ADDON",
          imageCredits: addonGrantResult.imageCredits,
          videoAudioCredits: addonGrantResult.videoAudioCredits,
        });
      }
    } else {
      logWarn("No pending payment found, creating new record", {
        operationId,
        userId: user.id,
        transactionId,
        amount,
        days,
      });

      if (amount <= 0) {
        logError(
          "Cannot create payment with zero or negative amount",
          undefined,
          {
            operationId,
            userId: user.id,
            transactionId,
            amount,
            currency,
          }
        );
      } else {
        const paymentData: any = {
          user_id: user.id,
          amount,
          currency,
          status: "completed",
          payment_method: sessionId
            ? "stripe"
            : token
            ? "paypal"
            : wechatOutTradeNo
            ? "wechat"
            : "alipay",
          transaction_id: transactionId,
          type: "SUBSCRIPTION",
          metadata: {
            days,
            paymentType: "onetime",
            productType: "SUBSCRIPTION",
            billingCycle: days === 365 ? "yearly" : "monthly",
          },
        };

        if (wechatOutTradeNo || outTradeNo) {
          paymentData.out_trade_no = wechatOutTradeNo || outTradeNo;
        }

        let insertError: any = null;

        if (isChinaRegion()) {
          try {
            const db = getDatabase();
            const paymentsCollection = db.collection("payments");

            await paymentsCollection.add({
              ...paymentData,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });

            logInfo("Payment record created successfully in CloudBase", {
              operationId,
              userId: user.id,
              transactionId,
              amount,
              days,
            });
          } catch (error) {
            logError(
              "Error creating CloudBase payment record",
              error as Error,
              {
                operationId,
                userId: user.id,
                transactionId,
                amount,
              }
            );
            insertError = error;
          }
        } else {
          const {
            data: insertedPayment,
            error,
            droppedColumns,
          } = await executeWithOptionalColumns({
            payload: paymentData,
            optionalColumns: OPTIONAL_PAYMENT_INSERT_COLUMNS,
            tableName: "payments",
            execute: (payload) =>
              supabaseAdmin.from("payments").insert(payload).select("id").single(),
          });

          if (error) {
            logError("Error creating payment record in Supabase", error, {
              operationId,
              userId: user.id,
              transactionId,
              amount,
              currency,
              paymentData,
              errorCode: error.code,
              errorMessage: error.message,
              errorDetails: error.details,
              errorHint: error.hint,
            });
            insertError = error;
          } else if (insertedPayment) {
            const insertedPaymentRow = insertedPayment as { id: string };
            if (droppedColumns.length > 0) {
              logWarn("Created confirmed payment after dropping unsupported columns", {
                operationId,
                userId: user.id,
                transactionId,
                droppedColumns,
              });
            }

            logInfo("Payment record created successfully in Supabase", {
              operationId,
              userId: user.id,
              paymentId: insertedPaymentRow.id,
              transactionId,
              amount,
              days,
            });
          }
        }

        if (insertError) {
          logError(
            "Failed to create payment record - continuing anyway",
            toCompatError(insertError),
            {
              operationId,
              userId: user.id,
              transactionId,
            }
          );
        }
      }
    }

    if (productTypeToProcess === "SUBSCRIPTION") {
      const membershipExtended = await ensureMembershipExtended(
        user.id,
        days,
        transactionId,
        operationId
      );

      if (!membershipExtended) {
        logError("Failed to extend membership", undefined, {
          operationId,
          userId: user.id,
          transactionId,
          days,
        });
        return NextResponse.json(
          {
            success: false,
            error: "Payment confirmed but failed to extend membership",
          },
          { status: 500 }
        );
      }

      const paymentProviderHint =
        String(pendingPayment?.payment_method || "").trim() ||
        (sessionId
          ? "stripe"
          : token
          ? "paypal"
          : wechatOutTradeNo
          ? "wechat"
          : tradeNo
          ? "alipay"
          : "payment-confirm");

      if (transactionId) {
        await grantReferralFirstPaymentReward({
          invitedUserId: user.id,
          transactionId,
          provider: paymentProviderHint,
          region: isChinaRegion() ? "CN" : "INTL",
        }).catch((rewardError) => {
          logWarn("Failed to grant referral first-payment reward", {
            operationId,
            userId: user.id,
            transactionId,
            provider: paymentProviderHint,
            error: rewardError instanceof Error ? rewardError.message : String(rewardError),
          });
        });
      }
    }

    const duration = Date.now() - startTime;
    logInfo("Payment confirmed successfully", {
      operationId,
      userId: user.id,
      transactionId,
      amount,
      currency,
      daysAdded: days,
      productType: productTypeToProcess,
      duration: `${duration}ms`,
    });

    return NextResponse.json({
      success: true,
      transactionId,
      amount,
      currency,
      daysAdded: days,
      productType: "SUBSCRIPTION",
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logError("Payment confirmation error", error as Error, {
      operationId,
      duration: `${duration}ms`,
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
