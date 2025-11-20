import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/components/app-context";
import { UserProvider } from "@/components/user-context";
import { LanguageProvider } from "@/components/language-provider";
import { GeoProvider } from "@/components/geo-provider";
import { Toaster } from "@/components/ui/toaster";
import { DebugModeIndicator } from "@/components/debug-mode-indicator";
import { Suspense } from "react";
import InitializeApp from "@/components/initialize-app";

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
                {/* 初始化应用（仅在运行时执行） */}
                <InitializeApp />
                {/* Debug mode indicator - 仅开发环境显示 */}
                <Suspense fallback={null}>
                  <DebugModeIndicator />
                </Suspense>
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
