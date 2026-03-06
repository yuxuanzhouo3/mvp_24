import { MarketAnalyticsDashboardClient } from "./market-analytics-dashboard-client"
import { requireMarketAdminSession } from "../require-market-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function MarketAnalyticsPage() {
  await requireMarketAdminSession()
  return <MarketAnalyticsDashboardClient />
}
