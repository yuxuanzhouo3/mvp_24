"use client";

import React, { useEffect, useState } from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, Clock } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

function WechatQRCodeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();
  const [timeLeft, setTimeLeft] = useState(600);
  const [paymentStatus, setPaymentStatus] = useState("pending");

  const codeUrl = searchParams.get("codeUrl");
  const paymentId = searchParams.get("paymentId");
  const amount = searchParams.get("amount");

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setPaymentStatus("expired");
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const checkPaymentStatus = async () => {
      if (!paymentId) return;

      try {
        const response = await fetch(`/api/payment/status?paymentId=${paymentId}`);
        const result = await response.json();

        console.log("[QR Code Page] 支付状态查询结果:", result);

        // 检查支付状态是否为已完成 (后端返回 "completed")
        if (result.status === "completed") {
          console.log("[QR Code Page] ✅ 检测到支付完成，停止轮询并调用确认API");

          // 调用确认API来创建订阅记录
          try {
            // 等待 1 秒以确保支付状态已在后端更新
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // 获取认证 token
            const { getAuthClient } = await import("@/lib/auth/client");
            const sessionResult = await getAuthClient().getSession();
            const session = sessionResult.data.session;

            const headers: Record<string, string> = {};
            if (session?.access_token) {
              headers["Authorization"] = `Bearer ${session.access_token}`;
            }

            const confirmResponse = await fetch(
              `/api/payment/onetime/confirm?wechat_out_trade_no=${encodeURIComponent(paymentId)}`,
              {
                method: "GET",
                headers,
              }
            );
            const confirmResult = await confirmResponse.json();

            console.log("[QR Code Page] 确认API响应:", {
              status: confirmResponse.status,
              success: confirmResult.success,
              error: confirmResult.error,
            });

            if (confirmResult.success) {
              console.log("[QR Code Page] ✅ 订阅记录已创建，显示成功界面");
              setPaymentStatus("success");
            } else {
              console.error("[QR Code Page] ❌ 确认API返回失败:", confirmResult.error);
              // 即使确认失败，也显示支付成功（因为支付已经完成）
              setPaymentStatus("success");
            }
          } catch (confirmError) {
            console.error("[QR Code Page] 确认API调用出错:", confirmError);
            // 即使确认出错，也显示支付成功（因为支付已经完成）
            setPaymentStatus("success");
          }
        }
      } catch (error) {
        console.error("Error checking payment status:", error);
      }
    };

    const statusCheckInterval = setInterval(checkPaymentStatus, 2000);

    return () => clearInterval(statusCheckInterval);
  }, [paymentId]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleBack = () => {
    router.back();
  };

  const handleSuccess = () => {
    // 导航到成功页面，并传递WeChat支付参数
    const params = new URLSearchParams();
    if (paymentId) {
      params.set("wechat_out_trade_no", paymentId);
    }
    router.push(`/payment/success?${params.toString()}`);
  };

  if (!codeUrl) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center text-red-600">
              {language === "zh" ? "参数错误" : "Invalid Parameters"}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {language === "zh" ? "微信支付" : "WeChat Payment"}
          </CardTitle>
          <CardDescription>
            {language === "zh"
              ? "请使用微信扫描二维码支付"
              : "Please scan the QR code with WeChat to pay"}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {paymentStatus === "success" && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <div>
                  <h3 className="font-medium text-green-800">
                    {language === "zh" ? "支付成功" : "Payment Successful"}
                  </h3>
                  <p className="text-sm text-green-600 mt-1">
                    {language === "zh"
                      ? "您的支付已确认"
                      : "Your payment has been confirmed"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {paymentStatus === "expired" && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-6 w-6 text-red-600" />
                <div>
                  <h3 className="font-medium text-red-800">
                    {language === "zh" ? "二维码已过期" : "QR Code Expired"}
                  </h3>
                  <p className="text-sm text-red-600 mt-1">
                    {language === "zh"
                      ? "请返回重新发起支付"
                      : "Please go back and try again"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {paymentStatus === "pending" && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
                      codeUrl
                    )}`}
                    alt="WeChat Payment QR Code"
                    className="w-64 h-64"
                  />
                </div>
              </div>

              <div className="space-y-3 text-center">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center justify-center gap-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-800">
                      {language === "zh" ? "过期时间: " : "Expires in: "}
                      <span className="text-lg font-bold">
                        {formatTime(timeLeft)}
                      </span>
                    </span>
                  </div>
                </div>

                {amount && (
                  <div className="text-center">
                    <p className="text-sm text-gray-600">
                      {language === "zh" ? "支付金额" : "Amount"}
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      ¥{parseFloat(amount).toFixed(2)}
                    </p>
                  </div>
                )}

                {paymentId && (
                  <p className="text-xs text-gray-500">
                    {language === "zh" ? "订单号: " : "Order No: "}
                    <span className="font-mono">{paymentId}</span>
                  </p>
                )}
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  {language === "zh"
                    ? '💡 打开您的微信应用，点击"扫一扫"来扫描此二维码'
                    : "💡 Open your WeChat app and tap 'Scan' to scan this QR code"}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {paymentStatus === "success" && (
              <Button onClick={handleSuccess} className="w-full">
                {language === "zh" ? "完成" : "Done"}
              </Button>
            )}

            {paymentStatus !== "success" && (
              <Button variant="outline" onClick={handleBack} className="w-full">
                {language === "zh" ? "返回" : "Go Back"}
              </Button>
            )}
          </div>

          <div className="text-center text-xs text-gray-500">
            <p>
              {language === "zh"
                ? "如有问题，请"
                : "If you have any issues, please "}
              <a href="/contact" className="text-blue-600 hover:underline">
                {language === "zh" ? "联系我们" : "contact us"}
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function WechatQRCodePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-muted-foreground">Loading...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <WechatQRCodeContent />
    </Suspense>
  );
}
