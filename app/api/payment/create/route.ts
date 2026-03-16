// app/api/payment/create/route.ts - 统一支付创建API（支持订阅+加油包）
import { NextRequest, NextResponse } from "next/server";
import { PayPalProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/paypal-provider";
import { StripeProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/stripe-provider";
import { AlipayProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/alipay-provider";
import { WechatProviderV3 } from "@/lib/architecture-modules/layers/third-party/payment/providers/wechat-provider-v3";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, createAuthErrorResponse } from "@/lib/auth";
import { getDatabase } from "@/lib/cloudbase-service";
import { isChinaRegion } from "@/lib/config/region";
import { paymentRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";
import { logInfo, logError, logWarn } from "@/lib/logger";
import { getDaysByBillingCycle } from "@/lib/payment-config";
import { getAddonPackageById, getAddonDescription } from "@/constants/addon-packages";
import { getPlanById } from "@/constants/pricing";
import type { PaymentMethod, BillingCycle } from "@/lib/payment-config";
import {
  getActiveSubscriptionSnapshot,
  normalizePlanId,
} from "@/app/api/payment/lib/subscription-plan-guard";
import {
  executeWithOptionalColumns,
  toCompatError,
} from "@/app/api/payment/lib/supabase-schema-compat";
import { getBillingSettings } from "@/lib/billing/settings";
import {
  getAddonProductPrice,
  getSubscriptionProductPrice,
} from "@/lib/payment-product-catalog";

const MOBILE_USER_AGENT = /android|iphone|ipad|ipod|mobile/i;

type ProductType = "SUBSCRIPTION" | "ADDON" | "ONETIME" | "CREDITS";

interface CreatePaymentBody {
  method: PaymentMethod;
  billingCycle?: BillingCycle;
  channel?: string;
  productType?: ProductType;
  planId?: string;
  addonPackageId?: string;
  imageCredits?: number;
  videoAudioCredits?: number;
  rechargeAmount?: number;
  creditAmount?: number;
}

const OPTIONAL_PAYMENT_INSERT_COLUMNS = [
  "type",
  "description",
  "metadata",
  "addon_package_id",
  "image_credits",
  "video_audio_credits",
  "out_trade_no",
  "client_type",
  "code_url",
  "provider",
  "provider_order_id",
];

function getMetadataActivePlan(user: any): string | null {
  const plan = normalizePlanId(user?.user_metadata?.subscription_plan);
  if (!plan || plan === "free") return null;
  const expiresAtRaw = user?.user_metadata?.membership_expires_at;
  if (typeof expiresAtRaw !== "string" || !expiresAtRaw.trim()) {
    return null;
  }
  const expiresMs = new Date(expiresAtRaw).getTime();
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
    return null;
  }
  return plan;
}

function detectAlipayProductMode(request: NextRequest): "wap" | "page" {
  const userAgent = request.headers.get("user-agent") || "";
  return MOBILE_USER_AGENT.test(userAgent) ? "wap" : "page";
}

async function insertSupabasePaymentRecord(paymentData: Record<string, any>) {
  const metadata =
    paymentData.metadata && typeof paymentData.metadata === "object"
      ? { ...paymentData.metadata }
      : {};
  if (typeof paymentData.description === "string" && paymentData.description.trim()) {
    metadata.description = paymentData.description;
  }

  const payloadWithMetadata =
    Object.keys(metadata).length > 0
      ? { ...paymentData, metadata }
      : { ...paymentData };

  return executeWithOptionalColumns({
    payload: payloadWithMetadata,
    optionalColumns: OPTIONAL_PAYMENT_INSERT_COLUMNS,
    tableName: "payments",
    execute: (payload) =>
      supabaseAdmin.from("payments").insert([payload]).select("id").limit(1).maybeSingle(),
  });
}

export async function POST(request: NextRequest) {
  return new Promise<NextResponse>((resolve) => {
    const mockRes = {
      status: (code: number) => ({
        json: (data: any) => resolve(NextResponse.json(data, { status: code })),
      }),
      setHeader: () => {},
      getHeader: () => undefined,
    };

    paymentRateLimit(request as any, mockRes as any, async () => {
      resolve(await handlePaymentCreate(request));
    });
  });
}

async function handlePaymentCreate(request: NextRequest) {
  const startTime = Date.now();
  const operationId = `payment_create_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  try {
    const authResult = await requireAuth(request);
    if (!authResult) {
      return createAuthErrorResponse();
    }

    const { user } = authResult;
    const body = (await request.json()) as CreatePaymentBody;

    const {
      method,
      billingCycle,
      channel,
      productType = "SUBSCRIPTION",
      planId,
      addonPackageId,
      rechargeAmount,
      creditAmount,
    } = body;

    const normalizedProductType: "SUBSCRIPTION" | "ADDON" | "CREDITS" =
      String(productType).toUpperCase() === "ADDON"
        ? "ADDON"
        : String(productType).toUpperCase() === "CREDITS"
          ? "CREDITS"
          : "SUBSCRIPTION";
    const isAddon = normalizedProductType === "ADDON";
    const isCreditRecharge = normalizedProductType === "CREDITS";
    const requestedPlanId = normalizePlanId(planId) || "free";

    logInfo("Creating payment", {
      operationId,
      userId: user.id,
      method,
      billingCycle,
      planId: requestedPlanId,
      productType: normalizedProductType,
      addonPackageId,
    });

    if (!method) {
      logWarn("Missing payment method", {
        operationId,
        userId: user.id,
      });
      return NextResponse.json(
        { success: false, error: "Missing payment method" },
        { status: 400 }
      );
    }

    if (!isAddon && !isCreditRecharge && planId && !normalizePlanId(planId)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid planId: ${planId}`,
        },
        { status: 400 }
      );
    }

    if (!isAddon && !isCreditRecharge) {
      let activePlan = getMetadataActivePlan(user);
      try {
        const activeSubscription = await getActiveSubscriptionSnapshot(user.id);
        if (activeSubscription?.planId) {
          activePlan = activeSubscription.planId;
        }
      } catch (activePlanError) {
        logWarn("Failed to resolve active subscription plan before create payment", {
          operationId,
          userId: user.id,
          error: activePlanError,
        });
      }

      if (activePlan === "pro" && requestedPlanId !== "pro") {
        logWarn("Blocked non-pro renewal while active pro subscription", {
          operationId,
          userId: user.id,
          currentPlan: activePlan,
          requestedPlanId,
          productType: normalizedProductType,
        });
        return NextResponse.json(
          {
            success: false,
            error:
              "当前已是专业版订阅，仅支持续费专业版。加油包可正常叠加购买。",
            code: "PRO_PLAN_RENEWAL_ONLY",
            currentPlan: "pro",
            allowedPlan: "pro",
          },
          { status: 409 }
        );
      }
    }

    const billingRegion = isChinaRegion() ? "CN" : "INTL";
    const effectiveBillingCycle: BillingCycle = isAddon || isCreditRecharge
      ? "monthly"
      : (billingCycle as BillingCycle);

    if (!isAddon && !isCreditRecharge && !["monthly", "yearly"].includes(effectiveBillingCycle)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid billing cycle. Must be 'monthly' or 'yearly'",
        },
        { status: 400 }
      );
    }

    let amount = 0;
    let days = 0;
    let description = "";
    let resolvedCreditAmount = 0;
    let currency = billingRegion === "CN" ? "CNY" : "USD";
    let addonImageCredits = 0;
    let addonVideoAudioCredits = 0;
    let addonPackage:
      | ReturnType<typeof getAddonPackageById>
      | undefined;

    const billingSettings = await getBillingSettings(billingRegion);
    currency = String(billingSettings.defaultCurrency || currency).toUpperCase();

    if (isAddon) {
      if (!addonPackageId) {
        return NextResponse.json(
          { success: false, error: "Missing addonPackageId for addon purchase" },
          { status: 400 }
        );
      }

      addonPackage = getAddonPackageById(addonPackageId);
      if (!addonPackage) {
        return NextResponse.json(
          { success: false, error: `Invalid addon package: ${addonPackageId}` },
          { status: 400 }
        );
      }

      const addonProductPrice = await getAddonProductPrice(addonPackageId, billingRegion);
      if (!addonProductPrice) {
        return NextResponse.json(
          { success: false, error: `Addon price not configured: ${addonPackageId}` },
          { status: 400 }
        );
      }

      currency = String(addonProductPrice.currency || currency).toUpperCase();
      amount = addonProductPrice.amount;
      addonImageCredits = Math.max(
        0,
        Math.floor(
          Number((addonProductPrice as any)?.metadata?.imageCredits ?? addonPackage.imageCredits)
        )
      );
      addonVideoAudioCredits = Math.max(
        0,
        Math.floor(
          Number(
            (addonProductPrice as any)?.metadata?.videoAudioCredits ?? addonPackage.videoAudioCredits
          )
        )
      );
      description =
        billingRegion === "CN"
          ? `${addonPackage.nameZh} - ${addonImageCredits}张图 + ${addonVideoAudioCredits}个视频/音频`
          : `${addonPackage.name} - ${addonImageCredits} images + ${addonVideoAudioCredits} video/audio`;
      days = 0;
      resolvedCreditAmount = Math.max(
        0,
        Math.floor(amount * billingSettings.rechargeCreditRate)
      );
    } else if (isCreditRecharge) {
      amount = Number(rechargeAmount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json(
          { success: false, error: "Invalid rechargeAmount for credits recharge" },
          { status: 400 }
        );
      }
      days = 0;
      description = billingRegion === "CN" ? "Credits 充值" : "Credits Recharge";
      resolvedCreditAmount = Math.max(
        0,
        Math.floor(Number(creditAmount || amount * billingSettings.rechargeCreditRate))
      );
    } else {
      const subscriptionPrice = await getSubscriptionProductPrice(
        requestedPlanId,
        effectiveBillingCycle,
        billingRegion
      );

      if (!subscriptionPrice) {
        return NextResponse.json(
          { success: false, error: `Subscription price not configured: ${requestedPlanId}` },
          { status: 400 }
        );
      }

      const plan = getPlanById(requestedPlanId);
      const cycleLabel =
        billingRegion === "CN"
          ? effectiveBillingCycle === "monthly"
            ? "月付"
            : "年付"
          : effectiveBillingCycle === "monthly"
            ? "Monthly"
            : "Yearly";
      const planName =
        billingRegion === "CN"
          ? plan?.nameZh || plan?.name || requestedPlanId
          : plan?.name || plan?.nameZh || requestedPlanId;

      currency = String(subscriptionPrice.currency || currency).toUpperCase();
      amount = subscriptionPrice.amount;
      days = getDaysByBillingCycle(effectiveBillingCycle);
      description = `${planName} - ${cycleLabel}`;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "当前商品价格无效，请先在后台设置有效售价",
        },
        { status: 400 }
      );
    }

    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    let recentPayments: any[] = [];
    let checkError: any = null;

    if (isChinaRegion()) {
      try {
        const db = getDatabase();
        const _ = db.command;
        const wherePayload: any = {
          user_id: user.id,
          amount,
          currency,
          payment_method: method,
          created_at: _.gte(oneMinuteAgo),
          status: _.in(["pending", "completed"]),
        };

        if (isAddon && addonPackage) {
          wherePayload.type = "ADDON";
          wherePayload.addon_package_id = addonPackage.id;
        }

        if (isCreditRecharge) {
          wherePayload.type = "CREDITS";
        }

        const result = await db
          .collection("payments")
          .where(wherePayload)
          .orderBy("created_at", "desc")
          .limit(1)
          .get();

        recentPayments = result.data || [];
      } catch (error) {
        checkError = error;
      }
    } else {
      let query = supabaseAdmin
        .from("payments")
        .select("id, status, created_at")
        .eq("user_id", user.id)
        .eq("amount", amount)
        .eq("currency", currency)
        .eq("payment_method", method)
        .gte("created_at", oneMinuteAgo)
        .in("status", ["pending", "completed"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (isAddon && addonPackage) {
        query = query.eq("type", "ADDON").eq("addon_package_id", addonPackage.id);
      }
      if (isCreditRecharge) {
        query = query.eq("type", "CREDITS");
      }

      const result = await query;

      recentPayments = result.data || [];
      checkError = result.error;
    }

    if (checkError && (!isChinaRegion() || checkError.code !== "PGRST116")) {
      logError("Error checking existing payment", checkError, {
        operationId,
        userId: user.id,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Unable to verify payment uniqueness, please try again",
        },
        { status: 500 }
      );
    }

    if (recentPayments && recentPayments.length > 0) {
      const latestPayment = recentPayments[0];
      const paymentAge =
        Date.now() - new Date(latestPayment.created_at).getTime();

      logWarn("Duplicate payment request blocked", {
        operationId,
        userId: user.id,
        existingPaymentId: latestPayment.id,
        paymentAge: `${Math.floor(paymentAge / 1000)}s`,
      });

      return NextResponse.json(
        {
          success: false,
          error:
            "You have a recent payment request. Please wait a moment before trying again.",
          code: "DUPLICATE_PAYMENT_REQUEST",
          existingPaymentId: latestPayment.id,
          waitTime: Math.ceil((60000 - paymentAge) / 1000),
        },
        { status: 429 }
      );
    }

    const metadata = isAddon
      ? {
          userId: user.id,
          paymentType: "onetime",
          productType: "ADDON",
          productId: addonPackage!.id,
          addonPackageId: addonPackage!.id,
          imageCredits: addonImageCredits,
          videoAudioCredits: addonVideoAudioCredits,
          creditAmount: resolvedCreditAmount,
        }
      : isCreditRecharge
        ? {
            userId: user.id,
            paymentType: "onetime",
            productType: "CREDITS",
            rechargeAmount: amount,
            creditAmount: resolvedCreditAmount,
          }
        : {
            userId: user.id,
            days,
            paymentType: "onetime",
            productType: "SUBSCRIPTION",
            planId: requestedPlanId,
            billingCycle: effectiveBillingCycle,
          };

    const order = {
      amount,
      currency,
      description,
      userId: user.id,
      planType: isAddon ? "addon" : isCreditRecharge ? "credits" : "onetime",
      billingCycle: effectiveBillingCycle,
      metadata,
    };

    let result;

    try {
      if (method === "stripe") {
        logInfo("Creating Stripe payment", {
          operationId,
          userId: user.id,
          amount,
          productType: normalizedProductType,
        });
        const stripeProvider = new StripeProvider(process.env);
        result = await stripeProvider.createOnetimePayment(order);
      } else if (method === "paypal") {
        logInfo("Creating PayPal payment", {
          operationId,
          userId: user.id,
          amount,
          productType: normalizedProductType,
        });
        const paypalProvider = new PayPalProvider(process.env);
        result = await paypalProvider.createOnetimePayment(order);
      } else if (method === "alipay") {
        const alipayProductMode =
          channel === "app" ? "wap" : detectAlipayProductMode(request);

        logInfo("Creating Alipay payment", {
          operationId,
          userId: user.id,
          amount,
          channel,
          productMode: alipayProductMode,
          productType: normalizedProductType,
        });
        const alipayProvider = new AlipayProvider(process.env);
        if (channel === "app") {
          logWarn("Alipay channel=app ignored; forcing H5/WAP", {
            operationId,
            userId: user.id,
          });
        }
        result = await alipayProvider.createPayment({
          ...order,
          productMode: alipayProductMode,
        });
      } else if (method === "wechat") {
        logInfo("Creating WeChat payment", {
          operationId,
          userId: user.id,
          amount,
          channel,
          productType: normalizedProductType,
        });

        if (!isChinaRegion()) {
          return NextResponse.json(
            {
              success: false,
              error: "WeChat payment is only available in China region",
            },
            { status: 400 }
          );
        }

        const out_trade_no = `WX${Date.now()}${Math.random()
          .toString(36)
          .substr(2, 9)
          .toUpperCase()}`;

        const wechatProvider = new WechatProviderV3({
          appId: process.env.WECHAT_APP_ID!,
          mchId: process.env.WECHAT_PAY_MCH_ID!,
          apiV3Key: process.env.WECHAT_PAY_API_V3_KEY!,
          privateKey: process.env.WECHAT_PAY_PRIVATE_KEY!,
          serialNo: process.env.WECHAT_PAY_SERIAL_NO!,
          notifyUrl: `${process.env.APP_URL}/api/payment/webhook/wechat`,
        });

        if (channel === "app") {
          const wechatResponse = await wechatProvider.createAppPayment({
            out_trade_no,
            amount: Math.round(amount * 100),
            description: order.description,
          });

          result = {
            success: true,
            paymentId: out_trade_no,
            transactionId: out_trade_no,
            prepayId: wechatResponse.prepayId,
            appPayParams: wechatResponse.appPayParams,
          };
        } else {
          const wechatResponse = await wechatProvider.createNativePayment({
            out_trade_no,
            amount: Math.round(amount * 100),
            description: order.description,
          });

          result = {
            success: true,
            paymentId: out_trade_no,
            paymentUrl: wechatResponse.codeUrl,
            codeUrl: wechatResponse.codeUrl,
            transactionId: out_trade_no,
          };
        }
      } else {
        return NextResponse.json(
          { success: false, error: `Unsupported payment method: ${method}` },
          { status: 400 }
        );
      }
    } catch (providerError) {
      const e: any = providerError;
      const providerErrorForLog =
        providerError instanceof Error
          ? providerError
          : new Error(
              typeof e?.message === "string"
                ? e.message
                : typeof providerError === "string"
                ? providerError
                : "Payment provider error"
            );

      logError("Payment provider error", providerErrorForLog, {
        operationId,
        userId: user.id,
        method,
      });
      return NextResponse.json(
        {
          success: false,
          error:
            typeof e?.message === "string"
              ? e.message
              : providerError instanceof Error
              ? providerError.message
              : "Payment provider error",
        },
        { status: 500 }
      );
    }

    if (result && result.success && result.paymentId) {
      const nowIso = new Date().toISOString();
      const paymentData: any = {
        user_id: user.id,
        amount,
        currency,
        status: "pending",
        payment_method: method,
        transaction_id: result.paymentId,
        type: isAddon ? "ADDON" : isCreditRecharge ? "CREDITS" : "SUBSCRIPTION",
        description,
        created_at: nowIso,
        updated_at: nowIso,
        metadata,
      };

      if (isAddon && addonPackage) {
        paymentData.addon_package_id = addonPackage.id;
        paymentData.image_credits = addonImageCredits;
        paymentData.video_audio_credits = addonVideoAudioCredits;
      }

      if (method === "wechat" || method === "alipay") {
        paymentData.out_trade_no = result.paymentId;
      }

      if (method === "wechat") {
        paymentData.client_type = channel === "app" ? "app" : "native";
        const codeUrl = (result as any)?.codeUrl;
        if (typeof codeUrl === "string" && codeUrl) {
          paymentData.code_url = codeUrl;
        }
      }

      try {
        if (isChinaRegion()) {
          const db = getDatabase();
          paymentData._id = result.paymentId;
          await db.collection("payments").add(paymentData);
        } else {
          const { error: paymentRecordError, droppedColumns } =
            await insertSupabasePaymentRecord(paymentData);

          if (paymentRecordError) {
            throw paymentRecordError;
          }

          if (droppedColumns.length > 0) {
            logWarn("Inserted payment record after dropping unsupported columns", {
              operationId,
              userId: user.id,
              transactionId: result.paymentId,
              droppedColumns,
            });
          }

          logInfo("Payment record created", {
            operationId,
            userId: user.id,
            transactionId: result.paymentId,
            amount,
            days,
            productType: normalizedProductType,
            addonPackageId: addonPackage?.id,
          });
        }
      } catch (paymentRecordError) {
        logError(
          "Error recording payment",
          toCompatError(paymentRecordError),
          {
            operationId,
            userId: user.id,
            transactionId: result.paymentId,
            amount,
            currency,
            method,
            productType: normalizedProductType,
          }
        );

        return NextResponse.json(
          {
            success: false,
            error: "Failed to persist payment record",
            code: "PAYMENT_RECORD_PERSIST_FAILED",
          },
          { status: 500 }
        );
      }
    }

    if (!result) {
      return NextResponse.json(
        { success: false, error: "Payment creation failed" },
        { status: 500 }
      );
    }

    const duration = Date.now() - startTime;
    logInfo("Payment created successfully", {
      operationId,
      userId: user.id,
      method,
      amount,
      days,
      productType: normalizedProductType,
      addonPackageId: addonPackage?.id,
      duration: `${duration}ms`,
    });

    return NextResponse.json({
      ...result,
      productType: normalizedProductType,
      addonPackageId: addonPackage?.id,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logError("Payment creation error", error as Error, {
      operationId,
      duration: `${duration}ms`,
    });
    captureException(error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
