import Link from "next/link"
import { ArrowLeft, BellRing } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireMarketAdminSession } from "../require-market-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function MarketNotificationsPage() {
  await requireMarketAdminSession()

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Card className="border shadow-sm">
          <CardHeader className="space-y-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg border bg-muted/40">
              <BellRing className="h-5 w-5" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>3. 产品通知系统</CardTitle>
              <Badge variant="secondary">规划中</Badge>
            </div>
            <CardDescription>冷召回与惊奇文章推送策略管理</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              页面入口已开放，后续可在这里接入召回分层、人群触达计划和内容推送效果追踪。
            </p>
            <Button asChild variant="outline">
              <Link href="/market">
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回系统导航
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
