"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SubscriptionPlans } from "@/components/payment/subscription-plans";
import { PaymentForm } from "@/components/payment/payment-form";
import { BillingHistory } from "@/components/payment/billing-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { RegionType } from "@/lib/architecture-modules/core/types";
import { isChinaRegion } from "@/lib/config/region";
import { useUser } from "@/components/user-context";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import { getAmountByCurrency } from "@/lib/payment-config";

export default function PaymentPage() {
  const { user, loading } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const { language } = useLanguage();
  const t = useTranslations(language);
  const currentPlan = user?.subscription_plan || "free";

  // 获取当前URL的debug参数
  const currentDebugParam =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("debug")
      : null;

  // 辅助函数：构建包含debug参数的URL
  const buildUrl = (path: string) => {
    if (currentDebugParam) {
      return `${path}?debug=${currentDebugParam}`;
    }
    return path;
  };

  // 根据区域配置确定货币
  const getRegionAndCurrency = () => {
    if (isChinaRegion()) {
      return { region: RegionType.CHINA, currency: "CNY" };
    } else {
      return { region: RegionType.USA, currency: "USD" };
    }
  };

  const { region, currency } = getRegionAndCurrency();

  // 货币转换函数（基于当前汇率，大约1 USD = 7.2 CNY）
  const convertPrice = (usdPrice: number, targetCurrency: string) => {
    switch (targetCurrency) {
      case "CNY":
        return Math.round(usdPrice * 7.2 * 100) / 100; // 人民币
      case "USD":
      default:
        return usdPrice; // 美元
    }
  };

  // 当加载状态超过一定时间，提示用户网络缓慢，避免误以为页面卡死
  useEffect(() => {
    if (!loading) return;
    const id = setTimeout(() => {
      toast({
        title: t.common.loading,
        description: t.payment.subtitle,
      });
    }, 10000);
    return () => clearTimeout(id);
  }, [loading, toast, t]);

  // 标记初始加载完成，增加超时保护
  useEffect(() => {
    if (!loading) {
      setInitialLoadComplete(true);
    } else {
      // 如果loading超过30秒，强制标记为完成
      const timeoutId = setTimeout(() => {
        console.warn("Payment页面加载超时，强制完成加载状态");
        setInitialLoadComplete(true);
      }, 30000);
      return () => clearTimeout(timeoutId);
    }
  }, [loading]);

  const [selectedPlan, setSelectedPlan] = useState<{
    planId: string;
    billingCycle: "monthly" | "yearly";
    amount: number;
    currency: string;
    description: string;
  } | null>(null);
  const [paymentResult, setPaymentResult] = useState<any>(null);

  // 处理用户未登录的重定向
  useEffect(() => {
    if (!loading && !user && initialLoadComplete) {
      router.push(buildUrl("/auth"));
    }
  }, [loading, user, initialLoadComplete, router, buildUrl]);

  // 如果正在重定向或用户未登录，显示加载状态
  if (!loading && !user && initialLoadComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 flex items-center justify-center">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-muted-foreground">
                {language === "zh"
                  ? "正在跳转到登录页面..."
                  : "Redirecting to login page..."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 只在首次加载时显示全屏加载状态
  // 后续的 loading 状态不应该重置整个页面
  // 如果 initialLoadComplete 为 true，即使 loading 为 true 也显示页面
  if (loading && !initialLoadComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 flex items-center justify-center">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-muted-foreground">{t.common.loading}</p>
              <p className="text-sm text-muted-foreground mt-2">
                {language === "zh"
                  ? "如果加载时间过长，请刷新页面"
                  : "If loading takes too long, please refresh the page"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSelectPlan = (
    planId: string,
    billingCycle: "monthly" | "yearly"
  ) => {
    // 根据货币类型确定价格（使用统一配置）
    const amount = getAmountByCurrency(currency, billingCycle);

    const description =
      language === "zh"
        ? `专业版 - ${billingCycle === "monthly" ? "月付" : "年付"}`
        : `Pro Plan - ${billingCycle === "monthly" ? "Monthly" : "Yearly"}`;

    setSelectedPlan({
      planId,
      billingCycle,
      amount,
      currency,
      description,
    });
    setPaymentResult(null);
  };

  const handlePaymentSuccess = (result: any) => {
    setPaymentResult(result);

    // 如果有支付URL或微信二维码，处理支付
    if (result.paymentUrl) {
      // 检查是否是微信支付（codeUrl 格式的二维码链接）
      if (
        typeof result.paymentUrl === "string" &&
        (result.paymentUrl.startsWith("weixin://") ||
          result.paymentUrl.includes("weixin://"))
      ) {
        console.log("WeChat Native payment - redirect to QR code page");
        // 微信支付：跳转到专门的二维码页面
        const qrcodeUrl = `/payment/wechat-qrcode?codeUrl=${encodeURIComponent(
          result.paymentUrl
        )}&paymentId=${encodeURIComponent(
          result.paymentId || ""
        )}&amount=${encodeURIComponent(selectedPlan?.amount || "")}`;
        window.location.href = qrcodeUrl;
        return;
      }

      // 检查是否是HTML表单 (支付宝返回的是HTML)
      if (
        typeof result.paymentUrl === "string" &&
        result.paymentUrl.includes("<form")
      ) {
        console.log("Redirecting to Alipay payment page...");

        // 支付宝：跳转到专门的支付重定向页面（绕过CSP限制）
        // 将表单HTML进行base64编码后作为URL参数传递
        const encodedForm = btoa(result.paymentUrl);
        const redirectUrl = `/payment/redirect?form=${encodeURIComponent(
          encodedForm
        )}`;

        console.log("Redirect URL created");
        window.location.href = redirectUrl;
      } else {
        // 其他支付方式返回的是URL，直接跳转
        console.log("Redirecting to payment URL:", result.paymentUrl);
        window.location.href = result.paymentUrl;
      }
    }
  };

  const handlePaymentError = (error: string) => {
    console.error("Payment error:", error);
    toast({
      title: t.payment.messages.failed,
      description: error,
      variant: "destructive",
    });
  };

  const handleBack = () => {
    if (selectedPlan) {
      setSelectedPlan(null);
    } else {
      router.back();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* 头部导航 */}
        <div className="mb-6">
          <Button variant="ghost" onClick={handleBack} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t.common.back}
          </Button>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold">
            {t.payment.manage}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-2">
            {t.payment.subtitle}
          </p>
        </div>

        {/* 支付成功提示 */}
        {paymentResult && (
          <Card className="mb-6 border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <div>
                  <h3 className="font-medium text-green-800">
                    {language === "zh"
                      ? "支付创建成功"
                      : "Payment Created Successfully"}
                  </h3>
                  <p className="text-sm text-green-600 mt-1">
                    {language === "zh"
                      ? "请按照提示完成支付流程"
                      : "Please follow the instructions to complete the payment"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="plans" className="space-y-4 sm:space-y-6">
          <TabsList className="grid w-full grid-cols-3 gap-1 sm:gap-0">
            <TabsTrigger value="plans" className="text-xs sm:text-sm">
              {t.payment.title}
            </TabsTrigger>
            <TabsTrigger value="payment" className="text-xs sm:text-sm">
              {language === "zh" ? "支付" : "Payment"}
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs sm:text-sm">
              {t.payment.billing}
            </TabsTrigger>
          </TabsList>

          {/* 订阅计划 */}
          <TabsContent value="plans">
            <SubscriptionPlans
              onSelectPlan={handleSelectPlan}
              currentPlan={currentPlan}
              currency={currency}
              convertPrice={convertPrice}
            />
          </TabsContent>

          {/* 支付表单 */}
          <TabsContent value="payment">
            {selectedPlan ? (
              <div className="max-w-2xl mx-auto">
                <PaymentForm
                  planId={selectedPlan.planId}
                  billingCycle={selectedPlan.billingCycle}
                  amount={selectedPlan.amount}
                  currency={selectedPlan.currency}
                  description={selectedPlan.description}
                  userId={user?.id || ""}
                  region={region}
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                />
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">
                      {language === "zh"
                        ? "请先选择一个订阅计划"
                        : "Please select a subscription plan first"}
                    </p>
                    <Button
                      onClick={() => {
                        const plansTab = document.querySelector(
                          '[value="plans"]'
                        ) as HTMLElement;
                        plansTab?.click();
                      }}
                    >
                      {t.payment.choosePlan}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* 账单历史 */}
          <TabsContent value="history">
            <BillingHistory userId={user?.id || ""} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
