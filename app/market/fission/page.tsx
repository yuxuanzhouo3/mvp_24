import { MarketDashboardClient } from "../market-dashboard-client";
import { requireMarketAdminSession } from "../require-market-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function MarketFissionPage(props: {
  searchParams?: {
    region?: string;
  };
}) {
  await requireMarketAdminSession();
  const rawRegion = String(props.searchParams?.region || "ALL").trim().toUpperCase();
  const region = rawRegion === "CN" || rawRegion === "INTL" || rawRegion === "ALL"
    ? rawRegion
    : "ALL";
  return <MarketDashboardClient region={region} />;
}
