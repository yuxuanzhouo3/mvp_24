"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Activity, Clock3, RefreshCcw, ShieldCheck, UsersRound } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type DeploymentRegion = "CN" | "INTL" | "ALL"

type MarketAnalyticsData = {
  region: DeploymentRegion
  generatedAt: string
  rangeDays: number
  overview: {
    totalUsers: number
    newUsersInRange: number
    activeUsersInRange: number
    activeUsers7d: number
    activeUsers30d: number
    activeRate7d: number
    activeRate30d: number
    firstUseRate7dForNewUsers30d: number
    avgUsageEventsPerActiveUser30d: number
    medianFirstUseHours: number
    totalUsageEventsInRange: number
  }
  retention: {
    summary: {
      cohortUsers: number
      d1Rate: number
      d3Rate: number
      d7Rate: number
      d14Rate: number
      d30Rate: number
    }
    cohorts: Array<{
      cohortDate: string
      newUsers: number
      d1Users: number
      d3Users: number
      d7Users: number
      d14Users: number
      d30Users: number
      d1Rate: number
      d3Rate: number
      d7Rate: number
      d14Rate: number
      d30Rate: number
    }>
  }
  trends: Array<{
    date: string
    newUsers: number
    dau: number
    wau: number
    usageEvents: number
    firstUseUsers: number
  }>
  habits: {
    byWeekday: Array<{ label: string; events: number; activeUsers: number; share: number }>
    byHour: Array<{ label: string; events: number; activeUsers: number; share: number }>
    topTools: Array<{ toolId: string; toolName: string; events: number; activeUsers: number; share: number }>
  }
  firstUse: {
    topTools: Array<{ toolId: string; toolName: string; users: number; share: number }>
    latencyDistribution: Array<{ bucket: string; label: string; users: number; share: number }>
  }
  segmentation: {
    recency: Array<{ label: string; users: number; share: number }>
    frequency30d: Array<{ label: string; users: number; share: number }>
  }
}

type AnalyticsTabKey =
  | "overview"
  | "trends"
  | "retention"
  | "habits"
  | "tools"
  | "firstUse"
  | "segments"

const RANGE_OPTIONS = [14, 30, 60, 90] as const
const PIE_COLORS = ["#1d4ed8", "#0891b2", "#0d9488", "#65a30d", "#ca8a04", "#ea580c", "#dc2626", "#9333ea"]

const ANALYTICS_TABS: Array<{ key: AnalyticsTabKey; label: string }> = [
  { key: "overview", label: "核心指标" },
  { key: "trends", label: "活跃趋势" },
  { key: "retention", label: "Cohort 留存" },
  { key: "habits", label: "使用习惯" },
  { key: "tools", label: "工具偏好" },
  { key: "firstUse", label: "首次使用" },
  { key: "segments", label: "用户分群" },
]

function pct(value: number) {
  return `${Number(value || 0).toFixed(2)}%`
}

function shortDate(value: string) {
  if (!value) return "-"
  const [year, month, day] = value.split("-")
  if (!year || !month || !day) return value
  return `${month}-${day}`
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "-"
  return date.toLocaleString()
}

function StatCard({ title, value, hint }: { title: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  )
}

function LoadingDashboard() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  )
}

