import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/components/app-context";
import { UserProvider } from "@/components/user-context";
import { LanguageProvider } from "@/components/language-provider";
import { GeoProvider } from "@/components/geo-provider";
import { Toaster } from "@/components/ui/toaster";
import { DebugModeIndicator } from "@/components/debug-mode-indicator";
import { Suspense } from "react";
import InitializeApp from "@/components/initialize-app";
import { SubscriptionModal } from "@/components/subscription-modal";
import { WebLogConsole } from "@/components/web-log-console";
import Script from "next/script";

export const metadata: Metadata = {
  title: "MultiGPT Platform",
  description:
    "Advanced multi-GPT collaboration platform with intelligent geo-routing",
  generator: "Next.js",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <script src="https://res.wx.qq.com/open/js/jweixin-1.6.0.js"></script>
      </head>
      <body>
        <GeoProvider>
          <LanguageProvider>
            <AppProvider>
              <UserProvider>
                {children}
                {/* 初始化应用（仅在运行时执行） */}
                <InitializeApp />
                {/* 订阅提示弹窗 */}
                <SubscriptionModal />
                {/* Debug mode indicator - 仅开发环境显示 */}
                <Suspense fallback={null}>
                  <DebugModeIndicator />
                </Suspense>
                {/* Global toast portal */}
                <Toaster />
                {/* H5 日志控制台 - 仅在 debug=true 时显示 */}
                <WebLogConsole />
              </UserProvider>
            </AppProvider>
          </LanguageProvider>
        </GeoProvider>
      </body>
    </html>
  );
}
