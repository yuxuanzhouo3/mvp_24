"use client";

import { useState, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CreditCard, Smartphone, Loader2, AlertCircle } from "lucide-react";
import { paymentRouter } from "@/lib/architecture-modules/layers/third-party/payment/router";
import { getAuthClient } from "@/lib/auth/client";
import { tokenManager } from "@/lib/frontend-token-manager";
import { RegionType } from "@/lib/architecture-modules/core/types";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";

interface PaymentFormProps {
  planId: string;
  billingCycle: "monthly" | "yearly";
  amount: number;
  currency: string;
  description: string;
  userId: string;
  region: RegionType;
  productType?: "SUBSCRIPTION" | "ADDON" | "ONETIME";
  addonPackageId?: string;
  imageCredits?: number;
  videoAudioCredits?: number;
  onSuccess: (result: any) => void;
  onError: (error: string) => void;
  currentSubscription?: {
    planId: string;
    status: string;
  };
}

export function PaymentForm({
  planId,
  billingCycle,
  amount,
  currency,
  description,
  userId,
  region,
  productType = "SUBSCRIPTION",
  addonPackageId,
  imageCredits,
  videoAudioCredits,
  onSuccess,
  onError,
  currentSubscription,
}: PaymentFormProps) {
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const { language } = useLanguage();
  const t = useTranslations(language);

  // 使用 ref 跟踪支付请求，防止重复提交
  const paymentRequestRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 获取可用的支付方式
  const availableMethods = paymentRouter.getAvailableMethods(region);

  const isGoNativeShell = () => {
    if (typeof window === "undefined") return false;
    const w = window as any;
    if (w?.median || w?.gonative) return true;
    const ua = (navigator.userAgent || "").toLowerCase();
    return ua.includes("gonative") || ua.includes("median");
  };

  const paymentMethods = {
    stripe: {
      name: t.payment.methods.stripe.name,
      icon: <CreditCard className="h-5 w-5" />,
      description: t.payment.methods.stripe.description,
    },
    wechat: {
      name: t.payment.methods.wechat.name,
      icon: <Smartphone className="h-5 w-5" />,
      description: t.payment.methods.wechat.description,
    },
    alipay: {
      name: t.payment.methods.alipay.name,
      icon: <Smartphone className="h-5 w-5" />,
      description: t.payment.methods.alipay.description,
    },
    paypal: {
      name: t.payment.methods.paypal.name,
      icon: <CreditCard className="h-5 w-5" />,
      description: t.payment.methods.paypal.description,
    },
  };

  const handlePayment = async () => {
    if (!selectedMethod) {
      onError(t.payment.selectPaymentMethod);
      return;
    }

    if (isProcessing) {
      console.warn("Payment already in progress, ignoring duplicate click");
      return;
    }

    const idempotencyKey = `${userId}-${productType}-${planId}-${addonPackageId || ""}-${billingCycle}-${amount}-${Date.now()}`;

    if (paymentRequestRef.current === idempotencyKey) {
      console.warn(
        "Duplicate payment request with same idempotency key, ignoring"
      );
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    paymentRequestRef.current = idempotencyKey;
    setIsProcessing(true);

    try {
      try {
        localStorage.setItem(
          "pending_payment",
          JSON.stringify({
            planType: planId,
            billingCycle,
            userId,
            amount,
            currency,
            description,
            productType,
            addonPackageId,
            imageCredits,
            videoAudioCredits,
            idempotencyKey,
          })
        );
      } catch (e) {
        console.warn("pending_payment localStorage write failed", e);
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const TIMEOUT_MS = 20000;
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      console.time("create-payment");

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      const authHeaders = await tokenManager.getAuthHeaderAsync();
      if (authHeaders?.Authorization) {
        headers["Authorization"] = authHeaders.Authorization;
      } else {
        const sessionResult = await getAuthClient().getSession();
        const rawToken = sessionResult.data.session?.access_token;
        const token =
          rawToken &&
          rawToken !== "cached-session" &&
          rawToken !== "cloudbase-session"
            ? rawToken
            : null;

        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
      }

      if (!headers["Authorization"]) {
        throw new Error(
          language === "zh"
            ? "登录状态已过期，请重新登录后支付"
            : "Authentication expired. Please sign in again before payment"
        );
      }

      const response = await fetch("/api/payment/create", {
        method: "POST",
        headers,
        body: JSON.stringify({
          method: selectedMethod,
          ...(selectedMethod === "wechat" && isGoNativeShell()
            ? { channel: "app" }
            : {}),
          productType,
          planId,
          billingCycle,
          addonPackageId,
          imageCredits,
          videoAudioCredits,
        }),
        signal: controller.signal,
      });

      console.timeEnd("create-payment");
      clearTimeout(timeoutId);
      abortControllerRef.current = null;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (errorData.code === "DUPLICATE_SUBSCRIPTION") {
          throw new Error(t.payment.messages.failed);
        }

        if (errorData.code === "DUPLICATE_PAYMENT_REQUEST") {
          throw new Error(
            language === "zh"
              ? "检测到重复支付请求，请勿重复点击"
              : "Duplicate payment detected, please don't click multiple times"
          );
        }

        if (errorData.code === "PRO_PLAN_RENEWAL_ONLY") {
          throw new Error(
            errorData.error ||
              (language === "zh"
                ? "当前已是专业版订阅，仅支持续费专业版。加油包可正常叠加购买。"
                : "You already have Pro. Only Pro renewal is allowed. Add-ons can still stack.")
          );
        }

        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        try {
          const raw = localStorage.getItem("pending_payment");
          const existing = raw ? JSON.parse(raw) : {};
          localStorage.setItem(
            "pending_payment",
            JSON.stringify({
              ...existing,
              paymentId: result.paymentId,
              paymentMethod: selectedMethod,
              channel:
                selectedMethod === "wechat" && isGoNativeShell()
                  ? "app"
                  : existing?.channel,
              updatedAt: Date.now(),
            })
          );
        } catch {
          // ignore localStorage errors
        }
        onSuccess({ ...result, _paymentMethod: selectedMethod });
      } else {
        const msg = result.error || t.payment.messages.failed;
        onError(msg);
        toast({
          title: t.payment.messages.failed,
          description: String(msg),
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Payment error:", error);
      const isAbort = (error as any)?.name === "AbortError";
      const errorMessage = isAbort
        ? language === "zh"
          ? "请求超时，请稍后重试"
          : "Request timed out. Please try again."
        : error instanceof Error
        ? error.message
        : "Unknown error";
      onError(`${t.payment.messages.failed}: ${errorMessage}`);
      toast({
        title: t.payment.messages.failed,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setTimeout(() => {
        paymentRequestRef.current = null;
      }, 3000);
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  if (availableMethods.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            {t.payment.onlineUnavailable}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          {t.payment.selectPaymentMethod}
        </CardTitle>
        <CardDescription>{t.payment.subtitle}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {currentSubscription && currentSubscription.status === "active" && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">
                {t.payment.currentPlan}: {currentSubscription.planId}
              </span>
            </div>
            <p className="text-sm text-blue-600 mt-1">
              {language === "zh"
                ? "此购买将替换您当前的订阅计划"
                : "This purchase will replace your current subscription"}
            </p>
          </div>
        )}

        <div className="bg-muted/50 p-4 rounded-lg">
          <h3 className="font-medium mb-2">{t.payment.orderSummary}</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>{description}</span>
              <span>{formatAmount(amount, currency)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-medium">
              <span>{t.payment.total}</span>
              <span>{formatAmount(amount, currency)}</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-medium">
            {t.payment.methods ? "Payment Methods" : "Payment Methods"}
          </h3>
          <div className="grid gap-3">
            {availableMethods.map((method) => {
              const methodInfo =
                paymentMethods[method as keyof typeof paymentMethods];
              if (!methodInfo) return null;

              return (
                <div
                  key={method}
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedMethod === method
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  } ${isProcessing ? "cursor-not-allowed opacity-50" : ""}`}
                  onClick={() => !isProcessing && setSelectedMethod(method)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {methodInfo.icon}
                      <div>
                        <div className="font-medium">{methodInfo.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {methodInfo.description}
                        </div>
                      </div>
                    </div>
                    {selectedMethod === method && (
                      <Badge variant="default">
                        {language === "zh" ? "已选择" : "Selected"}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Button
          className="w-full"
          size="lg"
          onClick={handlePayment}
          disabled={!selectedMethod || isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {language === "zh" ? "处理中..." : "Processing..."}
            </>
          ) : (
            <>
              {t.payment.payNow} {formatAmount(amount, currency)}
            </>
          )}
        </Button>

        <div className="text-center text-sm text-muted-foreground">
          <div className="flex items-center justify-center gap-1">
            <CreditCard className="h-4 w-4" />
            {language === "zh"
              ? "您的支付信息由支付提供商安全处理"
              : "Your payment information is securely processed by payment providers"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
