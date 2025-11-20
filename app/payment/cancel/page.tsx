// app/payment/cancel/page.tsx - 支付取消页面
"use client";

import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle, ArrowLeft } from "lucide-react";

export default function PaymentCancelPage() {
  const router = useRouter();

  const handleRetry = () => {
    router.push("/payment");
  };

  const handleGoHome = () => {
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <XCircle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
          <CardTitle className="text-xl text-orange-600">支付已取消</CardTitle>
          <CardDescription>您取消了支付流程，订阅未激活</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground text-center">
            如果这不是您想要的操作，您可以重新开始支付流程
          </div>

          <div className="space-y-2">
            <Button onClick={handleRetry} variant="default" className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              重新选择支付方式
            </Button>

            <Button onClick={handleGoHome} variant="outline" className="w-full">
              返回首页
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
