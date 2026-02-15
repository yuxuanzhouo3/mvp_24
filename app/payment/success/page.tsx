// app/payment/success/page.tsx - 支付成功页面
"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";
import { useUser } from "@/components/user-context";

type ProductType = "SUBSCRIPTION" | "ADDON";

function PaymentSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useUser();
  const [isProcessing, setIsProcessing] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState<
    "processing" | "success" | "error"
  >("processing");
  const [paymentDetails, setPaymentDetails] = useState<{
    daysAdded?: number;
    amount?: number;
    currency?: string;
    productType?: ProductType;
    imageCredits?: number;
    videoAudioCredits?: number;
  }>({});
  const [hasProcessed, setHasProcessed] = useState(false);

  useEffect(() => {
    if (hasProcessed) {
      return;
    }

    const handlePaymentSuccess = async () => {
      try {
        const sessionId = searchParams.get("session_id");
        const token = searchParams.get("token");
        const outTradeNo = searchParams.get("out_trade_no");
        const tradeNo = searchParams.get("trade_no");
        const wechatOutTradeNo = searchParams.get("wechat_out_trade_no");
        const iapTransactionId = searchParams.get("iap_transaction_id");
        const iapProductId = searchParams.get("iap_product_id");
        const iapPlanId = searchParams.get("iap_plan_id");
        const iapBillingCycle = searchParams.get("iap_billing_cycle");

        if (
          !sessionId &&
          !token &&
          !outTradeNo &&
          !tradeNo &&
          !wechatOutTradeNo &&
          !iapTransactionId
        ) {
          throw new Error("Missing payment confirmation parameters");
        }

        // Apple IAP
        if (iapTransactionId && iapProductId && iapPlanId && iapBillingCycle) {
          const { getAuthClient } = await import("@/lib/auth/client");
          const sessionResult = await getAuthClient().getSession();
          const session = sessionResult.data.session;

          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (session?.access_token) {
            headers["Authorization"] = `Bearer ${session.access_token}`;
          }

          const response = await fetch("/api/payment/ios-iap/confirm", {
            method: "POST",
            headers,
            body: JSON.stringify({
              transactionId: iapTransactionId,
              productId: iapProductId,
              planId: iapPlanId,
              billingCycle: iapBillingCycle,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || "IAP confirmation failed");
          }

          const result = await response.json();

          if (result.success) {
            setHasProcessed(true);
            setPaymentDetails({
              daysAdded: result.daysAdded,
              amount: result.amount,
              currency: result.currency,
              productType: "SUBSCRIPTION",
            });

            try {
              await refreshUser();
            } catch (refreshError) {
              console.warn("⚠️ IAP refresh user failed:", refreshError);
            }

            setPaymentStatus("success");
            return;
          }

          throw new Error(result.error || "IAP confirmation failed");
        }

        // Alipay App 通道：先轮询 status，再走 confirm
        if (outTradeNo && !tradeNo && !sessionId && !token && !wechatOutTradeNo) {
          const paymentId = outTradeNo;

          try {
            const orderStringKey = `alipay:orderString:${paymentId}`;
            const launchedKey = `alipay:launched:${paymentId}`;
            const orderString = sessionStorage.getItem(orderStringKey);
            const launched = sessionStorage.getItem(launchedKey);

            if (orderString && !launched) {
              sessionStorage.setItem(launchedKey, "1");
              const orderSuffix = encodeURIComponent(orderString);
              const alipayDeepLink = `alipays://platformapi/startapp?appId=20000125&orderSuffix=${orderSuffix}`;
              window.location.href = alipayDeepLink;
            }
          } catch {
            // ignore
          }

          const start = Date.now();
          const TIMEOUT_MS = 120000;
          const INTERVAL_MS = 2000;

          while (Date.now() - start < TIMEOUT_MS) {
            const res = await fetch(
              `/api/payment/status?paymentId=${encodeURIComponent(paymentId)}`
            );
            if (res.ok) {
              const data = await res.json();
              if (data?.status === "completed") {
                const params = new URLSearchParams({
                  out_trade_no: paymentId,
                });

                const { getAuthClient } = await import("@/lib/auth/client");
                const sessionResult = await getAuthClient().getSession();
                const session = sessionResult.data.session;

                const headers: Record<string, string> = {};
                if (session?.access_token) {
                  headers["Authorization"] = `Bearer ${session.access_token}`;
                }

                const confirmResponse = await fetch(
                  `/api/payment/confirm?${params.toString()}`,
                  { headers }
                );

                if (!confirmResponse.ok) {
                  const confirmErrorData = await confirmResponse
                    .json()
                    .catch(() => ({}));
                  throw new Error(
                    confirmErrorData.error || "Payment confirmation failed"
                  );
                }

                const confirmResult = await confirmResponse.json();

                if (!confirmResult.success) {
                  throw new Error(
                    confirmResult.error || "Payment confirmation failed"
                  );
                }

                setPaymentStatus("success");
                setPaymentDetails({
                  daysAdded: confirmResult.daysAdded,
                  amount: confirmResult.amount || data.amount,
                  currency: confirmResult.currency || data.currency,
                  productType:
                    confirmResult.productType === "ADDON"
                      ? "ADDON"
                      : "SUBSCRIPTION",
                  imageCredits: confirmResult.imageCredits,
                  videoAudioCredits: confirmResult.videoAudioCredits,
                });
                await refreshUser();
                setHasProcessed(true);
                return;
              }
            }
            await new Promise((r) => setTimeout(r, INTERVAL_MS));
          }

          throw new Error("Payment is still processing, please try again");
        }

        const params = new URLSearchParams();
        if (sessionId) params.set("session_id", sessionId);
        if (token) params.set("token", token);
        if (outTradeNo) params.set("out_trade_no", outTradeNo);
        if (tradeNo) params.set("trade_no", tradeNo);
        if (wechatOutTradeNo) params.set("wechat_out_trade_no", wechatOutTradeNo);

        const { getAuthClient } = await import("@/lib/auth/client");
        const sessionResult = await getAuthClient().getSession();
        const session = sessionResult.data.session;

        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }

        const response = await fetch(`/api/payment/confirm?${params.toString()}`, {
          headers,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Payment confirmation failed");
        }

        const result = await response.json();

        if (result.success) {
          setHasProcessed(true);

          setPaymentDetails({
            daysAdded: result.daysAdded,
            amount: result.amount,
            currency: result.currency,
            productType:
              result.productType === "ADDON" ? "ADDON" : "SUBSCRIPTION",
            imageCredits: result.imageCredits,
            videoAudioCredits: result.videoAudioCredits,
          });

          try {
            localStorage.removeItem("pending_payment");
          } catch {
            // ignore localStorage errors
          }

          try {
            await refreshUser();
          } catch (refreshError) {
            console.warn("⚠️ 刷新用户信息失败，但支付已成功:", refreshError);
          }

          setPaymentStatus("success");
        } else {
          throw new Error(result.error || "Payment confirmation failed");
        }
      } catch (error) {
        console.error("Payment confirmation error:", error);
        setPaymentStatus("error");
        setHasProcessed(true);
      } finally {
        setIsProcessing(false);
      }
    };

    handlePaymentSuccess();
  }, [searchParams, hasProcessed, refreshUser]);

  const handleContinue = () => {
    router.push("/");
  };

  const renderSuccessDescription = () => {
    if (paymentDetails.productType === "ADDON") {
      const imageCredits = paymentDetails.imageCredits || 0;
      const videoAudioCredits = paymentDetails.videoAudioCredits || 0;

      if (imageCredits > 0 || videoAudioCredits > 0) {
        return `加油包已到账：+${imageCredits} 图片额度，+${videoAudioCredits} 视频/音频额度`;
      }

      return "加油包购买成功，额度已更新";
    }

    if (paymentDetails.daysAdded) {
      return `已为您添加 ${paymentDetails.daysAdded} 天高级会员`;
    }

    return "您的会员已激活，感谢您的支持";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {paymentStatus === "processing" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
              <CardTitle className="text-xl">处理支付中...</CardTitle>
              <CardDescription>正在确认您的支付，请稍候</CardDescription>
            </>
          )}

          {paymentStatus === "success" && (
            <>
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <CardTitle className="text-xl text-green-600">支付成功！</CardTitle>
              <CardDescription>{renderSuccessDescription()}</CardDescription>
              {paymentDetails.amount &&
                paymentDetails.amount > 0 &&
                paymentDetails.currency && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    支付金额: {paymentDetails.amount} {paymentDetails.currency}
                  </div>
                )}
            </>
          )}

          {paymentStatus === "error" && (
            <>
              <div className="h-12 w-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-red-600 text-2xl">✕</span>
              </div>
              <CardTitle className="text-xl text-red-600">支付确认失败</CardTitle>
              <CardDescription>请联系客服或稍后重试</CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="text-center">
          {!isProcessing && (
            <Button onClick={handleContinue} className="w-full">
              {paymentStatus === "success" ? "开始使用" : "返回首页"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
              <CardTitle className="text-xl">加载中...</CardTitle>
            </CardHeader>
          </Card>
        </div>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  );
}
