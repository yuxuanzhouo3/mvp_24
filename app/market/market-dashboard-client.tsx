"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { RefreshCcw, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type MarketOverview = {
  totalClicks: number
  totalInvites: number
  totalActivated: number
  totalRewardCredits: number
  totalRewardDays: number
  signupRewardCredits: number
  firstUseRewardCredits: number
  firstPaymentRewardDays: number
  conversionRate: number
  activationRate: number
  usersWithReferralCode: number
}

type MarketTrend = {
  date: string
  clicks: number
  invites: number
  activated: number
  rewardCredits: number
  rewardDays: number
}

type MarketChannel = {
  source: string
  clicks: number
  invites: number
  conversionRate: number
}

type MarketTopInviter = {
  inviterUserId: string
  inviterEmail: string | null
  referralCode: string | null
  clickCount: number
  invitedCount: number
  activatedCount: number
  rewardCredits: number
  rewardDays: number
}

type MarketRelation = {
  relationId: string
  inviterUserId: string
  inviterEmail: string | null
  invitedUserId: string
  invitedEmail: string | null
  shareCode: string
  toolSlug: string | null
  firstToolId: string | null
  status: string
  createdAt: string
  activatedAt: string | null
}

type MarketReward = {
  rewardId: string
  relationId: string | null
  userId: string
  userEmail: string | null
  rewardType: string
  amount: number
  unit: string
  status: string
  referenceId: string
  relatedTransactionId: string | null
  createdAt: string
  grantedAt: string | null
  revokedAt: string | null
}

type MarketTabKey = "overview" | "trends" | "channels" | "inviters" | "relations" | "rewards"

const MARKET_TABS: Array<{ key: MarketTabKey; label: string }> = [
  { key: "overview", label: "总览" },
  { key: "trends", label: "趋势分析" },
  { key: "channels", label: "渠道占比" },
  { key: "inviters", label: "Top 邀请人" },
  { key: "relations", label: "邀请关系" },
  { key: "rewards", label: "奖励明细" },
]

function formatDate(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "-"
  return date.toLocaleString()
}

function StatCard({ title, value }: { title: string; value: number | string }) {
  return (
    <div className="border rounded-xl p-4 bg-background">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  )
}

