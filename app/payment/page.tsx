"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SubscriptionPlans } from "@/components/payment/subscription-plans";
import { AddonPackages } from "@/components/payment/addon-packages";
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
import { getPlanById, getPlanPrice } from "@/constants/pricing";
import { detectPlatform } from "@/lib/platform-detection";
import { getAppleIapProductId } from "@/lib/apple-iap";
import { getAddonPackageById, type ProductType } from "@/constants/addon-packages";
import { useAppleIAPStatus } from "@/hooks/use-apple-iap-status";
import { isAppleIAPEnabled } from "@/lib/config/apple-iap";

type SelectedPurchase = {
  planId: string;
  billingCycle: "monthly" | "yearly";
  amount: number;
  currency: string;
  description: string;
  productType: ProductType;
  addonPackageId?: string;
  imageCredits?: number;
  videoAudioCredits?: number;
};

type PaymentProductCatalog = {
  currency: string;
  subscriptions: Record<string, { monthly: number; yearly: number }>;
  addons: Record<string, { amount: number; imageCredits: number; videoAudioCredits: number }>;
};

const encodeUtf8ToBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

export default function PaymentPage() {
  const { user, loading } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const { language } = useLanguage();
  const t = useTranslations(language);
  const currentPlan = user?.subscription_plan || "free";
  const iapFeatureEnabled = isAppleIAPEnabled();
  const { status: appleIapStatus } = useAppleIAPStatus(iapFeatureEnabled && !!user);
  const effectiveMembershipExpiresAt =
    appleIapStatus?.success
      ? appleIapStatus.expiresAt
      : (user as any)?.membership_expires_at ||
        (user as any)?.subscription_expires_at ||
        null;
  const membershipExpiryDate = effectiveMembershipExpiresAt
    ? new Date(effectiveMembershipExpiresAt)
    : null;
  const hasValidMembershipExpiry =
    !!membershipExpiryDate && Number.isFinite(membershipExpiryDate.getTime());
  const isMembershipExpired =
    hasValidMembershipExpiry && membershipExpiryDate <= new Date();
  const hasActiveSubscription = (() => {
    if (appleIapStatus?.success) {
      return !appleIapStatus.isExpired;
    }

    if (typeof (user as any)?.hasActiveSubscription === "boolean") {
      return !!(user as any)?.hasActiveSubscription && !isMembershipExpired;
    }

    const expires = effectiveMembershipExpiresAt;
    if (!expires) return false;
    try {
      return new Date(expires) > new Date();
    } catch {
      return false;
    }
  })();

  // 获取当前URL的debug参数
  const currentDebugParam =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("debug")
      : null;

  // 辅助函数：构建包含debug参数的URL
  const buildUrl = useCallback((path: string) => {
    if (currentDebugParam) {
      return `${path}?debug=${currentDebugParam}`;
    }
    return path;
  }, [currentDebugParam]);

  // 根据区域配置确定货币
  const getRegionAndCurrency = () => {
    if (isChinaRegion()) {
      return { region: RegionType.CHINA, currency: "CNY" };
    } else {
      return { region: RegionType.USA, currency: "USD" };
    }
  };

  const { region, currency } = getRegionAndCurrency();

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

  const [selectedPlan, setSelectedPlan] = useState<SelectedPurchase | null>(null);
  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("plans");
  const [isIOSNativeApp, setIsIOSNativeApp] = useState(false);
  const [isIapProcessing, setIsIapProcessing] = useState(false);
  const [productCatalog, setProductCatalog] = useState<PaymentProductCatalog | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const platformInfo = detectPlatform();
    const w = window as any;
    const ua = (navigator.userAgent || "").toLowerCase();
    const hasGoNativeFlag = !!(w?.median || w?.gonative || ua.includes("median") || ua.includes("gonative"));
    setIsIOSNativeApp(platformInfo.type === "ios-app" && hasGoNativeFlag);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadProductCatalog = async () => {
      try {
        const res = await fetch("/api/payment/products", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!cancelled && res.ok && json?.success && json?.data) {
          setProductCatalog(json.data);
        }
      } catch (error) {
        console.error("Failed to load payment products:", error);
      }
    };

    loadProductCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

  // 支付宝（含手机网页/H5 + 套壳 WebView）：
  // - 有些场景不会自动回跳到 return_url（用户未点“返回商户”），导致 confirm 不会触发。
  // - 因此当页面重新获得焦点（从支付宝 App 切回）时，轮询支付状态并跳转到 success 触发确认/延期。
  useEffect(() => {
    if (typeof window === "undefined") return;

    let stopped = false;
    let timer: any = null;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      });

    const poll = async (paymentId: string) => {
      const start = Date.now();
      const TIMEOUT_MS = 120000;
      const INTERVAL_MS = 2000;

      while (!stopped && Date.now() - start < TIMEOUT_MS) {
        try {
          const res = await fetch(
            `/api/payment/status?paymentId=${encodeURIComponent(paymentId)}`
          );
          if (res.ok) {
            const data = await res.json();
            if (data?.status === "completed") {
              try {
                localStorage.removeItem("pending_payment");
              } catch {
                // ignore
              }
              router.push(
                `/payment/success?out_trade_no=${encodeURIComponent(paymentId)}`
              );
              return;
            }
          }
        } catch {
          // ignore and retry
        }
        await sleep(INTERVAL_MS);
      }
    };

    const maybeResume = () => {
      try {
        const raw = localStorage.getItem("pending_payment");
        if (!raw) return;
        const pending = JSON.parse(raw);
        if (
          pending?.paymentMethod === "alipay" &&
          typeof pending?.paymentId === "string" &&
          pending.paymentId
        ) {
          setActiveTab("payment");
          poll(pending.paymentId);
        }
      } catch {
        // ignore
      }
    };

    // 立即尝试一次，并在页面重新获得焦点时再尝试（从支付宝切回）
    maybeResume();
    window.addEventListener("focus", maybeResume);

    return () => {
      stopped = true;
      window.removeEventListener("focus", maybeResume);
      if (timer) clearTimeout(timer);
    };
  }, [router]);

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

  const displayCurrency = productCatalog?.currency || currency;
  const subscriptionPriceOverrides = productCatalog?.subscriptions || {};
  const addonPriceOverrides = Object.fromEntries(
    Object.entries(productCatalog?.addons || {}).map(([key, value]) => [key, value.amount])
  ) as Record<string, number>;
  const addonCreditsOverrides = Object.fromEntries(
    Object.entries(productCatalog?.addons || {}).map(([key, value]) => [
      key,
      {
        imageCredits: Math.max(0, Math.floor(Number(value?.imageCredits || 0))),
        videoAudioCredits: Math.max(0, Math.floor(Number(value?.videoAudioCredits || 0))),
      },
    ])
  ) as Record<string, { imageCredits: number; videoAudioCredits: number }>;

  const getSubscriptionAmount = (
    planId: string,
    billingCycle: "monthly" | "yearly"
  ) => {
    const override = subscriptionPriceOverrides[planId.toLowerCase()];
    const overrideAmount =
      billingCycle === "monthly" ? override?.monthly : override?.yearly;

    if (typeof overrideAmount === "number" && Number.isFinite(overrideAmount)) {
      return overrideAmount;
    }

    return getPlanPrice(
      planId,
      billingCycle === "yearly" ? "annual" : "monthly",
      displayCurrency === "CNY"
    );
  };

  const getAddonAmount = (packageId: string) => {
    const overrideAmount = addonPriceOverrides[packageId];
    if (typeof overrideAmount === "number" && Number.isFinite(overrideAmount)) {
      return overrideAmount;
    }

    const addonPkg = getAddonPackageById(packageId);
    if (!addonPkg) return 0;
    return displayCurrency === "CNY" ? addonPkg.priceZh : addonPkg.price;
  };

  const handleSelectPlan = (
    planId: string,
    billingCycle: "monthly" | "yearly"
  ) => {
    const plan = getPlanById(planId);
    const amount = getSubscriptionAmount(planId, billingCycle);
    const planName =
      language === "zh"
        ? plan?.nameZh || plan?.name || planId
        : plan?.name || plan?.nameZh || planId;
    const description =
      language === "zh"
        ? `${planName} - ${billingCycle === "monthly" ? "月付" : "年付"}`
        : `${planName} - ${billingCycle === "monthly" ? "Monthly" : "Yearly"}`;

    setSelectedPlan({
      planId,
      billingCycle,
      amount,
      currency: displayCurrency,
      description,
      productType: "SUBSCRIPTION",
    });
    setPaymentResult(null);
    setActiveTab("payment");
  };

  const handleSelectAddon = (packageId: string) => {
    const addonPkg = getAddonPackageById(packageId);
    if (!addonPkg) {
      toast({
        title: t.payment.messages.failed,
        description: language === "zh" ? "无效的加油包" : "Invalid addon package",
        variant: "destructive",
      });
      return;
    }

    const resolvedCredits = addonCreditsOverrides[addonPkg.id];
    const imageCredits =
      typeof resolvedCredits?.imageCredits === "number"
        ? resolvedCredits.imageCredits
        : addonPkg.imageCredits;
    const videoAudioCredits =
      typeof resolvedCredits?.videoAudioCredits === "number"
        ? resolvedCredits.videoAudioCredits
        : addonPkg.videoAudioCredits;
    const description =
      language === "zh"
        ? `${addonPkg.nameZh} - ${imageCredits}张图 + ${videoAudioCredits}个视频/音频`
        : `${addonPkg.name} - ${imageCredits} images + ${videoAudioCredits} video/audio`;
    const amount = getAddonAmount(addonPkg.id);

    setSelectedPlan({
      planId: addonPkg.id,
      billingCycle: "monthly",
      amount,
      currency: displayCurrency,
      description,
      productType: "ADDON",
      addonPackageId: addonPkg.id,
      imageCredits,
      videoAudioCredits,
    });
    setPaymentResult(null);
    setActiveTab("payment");
  };

  const handlePaymentSuccess = (result: any) => {
    setPaymentResult(result);

    const isGoNativeShell = () => {
      if (typeof window === "undefined") return false;
      const w = window as any;
      if (w?.median || w?.gonative) return true;
      const ua = (navigator.userAgent || "").toLowerCase();
      return ua.includes("gonative") || ua.includes("median");
    };

    // ✅ 支付宝 App 通道：服务端返回 orderString，直接唤起支付宝 App（避免 WebView 表单/新窗口导致“双弹”）
    if (
      result?._paymentMethod === "alipay" &&
      typeof result.orderString === "string" &&
      typeof result.paymentId === "string"
    ) {
      // 先进入成功页（用于拉起支付宝 + 轮询确认 webhook），避免“支付后没反应”
      try {
        sessionStorage.setItem(
          `alipay:orderString:${result.paymentId}`,
          result.orderString
        );
      } catch {
        // ignore
      }

      window.location.href = `/payment/success?out_trade_no=${encodeURIComponent(
        result.paymentId
      )}`;
      return;
    }

    // ✅ 微信 App 通道：服务端返回 appPayParams，通过自定义 scheme 拉起原生微信支付
    if (
      result?._paymentMethod === "wechat" &&
      isGoNativeShell() &&
      result?.appPayParams &&
      typeof result?.paymentId === "string" &&
      result.paymentId
    ) {
      const callbackName = "__wechatNativePayCallback";

      (window as any)[callbackName] = (payload: any) => {
        try {
          if (!payload || typeof payload !== "object") {
            throw new Error("微信支付失败：无效回调");
          }

          // errCode: 0=成功，-1=错误，-2=取消
          if (payload.errCode !== 0) {
            const msg = payload.errStr || "微信支付已取消或失败";
            toast({
              title: t.payment.messages.failed,
              description: String(msg),
              variant: "destructive",
            });
            return;
          }

          const outTradeNo =
            typeof payload.outTradeNo === "string" && payload.outTradeNo
              ? payload.outTradeNo
              : result.paymentId;

          // 跳转到成功页，由 success 页面统一调用 /api/payment/confirm（主路径）
          window.location.href = `/payment/success?wechat_out_trade_no=${encodeURIComponent(
            outTradeNo
          )}`;
        } catch (e: any) {
          toast({
            title: t.payment.messages.failed,
            description: e?.message || "微信支付失败",
            variant: "destructive",
          });
        }
      };

      // payload 里既包含 appPayParams，也带上 outTradeNo 便于原生回传
      const schemePayload = {
        outTradeNo: result.paymentId,
        appPayParams: result.appPayParams,
      };
      const encoded = encodeUtf8ToBase64(JSON.stringify(schemePayload));
      const scheme = `wechat-pay://start?callback=${encodeURIComponent(
        callbackName
      )}&payload=${encodeURIComponent(encoded)}`;
      window.location.href = scheme;
      return;
    }

    // 如果有支付URL或微信二维码，处理支付
    if (result.paymentUrl) {
      // 检查是否是微信支付（codeUrl 格式的二维码链接）
      if (
        typeof result.paymentUrl === "string" &&
        (result.paymentUrl.startsWith("weixin://") ||
          result.paymentUrl.includes("weixin://"))
      ) {
        console.log("WeChat Native payment - redirect to QR code page");
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

        const encodedForm = encodeUtf8ToBase64(result.paymentUrl);
        const redirectUrl = `/payment/redirect?form=${encodeURIComponent(
          encodedForm
        )}`;

        console.log("Redirect URL created");
        window.location.href = redirectUrl;
      } else {
        console.log("Redirecting to payment URL:", result.paymentUrl);
        window.location.href = result.paymentUrl;
      }
    }
  };

  const triggerAppleIap = async () => {
    if (!selectedPlan) {
      toast({
        title: t.payment.messages.failed,
        description:
          language === "zh"
            ? "请先选择订阅计划"
            : "Please select a subscription plan first",
        variant: "destructive",
      });
      return;
    }

    const productId = getAppleIapProductId(
      selectedPlan.planId,
      selectedPlan.billingCycle
    );

    if (!productId) {
      toast({
        title: t.payment.messages.failed,
        description:
          language === "zh"
            ? "未找到对应的苹果内购产品"
            : "Apple IAP product not found",
        variant: "destructive",
      });
      return;
    }

    if (typeof window === "undefined") return;

    const callbackName = `__appleIapCallback_${Date.now()}`;
    setIsIapProcessing(true);

    (window as any)[callbackName] = (payload: any) => {
      try {
        if (!payload || payload.status !== "success") {
          console.error("Apple IAP callback (fail)", payload);

          const msg = payload?.message || (language === "zh" ? "支付失败" : "Payment failed");

          const debugParts: string[] = [];
          if (payload?.bundleId) debugParts.push(`bundleId=${payload.bundleId}`);
          if (Array.isArray(payload?.invalidProductIdentifiers) && payload.invalidProductIdentifiers.length > 0) {
            debugParts.push(`invalidIds=${payload.invalidProductIdentifiers.join(",")}`);
          }
          if (typeof payload?.storekit2ProductsCount === "number") {
            debugParts.push(`sk2Count=${payload.storekit2ProductsCount}`);
          }
          if (typeof payload?.storekit1ProductsCount === "number") {
            debugParts.push(`sk1Count=${payload.storekit1ProductsCount}`);
          }

          const debugSuffix = debugParts.length > 0 ? `\n(${debugParts.join(" ")})` : "";

          toast({
            title: t.payment.messages.failed,
            description: String(msg) + debugSuffix,
            variant: "destructive",
          });
          return;
        }

        const transactionId = payload?.transactionId || payload?.transaction_id;
        if (!transactionId) {
          toast({
            title: t.payment.messages.failed,
            description: language === "zh" ? "缺少交易号" : "Missing transaction id",
            variant: "destructive",
          });
          return;
        }

        const query = new URLSearchParams({
          iap: "1",
          iap_transaction_id: String(transactionId),
          iap_product_id: productId,
          iap_plan_id: selectedPlan.planId,
          iap_billing_cycle: selectedPlan.billingCycle,
        });

        window.location.href = `/payment/success?${query.toString()}`;
      } finally {
        setIsIapProcessing(false);
        try {
          delete (window as any)[callbackName];
        } catch {
          // ignore
        }
      }
    };

    const payload = {
      productId,
      planId: selectedPlan.planId,
      billingCycle: selectedPlan.billingCycle,
      userId: user?.id || "",
      callback: callbackName,
    };

    try {
      const message = {
        medianCommand: "median://iap/purchase",
        data: payload,
      };

      const handler = (window as any)?.webkit?.messageHandlers?.JSBridge;
      if (handler?.postMessage) {
        handler.postMessage(message);
      } else {
        const encoded = encodeUtf8ToBase64(JSON.stringify(payload));
        const scheme = `median://iap/purchase?payload=${encodeURIComponent(
          encoded
        )}&callback=${encodeURIComponent(callbackName)}`;
        window.location.href = scheme;
      }
    } catch (e: any) {
      setIsIapProcessing(false);
      toast({
        title: t.payment.messages.failed,
        description: e?.message || "Failed to launch Apple IAP",
        variant: "destructive",
      });
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
          <TabsList className="grid w-full grid-cols-4 gap-1 sm:gap-0">
            <TabsTrigger value="plans" className="text-xs sm:text-sm">
              {t.payment.title}
            </TabsTrigger>
            <TabsTrigger value="addons" className="text-xs sm:text-sm">
              {language === "zh" ? "加油包" : "Add-ons"}
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
              currency={displayCurrency}
              priceOverrides={subscriptionPriceOverrides}
              onSwitchToPayment={() => setActiveTab("payment")}
              membershipExpiresAt={effectiveMembershipExpiresAt}
            />
          </TabsContent>

          {/* 加油包 */}
          <TabsContent value="addons">
            <AddonPackages
              onSelectPackage={handleSelectAddon}
              currency={displayCurrency}
              priceOverrides={addonPriceOverrides}
              creditsOverrides={addonCreditsOverrides}
            />
          </TabsContent>

          {/* 支付表单 */}
          <TabsContent value="payment">
            {selectedPlan ? (
              <div className="max-w-2xl mx-auto">
                {iapFeatureEnabled && isIOSNativeApp && selectedPlan.productType !== "ADDON" ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {language === "zh" ? "苹果内购" : "Apple In-App Purchase"}
                      </CardTitle>
                      <CardDescription>
                        {language === "zh"
                          ? "在 iOS 套壳应用内将使用原生订阅支付"
                          : "Use native Apple IAP in the iOS shell app"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                        <div className="flex flex-col gap-1">
                          <span>
                            {language === "zh" ? "计划" : "Plan"}: {selectedPlan.planId}
                          </span>
                          <span>
                            {language === "zh" ? "周期" : "Billing"}: {selectedPlan.billingCycle === "monthly" ? (language === "zh" ? "月付" : "Monthly") : (language === "zh" ? "年付" : "Yearly")}
                          </span>
                        </div>
                      </div>
                      <Button
                        className="w-full"
                        onClick={triggerAppleIap}
                        disabled={isIapProcessing || hasActiveSubscription}
                      >
                        {isIapProcessing
                          ? language === "zh"
                            ? "正在唤起内购..."
                            : "Launching IAP..."
                          : language === "zh"
                            ? "使用 Apple 内购支付"
                            : "Pay with Apple IAP"}
                      </Button>
                      {hasActiveSubscription && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {language === "zh"
                            ? "检测到您已有未到期订阅，Apple 内购不可用；请在网页版进行续费。"
                            : "An active subscription was detected — Apple IAP is disabled. Please renew on web."}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <PaymentForm
                    planId={selectedPlan.planId}
                    billingCycle={selectedPlan.billingCycle}
                    amount={selectedPlan.amount}
                    currency={selectedPlan.currency}
                    description={selectedPlan.description}
                    userId={user?.id || ""}
                    region={region}
                    productType={selectedPlan.productType}
                    addonPackageId={selectedPlan.addonPackageId}
                    imageCredits={selectedPlan.imageCredits}
                    videoAudioCredits={selectedPlan.videoAudioCredits}
                    onSuccess={handlePaymentSuccess}
                    onError={handlePaymentError}
                  />
                )}
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">
                      {language === "zh"
                        ? "请先选择一个订阅计划或加油包"
                        : "Please select a subscription plan or addon package first"}
                    </p>
                    <Button onClick={() => setActiveTab("plans")}>
                      {language === "zh" ? "去选择" : "Choose Product"}
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
