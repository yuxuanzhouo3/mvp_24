"use client";

import { useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

/**
 * 支付跳转页面内容组件
 */
function PaymentRedirectContent() {
  const searchParams = useSearchParams();
  const formSubmitted = useRef(false);

  useEffect(() => {
    // 防止重复提交
    if (formSubmitted.current) return;

    // 从 URL 参数获取支付表单 HTML
    const formHtml = searchParams.get("form");
    if (!formHtml) {
      console.error("No payment form provided");
      return;
    }

    formSubmitted.current = true;

    try {
      // 解码 base64 编码的表单 HTML
      const decodedHtml = atob(formHtml);
      console.log("Rendering payment form...");

      // 创建容器并渲染表单
      const container = document.createElement("div");
      container.style.display = "none";
      document.body.appendChild(container);
      container.innerHTML = decodedHtml;

      // 查找并提交表单
      const form = container.querySelector("form");
      if (form) {
        // 防止“新窗口/外部浏览器”弹出：强制在当前窗口提交
        form.setAttribute("target", "_self");

        // 防止重复 submit（StrictMode 重挂载 / WebView 重放 / 快速返回再进）
        try {
          const outTradeNoInput = container.querySelector(
            'input[name="out_trade_no"]'
          ) as HTMLInputElement | null;
          const outTradeNo = outTradeNoInput?.value?.trim();
          const storageKey = `payment:dedupe:alipay:${form.action}:${outTradeNo || formHtml.slice(0, 64)}`;
          const now = Date.now();
          const last = sessionStorage.getItem(storageKey);
          const lastTs = last ? Number(last) : 0;
          if (lastTs && Number.isFinite(lastTs) && now - lastTs < 8000) {
            console.warn("Duplicate payment redirect prevented", {
              outTradeNo,
              action: form.action,
            });
            container.remove();
            return;
          }
          sessionStorage.setItem(storageKey, String(now));
        } catch {
          // sessionStorage 不可用时，退化为仅靠 ref 防重
        }

        console.log("Submitting form to:", form.action);
        setTimeout(() => {
          form.submit();
          // 页面通常会立刻跳走；如果没跳走，也别长期残留
          setTimeout(() => {
            try {
              container.remove();
            } catch {
              // ignore
            }
          }, 1000);
        }, 100);
      } else {
        console.error("Form not found in HTML");
        container.remove();
      }
    } catch (error) {
      console.error("Failed to process payment form:", error);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
          <CardTitle className="text-xl">正在跳转到支付页面...</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground">
          <p>请稍候，即将跳转到支付宝收银台</p>
          <p className="text-sm mt-2">如果长时间未跳转，请返回重试</p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * 支付跳转页面
 * 用于绕过 CSP 限制，将支付宝的 HTML 表单渲染并自动提交
 */
export default function PaymentRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
              <CardTitle className="text-xl">加载中...</CardTitle>
            </CardHeader>
          </Card>
        </div>
      }
    >
      <PaymentRedirectContent />
    </Suspense>
  );
}
