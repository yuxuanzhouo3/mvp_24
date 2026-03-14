import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/components/app-context";
import { UserProvider } from "@/components/user-context";
import { LanguageProvider } from "@/components/language-provider";
import { GeoProvider } from "@/components/geo-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { AppearanceProvider } from "@/components/appearance-provider";
import { LayoutClientOverlays } from "@/components/layout-client-overlays";
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
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {process.env.NODE_ENV === "production" && (
          <Script id="disable-browser-console" strategy="beforeInteractive">
            {`
              (function () {
                var methods = [
                  "log",
                  "info",
                  "debug",
                  "warn",
                  "error",
                  "trace",
                  "table",
                  "dir",
                  "dirxml",
                  "group",
                  "groupCollapsed",
                  "groupEnd",
                  "time",
                  "timeLog",
                  "timeEnd",
                  "count",
                  "countReset",
                  "assert",
                  "clear",
                  "profile",
                  "profileEnd"
                ];
                try {
                  var c = window.console || {};
                  for (var i = 0; i < methods.length; i++) {
                    c[methods[i]] = function () {};
                  }
                  window.console = c;
                } catch (_) {}
              })();
            `}
          </Script>
        )}
        <Script
          id="wechat-js-sdk"
          src="https://res.wx.qq.com/open/js/jweixin-1.6.0.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppearanceProvider>
            <GeoProvider>
              <LanguageProvider>
                <AppProvider>
                  <UserProvider>
                    {children}
                    <LayoutClientOverlays />
                  </UserProvider>
                </AppProvider>
              </LanguageProvider>
            </GeoProvider>
          </AppearanceProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
