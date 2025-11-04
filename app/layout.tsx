import type { Metadata } from "next";
import "./globals.css";
import { initializePaymentProviders } from "@/lib/payment/init";
import { AppProvider } from "@/components/app-context";
import { UserProvider } from "@/components/user-context";
import { LanguageProvider } from "@/components/language-provider";
import { GeoProvider } from "@/components/geo-provider";
import { Toaster } from "@/components/ui/toaster";
import { initSentry } from "@/lib/sentry";
import "@/lib/startup-checks"; // 启动安全检查

// 初始化支付提供商
initializePaymentProviders();

// 初始化 Sentry
initSentry();

export const metadata: Metadata = {
  title: "MultiGPT Platform",
  description:
    "Advanced multi-GPT collaboration platform with intelligent geo-routing",
  generator: "Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <GeoProvider>
          <LanguageProvider>
            <AppProvider>
              <UserProvider>
                {children}
                {/* Global toast portal */}
                <Toaster />
              </UserProvider>
            </AppProvider>
          </LanguageProvider>
        </GeoProvider>
      </body>
    </html>
  );
}
