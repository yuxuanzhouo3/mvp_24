"use client";

import dynamic from "next/dynamic";

const AppToaster = dynamic(
  () => import("@/components/ui/toaster").then((mod) => mod.Toaster),
  { ssr: false, loading: () => null }
);

const SonnerToaster = dynamic(
  () => import("@/components/ui/sonner").then((mod) => mod.Toaster),
  { ssr: false, loading: () => null }
);

const DebugModeIndicator = dynamic(
  () =>
    import("@/components/debug-mode-indicator").then(
      (mod) => mod.DebugModeIndicator
    ),
  { ssr: false, loading: () => null }
);

const InitializeApp = dynamic(() => import("@/components/initialize-app"), {
  ssr: false,
  loading: () => null,
});

const SubscriptionModal = dynamic(
  () =>
    import("@/components/subscription-modal").then(
      (mod) => mod.SubscriptionModal
    ),
  { ssr: false, loading: () => null }
);

const WebLogConsole = dynamic(
  () => import("@/components/web-log-console").then((mod) => mod.WebLogConsole),
  { ssr: false, loading: () => null }
);

export function LayoutClientOverlays() {
  return (
    <>
      <InitializeApp />
      <SubscriptionModal />
      <DebugModeIndicator />
      <AppToaster />
      <SonnerToaster />
      <WebLogConsole />
    </>
  );
}
