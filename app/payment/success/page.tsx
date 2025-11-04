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

function PaymentSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isProcessing, setIsProcessing] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState<
    "processing" | "success" | "error"
  >("processing");
  const [paymentDetails, setPaymentDetails] = useState<{
    daysAdded?: number;
    amount?: number;
    currency?: string;
  }>({});

  useEffect(() => {
    const handlePaymentSuccess = async () => {
      try {
        // 🔄 一次性支付使用不同的参数
        const sessionId = searchParams.get("session_id"); // Stripe
        const token = searchParams.get("token"); // PayPal

        console.log("Payment success callback:", {
          sessionId,
          token,
        });

        // 一次性支付:两个参数至少要有一个
        if (!sessionId && !token) {
          throw new Error("Missing payment confirmation parameters");
        }

        // 🔄 调用一次性支付确认API (需要带认证token)
        const params = new URLSearchParams();
        if (sessionId) params.set("session_id", sessionId);
        if (token) params.set("token", token);

        // 获取认证 token
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }

        const response = await fetch(
          `/api/payment/onetime/confirm?${params.toString()}`,
          { headers }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Payment confirmation failed");
        }

        const result = await response.json();

        if (result.success) {
          console.log("Payment confirmed:", result);
          // 保存支付详情
          setPaymentDetails({
            daysAdded: result.daysAdded,
            amount: result.amount,
            currency: result.currency,
          });
          // 清除本地存储的支付信息(如果有)
          try {
            localStorage.removeItem("pending_payment");
          } catch (e) {
            // 忽略localStorage错误
          }
          setPaymentStatus("success");
        } else {
          throw new Error(result.error || "Payment confirmation failed");
        }
      } catch (error) {
        console.error("Payment confirmation error:", error);
        setPaymentStatus("error");
      } finally {
        setIsProcessing(false);
      }
    };

    handlePaymentSuccess();
  }, [searchParams]);

  const handleContinue = () => {
    router.push("/"); // 或者跳转到用户仪表板
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
              <CardTitle className="text-xl text-green-600">
                支付成功！
              </CardTitle>
              <CardDescription>
                {paymentDetails.daysAdded
                  ? `已为您添加 ${paymentDetails.daysAdded} 天高级会员`
                  : "您的会员已激活，感谢您的支持"}
              </CardDescription>
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
              <CardTitle className="text-xl text-red-600">
                支付确认失败
              </CardTitle>
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
