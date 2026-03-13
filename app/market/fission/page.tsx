import { MarketDashboardClient } from "../market-dashboard-client";
import { requireMarketAdminSession } from "../require-market-session";
import { getDEPLOY_REGION } from "@/lib/config/region";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function MarketFissionPage() {
  await requireMarketAdminSession();
  const region = getDEPLOY_REGION();
  return <MarketDashboardClient region={region} />;
}
