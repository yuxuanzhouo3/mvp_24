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

    // 防止重复点击
    if (isProcessing) {
      console.warn("Payment already in progress, ignoring duplicate click");
      return;
    }

    // 生成幂等性键（基于用户、计划、金额和时间戳）
    const idempotencyKey = `${userId}-${planId}-${billingCycle}-${amount}-${Date.now()}`;

    // 检查是否已有相同的支付请求正在处理
    if (paymentRequestRef.current === idempotencyKey) {
      console.warn(
        "Duplicate payment request with same idempotency key, ignoring"
      );
      return;
    }

    // 如果有正在进行的请求，先取消它
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    paymentRequestRef.current = idempotencyKey;
    setIsProcessing(true);

    try {
      // 存储支付信息到本地存储，用于后续确认
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
            idempotencyKey,
          })
        );
      } catch (e) {
        // 忽略本地存储写入错误，不影响支付流程
        console.warn("pending_payment localStorage write failed", e);
      }

      // 调用服务端API来创建支付
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const TIMEOUT_MS = 20000; // 20s 超时，避免无限加载
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      console.time("create-payment");
      // Attach authorization header if session exists
      const sessionResult = await getAuthClient().getSession();
      const token = sessionResult.data.session?.access_token;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      // 🔄 修改为一次性支付API
      const response = await fetch("/api/payment/onetime/create", {
        method: "POST",
        headers,
        body: JSON.stringify({
          method: selectedMethod,
          billingCycle, // 一次性支付只需要这两个参数
          // 以下参数不再需要(由后端根据billingCycle自动确定)
          // amount,
          // currency,
          // description,
          // userId,
          // planType: planId,
          // region,
          // idempotencyKey,
        }),
        signal: controller.signal,
      });
      console.timeEnd("create-payment");
      clearTimeout(timeoutId);
      abortControllerRef.current = null;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // 处理特定的错误代码
        if (errorData.code === "DUPLICATE_SUBSCRIPTION") {
          throw new Error(t.payment.messages.failed);
        }

        // 处理重复支付请求
        if (errorData.code === "DUPLICATE_PAYMENT_REQUEST") {
          throw new Error(
            language === "zh"
              ? "检测到重复支付请求，请勿重复点击"
              : "Duplicate payment detected, please don't click multiple times"
          );
        }

        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        onSuccess(result);
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
      // 清理幂等性键（延迟清理，确保快速重复点击被阻止）
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
        {/* 当前订阅状态 */}
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

        {/* 订单摘要 */}
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

        {/* 支付方式选择 */}
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

        {/* 支付按钮 */}
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

        {/* 安全提示 */}
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
