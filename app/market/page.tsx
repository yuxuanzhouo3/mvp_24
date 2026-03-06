import Link from "next/link"
import { ArrowRight, BellRing, Megaphone, UserPlus2, UsersRound } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireMarketAdminSession } from "./require-market-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MARKET_SUBSYSTEMS = [
  {
    id: "1",
    title: "用户分析系统",
    description: "留存、活跃率、用户习惯与首次使用行为分析",
    href: "/market/analytics",
    status: "已完成",
    icon: UsersRound,
  },
  {
    id: "2",
    title: "产品获客系统",
    description: "对接博主合作与企业采购线索管理",
    href: "/market/acquisition",
    status: "规划中",
    icon: Megaphone,
  },
  {
    id: "3",
    title: "产品通知系统",
    description: "冷召回与惊奇文章推送策略中心",
    href: "/market/notifications",
    status: "规划中",
    icon: BellRing,
  },
  {
    id: "4",
    title: "用户裂变系统",
    description: "邀请转化、激活与奖励明细（已完成）",
    href: "/market/fission",
    status: "已完成",
    icon: UserPlus2,
  },
] as const

export default async function MarketAdminPage() {
  await requireMarketAdminSession()

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-8 md:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border bg-background px-6 py-7 md:px-8 md:py-10">
          <h1 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">选择要进入的子系统</h1>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">
            当前已开放四个子系统入口，你可以按业务目标自由进入对应系统。
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {MARKET_SUBSYSTEMS.map((system) => (
            <Card key={system.id} className="border border-border/80 shadow-sm">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border bg-muted/40">
                    <system.icon className="h-5 w-5" />
                  </div>
                  <Badge variant={system.status === "已完成" ? "default" : "secondary"}>{system.status}</Badge>
                </div>
                <CardTitle className="text-xl">
                  {system.id}. {system.title}
                </CardTitle>
                <CardDescription>{system.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full justify-between">
                  <Link href={system.href}>
                    进入系统
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </div>
  )
}