export function MarketDashboardClient({ region }: { region: "CN" | "INTL" | "ALL" }) {
  const router = useRouter()

  const [tab, setTab] = useState<MarketTabKey>("overview")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [overview, setOverview] = useState<MarketOverview | null>(null)
  const [trends, setTrends] = useState<MarketTrend[]>([])
  const [channels, setChannels] = useState<MarketChannel[]>([])
  const [inviters, setInviters] = useState<MarketTopInviter[]>([])
  const [relations, setRelations] = useState<MarketRelation[]>([])
  const [rewards, setRewards] = useState<MarketReward[]>([])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError("")
    const regionQuery = `region=${encodeURIComponent(region)}`

    try {
      const [
        overviewResp,
        trendsResp,
        channelsResp,
        invitersResp,
        relationsResp,
        rewardsResp,
      ] = await Promise.all([
        fetch(`/api/market/admin/overview?${regionQuery}`, { cache: "no-store" }),
        fetch(`/api/market/admin/trends?days=14&${regionQuery}`, { cache: "no-store" }),
        fetch(`/api/market/admin/channels?limit=12&${regionQuery}`, { cache: "no-store" }),
        fetch(`/api/market/admin/top-inviters?limit=20&${regionQuery}`, { cache: "no-store" }),
        fetch(`/api/market/admin/relations?page=1&limit=20&${regionQuery}`, { cache: "no-store" }),
        fetch(`/api/market/admin/rewards?page=1&limit=20&${regionQuery}`, { cache: "no-store" }),
      ])

      if ([overviewResp, trendsResp, channelsResp, invitersResp, relationsResp, rewardsResp].some((resp) => resp.status === 401)) {
        router.replace("/market/login")
        return
      }

      const overviewJson = await overviewResp.json().catch(() => ({}))
      const trendsJson = await trendsResp.json().catch(() => ({}))
      const channelsJson = await channelsResp.json().catch(() => ({}))
      const invitersJson = await invitersResp.json().catch(() => ({}))
      const relationsJson = await relationsResp.json().catch(() => ({}))
      const rewardsJson = await rewardsResp.json().catch(() => ({}))

      if (!overviewResp.ok || !overviewJson?.success) throw new Error(overviewJson?.error || "Failed to load overview")
      if (!trendsResp.ok || !trendsJson?.success) throw new Error(trendsJson?.error || "Failed to load trends")
      if (!channelsResp.ok || !channelsJson?.success) throw new Error(channelsJson?.error || "Failed to load channels")
      if (!invitersResp.ok || !invitersJson?.success) throw new Error(invitersJson?.error || "Failed to load inviters")
      if (!relationsResp.ok || !relationsJson?.success) throw new Error(relationsJson?.error || "Failed to load relations")
      if (!rewardsResp.ok || !rewardsJson?.success) throw new Error(rewardsJson?.error || "Failed to load rewards")

      setOverview(overviewJson.overview || null)
      setTrends(Array.isArray(trendsJson.trends) ? trendsJson.trends : [])
      setChannels(Array.isArray(channelsJson.channels) ? channelsJson.channels : [])
      setInviters(Array.isArray(invitersJson.inviters) ? invitersJson.inviters : [])
      setRelations(Array.isArray(relationsJson.rows) ? relationsJson.rows : [])
      setRewards(Array.isArray(rewardsJson.rows) ? rewardsJson.rows : [])
    } catch (err: any) {
      setError(err?.message || "Failed to load market dashboard")
    } finally {
      setLoading(false)
    }
  }, [region, router])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const logout = async () => {
    await fetch("/api/market/auth/logout", { method: "POST" }).catch(() => null)
    router.replace("/market/login")
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="h-14 border-b bg-background px-6 flex items-center justify-between">
        <div className="font-semibold">4. 用户裂变系统</div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            区域: {region}
          </Badge>
          <Button variant="outline" onClick={() => void loadAll()} disabled={loading} className="gap-1.5">
            <RefreshCcw className="h-4 w-4" />
            {loading ? "刷新中..." : "刷新"}
          </Button>
          <Button asChild variant="outline">
            <Link href="/market">返回系统导航</Link>
          </Button>
          <Button variant="destructive" onClick={logout}>退出登录</Button>
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-56px)]">
        <aside className="w-56 border-r bg-background p-3 space-y-1">
          {MARKET_TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                tab === item.key ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              {item.label}
            </button>
          ))}
        </aside>

        <main className="flex-1 p-6 space-y-4">
          <div className="text-sm text-muted-foreground">复用 /admin 会话的邀请裂变运营看板</div>
          {error ? <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

          {tab === "overview" && (
            <Card>
              <CardHeader>
                <CardTitle>业务总览</CardTitle>
                <CardDescription>裂变核心指标与奖励分布</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                  <StatCard title="总点击" value={overview?.totalClicks ?? 0} />
                  <StatCard title="总邀请" value={overview?.totalInvites ?? 0} />
                  <StatCard title="已激活" value={overview?.totalActivated ?? 0} />
                  <StatCard title="累计奖励天数" value={overview?.totalRewardDays ?? overview?.totalRewardCredits ?? 0} />
                  <StatCard title="转化率" value={`${overview?.conversionRate ?? 0}%`} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard title="激活率" value={`${overview?.activationRate ?? 0}%`} />
                  <StatCard title="注册奖励天数" value={overview?.signupRewardCredits ?? 0} />
                  <StatCard title="首次使用奖励天数" value={overview?.firstUseRewardCredits ?? 0} />
                  <StatCard title="首次付费奖励天数" value={overview?.firstPaymentRewardDays ?? 0} />
                  <StatCard title="拥有邀请码用户数" value={overview?.usersWithReferralCode ?? 0} />
                </div>
              </CardContent>
            </Card>
          )}

          {tab === "trends" && (
            <Card>
              <CardHeader>
                <CardTitle>14 天趋势</CardTitle>
                <CardDescription>点击 / 邀请 / 激活 / 奖励天数</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>日期</TableHead>
                      <TableHead>点击</TableHead>
                      <TableHead>邀请</TableHead>
                      <TableHead>激活</TableHead>
                      <TableHead>奖励天数</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trends.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">暂无数据</TableCell>
                      </TableRow>
                    ) : (
                      trends.map((row) => (
                        <TableRow key={row.date}>
                          <TableCell>{row.date}</TableCell>
                          <TableCell>{row.clicks}</TableCell>
                          <TableCell>{row.invites}</TableCell>
                          <TableCell>{row.activated}</TableCell>
                          <TableCell>{row.rewardDays ?? row.rewardCredits}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {tab === "channels" && (
            <Card>
              <CardHeader>
                <CardTitle>渠道占比</CardTitle>
                <CardDescription>按 source 自动归因</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>渠道</TableHead>
                      <TableHead>点击</TableHead>
                      <TableHead>邀请</TableHead>
                      <TableHead>转化率</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {channels.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">暂无数据</TableCell>
                      </TableRow>
                    ) : (
                      channels.map((row) => (
                        <TableRow key={row.source}>
                          <TableCell>{row.source}</TableCell>
                          <TableCell>{row.clicks}</TableCell>
                          <TableCell>{row.invites}</TableCell>
                          <TableCell>{row.conversionRate}%</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {tab === "inviters" && (
            <Card>
              <CardHeader>
                <CardTitle>Top 邀请人</CardTitle>
                <CardDescription>按邀请人数排序</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>邀请人</TableHead>
                      <TableHead>邀请码</TableHead>
                      <TableHead>点击</TableHead>
                      <TableHead>邀请</TableHead>
                      <TableHead>激活</TableHead>
                      <TableHead>奖励天数</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inviters.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">暂无数据</TableCell>
                      </TableRow>
                    ) : (
                      inviters.slice(0, 20).map((row) => (
                        <TableRow key={row.inviterUserId}>
                          <TableCell className="max-w-[180px] truncate">{row.inviterEmail || row.inviterUserId}</TableCell>
                          <TableCell>{row.referralCode || "-"}</TableCell>
                          <TableCell>{row.clickCount}</TableCell>
                          <TableCell>{row.invitedCount}</TableCell>
                          <TableCell>{row.activatedCount}</TableCell>
                          <TableCell>{row.rewardDays ?? row.rewardCredits}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {tab === "relations" && (
            <Card>
              <CardHeader>
                <CardTitle>邀请关系列表</CardTitle>
                <CardDescription>最近 20 条关系（含激活工具）</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>创建时间</TableHead>
                      <TableHead>邀请人</TableHead>
                      <TableHead>被邀请人</TableHead>
                      <TableHead>邀请码</TableHead>
                      <TableHead>首次工具</TableHead>
                      <TableHead>激活时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">暂无数据</TableCell>
                      </TableRow>
                    ) : (
                      relations.map((row) => (
                        <TableRow key={row.relationId}>
                          <TableCell>{formatDate(row.createdAt)}</TableCell>
                          <TableCell className="max-w-[180px] truncate">{row.inviterEmail || row.inviterUserId}</TableCell>
                          <TableCell className="max-w-[180px] truncate">{row.invitedEmail || row.invitedUserId}</TableCell>
                          <TableCell>{row.shareCode}</TableCell>
                          <TableCell>{row.firstToolId || "-"}</TableCell>
                          <TableCell>{formatDate(row.activatedAt)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {tab === "rewards" && (
            <Card>
              <CardHeader>
                <CardTitle>奖励明细</CardTitle>
                <CardDescription>最近 20 条发奖记录（首次使用/首次付费）</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>用户</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>天数</TableHead>
                      <TableHead>单位</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rewards.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">暂无数据</TableCell>
                      </TableRow>
                    ) : (
                      rewards.map((row) => (
                        <TableRow key={row.rewardId}>
                          <TableCell>{formatDate(row.createdAt)}</TableCell>
                          <TableCell className="max-w-[220px] truncate">{row.userEmail || row.userId}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{row.rewardType}</Badge>
                          </TableCell>
                          <TableCell>{row.amount}</TableCell>
                          <TableCell>{row.unit || "membership_days"}</TableCell>
                          <TableCell>{row.status}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  )
}