export function MarketAnalyticsDashboardClient() {
  const router = useRouter()
  const [tab, setTab] = useState<AnalyticsTabKey>("overview")
  const [days, setDays] = useState<number>(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [data, setData] = useState<MarketAnalyticsData | null>(null)

  const loadData = useCallback(
    async (nextDays: number) => {
      setLoading(true)
      setError("")

      try {
        const response = await fetch(`/api/market/admin/analytics?days=${nextDays}`, { cache: "no-store" })
        if (response.status === 401) {
          router.replace("/market/login")
          return
        }

        const result = await response.json().catch(() => ({}))
        if (!response.ok || !result?.success || !result?.analytics) {
          throw new Error(result?.error || "Failed to load analytics")
        }

        setData(result.analytics as MarketAnalyticsData)
      } catch (err: any) {
        setError(err?.message || "Failed to load analytics")
      } finally {
        setLoading(false)
      }
    },
    [router],
  )

  useEffect(() => {
    void loadData(days)
  }, [days, loadData])

  const retentionCards = useMemo(() => {
    if (!data) return []
    return [
      { label: "D1 留存", value: data.retention.summary.d1Rate },
      { label: "D3 留存", value: data.retention.summary.d3Rate },
      { label: "D7 留存", value: data.retention.summary.d7Rate },
      { label: "D14 留存", value: data.retention.summary.d14Rate },
      { label: "D30 留存", value: data.retention.summary.d30Rate },
    ]
  }, [data])

  const logout = async () => {
    await fetch("/api/market/auth/logout", { method: "POST" }).catch(() => null)
    router.replace("/market/login")
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="h-14 border-b bg-background px-6 flex items-center justify-between">
        <div className="font-semibold">1. 用户分析系统</div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            区域: {data?.region || "加载中"}
          </Badge>
          <Button variant="outline" onClick={() => void loadData(days)} disabled={loading} className="gap-1.5">
            <RefreshCcw className="h-4 w-4" />
            {loading ? "刷新中..." : "刷新"}
          </Button>
          <Button asChild variant="outline">
            <Link href="/market">返回系统导航</Link>
          </Button>
          <Button variant="destructive" onClick={logout}>
            退出登录
          </Button>
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-56px)]">
        <aside className="w-56 border-r bg-background p-3 space-y-1">
          {ANALYTICS_TABS.map((item) => (
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
          <div className="text-sm text-muted-foreground">留存、活跃率、习惯分布、首次使用行为分析</div>
          <Card>
            <CardHeader className="space-y-3 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">时间范围</span>
                {RANGE_OPTIONS.map((option) => (
                  <Button
                    key={option}
                    size="sm"
                    variant={days === option ? "default" : "outline"}
                    onClick={() => setDays(option)}
                    disabled={loading}
                  >
                    近 {option} 天
                  </Button>
                ))}
              </div>
              <CardDescription>数据生成时间: {data ? formatDateTime(data.generatedAt) : "-"}</CardDescription>
            </CardHeader>
          </Card>

          {error ? (
            <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          {loading && !data ? <LoadingDashboard /> : null}

          {data ? (
            <>
              {tab === "overview" && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <UsersRound className="h-4 w-4" />
                      核心指标
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <StatCard title="总用户数" value={data.overview.totalUsers} hint={`近${data.rangeDays}天新增 ${data.overview.newUsersInRange}`} />
                    <StatCard title="近7天活跃用户" value={data.overview.activeUsers7d} hint={`活跃率 ${pct(data.overview.activeRate7d)}`} />
                    <StatCard title="近30天活跃用户" value={data.overview.activeUsers30d} hint={`活跃率 ${pct(data.overview.activeRate30d)}`} />
                    <StatCard title="区间活跃用户" value={data.overview.activeUsersInRange} hint={`区间事件 ${data.overview.totalUsageEventsInRange}`} />
                    <StatCard title="新用户7日首次使用率" value={pct(data.overview.firstUseRate7dForNewUsers30d)} hint="近30天新增用户口径" />
                    <StatCard title="首次使用中位时长" value={`${data.overview.medianFirstUseHours}h`} hint={`30天人均频次 ${data.overview.avgUsageEventsPerActiveUser30d}`} />
                  </CardContent>
                </Card>
              )}

              {tab === "trends" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Activity className="h-4 w-4" />
                      活跃与新增趋势
                    </CardTitle>
                    <CardDescription>DAU / WAU / 新增 / 首次使用 / 使用事件（日粒度）</CardDescription>
                  </CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.trends}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={16} />
                        <YAxis />
                        <Tooltip labelFormatter={(value) => `日期 ${value}`} />
                        <Legend />
                        <Line type="monotone" dataKey="dau" name="DAU" stroke="#2563eb" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="wau" name="WAU" stroke="#9333ea" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="newUsers" name="新增用户" stroke="#16a34a" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="firstUseUsers" name="首次使用用户" stroke="#ea580c" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="usageEvents" name="使用事件" stroke="#0891b2" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {tab === "retention" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">留存分析（Cohort）</CardTitle>
                    <CardDescription>按注册日期分组，追踪 D1 / D3 / D7 / D14 / D30 留存</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-2 md:grid-cols-5">
                      {retentionCards.map((item) => (
                        <div key={item.label} className="rounded-lg border bg-muted/20 p-3">
                          <div className="text-xs text-muted-foreground">{item.label}</div>
                          <div className="mt-1 text-xl font-semibold">{pct(item.value)}</div>
                        </div>
                      ))}
                    </div>

                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Cohort 日期</TableHead>
                            <TableHead>新增用户</TableHead>
                            <TableHead>D1</TableHead>
                            <TableHead>D3</TableHead>
                            <TableHead>D7</TableHead>
                            <TableHead>D14</TableHead>
                            <TableHead>D30</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.retention.cohorts.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-muted-foreground">
                                暂无 Cohort 数据
                              </TableCell>
                            </TableRow>
                          ) : (
                            data.retention.cohorts.slice(0, 20).map((row) => (
                              <TableRow key={row.cohortDate}>
                                <TableCell>{row.cohortDate}</TableCell>
                                <TableCell>{row.newUsers}</TableCell>
                                <TableCell>{pct(row.d1Rate)} ({row.d1Users})</TableCell>
                                <TableCell>{pct(row.d3Rate)} ({row.d3Users})</TableCell>
                                <TableCell>{pct(row.d7Rate)} ({row.d7Users})</TableCell>
                                <TableCell>{pct(row.d14Rate)} ({row.d14Users})</TableCell>
                                <TableCell>{pct(row.d30Rate)} ({row.d30Users})</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {tab === "habits" && (
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">使用习惯：星期分布</CardTitle>
                      <CardDescription>按事件量统计用户最活跃的星期</CardDescription>
                    </CardHeader>
                    <CardContent className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.habits.byWeekday}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="events" name="事件量" fill="#2563eb" radius={[6, 6, 0, 0]} />
                          <Bar dataKey="activeUsers" name="活跃用户" fill="#16a34a" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">使用习惯：小时分布（UTC）</CardTitle>
                      <CardDescription>按小时观察使用高峰</CardDescription>
                    </CardHeader>
                    <CardContent className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.habits.byHour}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" tickFormatter={(value) => (value.endsWith(":00") ? value.slice(0, 2) : value)} minTickGap={18} />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="events" name="事件量" stroke="#ea580c" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="activeUsers" name="活跃用户" stroke="#0891b2" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              )}

              {tab === "tools" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">工具偏好 Top 12</CardTitle>
                    <CardDescription>按使用事件量和覆盖用户数统计</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>工具</TableHead>
                          <TableHead>工具ID</TableHead>
                          <TableHead>事件量</TableHead>
                          <TableHead>活跃用户</TableHead>
                          <TableHead>事件占比</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.habits.topTools.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground">
                              暂无工具使用数据
                            </TableCell>
                          </TableRow>
                        ) : (
                          data.habits.topTools.map((row) => (
                            <TableRow key={row.toolId}>
                              <TableCell>{row.toolName}</TableCell>
                              <TableCell className="font-mono text-xs">{row.toolId}</TableCell>
                              <TableCell>{row.events}</TableCell>
                              <TableCell>{row.activeUsers}</TableCell>
                              <TableCell>{pct(row.share)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {tab === "firstUse" && (
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Clock3 className="h-4 w-4" />
                        首次使用工具分布
                      </CardTitle>
                      <CardDescription>新用户首次真正使用的入口工具</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={data.firstUse.topTools}
                              dataKey="users"
                              nameKey="toolName"
                              cx="50%"
                              cy="50%"
                              outerRadius={95}
                              label={(entry) => `${entry.toolName} ${entry.share.toFixed(1)}%`}
                            >
                              {data.firstUse.topTools.map((entry, index) => (
                                <Cell key={`${entry.toolId}_${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: any, _name: any, payload: any) => [`${value}`, payload?.payload?.toolName || ""]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">首次使用时延分布</CardTitle>
                      <CardDescription>注册后到首次使用的时间延迟</CardDescription>
                    </CardHeader>
                    <CardContent className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.firstUse.latencyDistribution}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="users" name="用户数" fill="#2563eb" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              )}

              {tab === "segments" && (
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">用户分群：最近活跃度</CardTitle>
                      <CardDescription>按最近一次使用时间分层</CardDescription>
                    </CardHeader>
                    <CardContent className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.segmentation.recency}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="users" name="用户数" fill="#16a34a" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">用户分群：30天频次</CardTitle>
                      <CardDescription>按近30天使用次数分层</CardDescription>
                    </CardHeader>
                    <CardContent className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.segmentation.frequency30d}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="users" name="用户数" fill="#9333ea" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          ) : null}
        </main>
      </div>
    </div>
  )
}
