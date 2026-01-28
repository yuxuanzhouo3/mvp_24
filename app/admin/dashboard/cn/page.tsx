"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StatsCard from "../region/StatsCard";
import {
  UserGrowthChart,
  RevenueChart,
  PaymentMethodChart,
  DownloadChart,
} from "../components/Charts";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

interface StatsData {
  cn: any;
  intl?: any;
  updateTime: string;
}

export default function CNDashboard() {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
  });

  const [stats, setStats] = useState({
    users: null as StatsData | null,
    payments: null as StatsData | null,
    subscriptions: null as StatsData | null,
    downloads: null as StatsData | null,
  });

  const [loading, setLoading] = useState(true);

  // 预设日期范围
  const setPresetDateRange = (days: number) => {
    const endDate = new Date();
    let startDate: Date;
    
    if (days === -1) {
      // "全部" - 设置为一个较早的日期
      startDate = new Date("2020-01-01");
    } else {
      startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    }

    setDateRange({
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
    });
  };

  // 获取统计数据
  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const endpoints = [
          `/api/admin/stats/users?region=CN&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`,
          `/api/admin/stats/payments?region=CN&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`,
          `/api/admin/stats/subscriptions?region=CN&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`,
          `/api/admin/stats/downloads?region=CN&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`,
        ];

        const [usersRes, paymentsRes, subscriptionsRes, downloadsRes] =
          await Promise.all(endpoints.map((url) => fetch(url).then((r) => r.json())));

        setStats({
          users: usersRes,
          payments: paymentsRes,
          subscriptions: subscriptionsRes,
          downloads: downloadsRes,
        });
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [dateRange]);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* 返回按钮 */}
      <div className="mb-8 flex items-center gap-4">
        <Link href="/admin/dashboard">
          <Button variant="ghost" size="sm">
            <ChevronLeft className="h-4 w-4" />
            返回仪表盘
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">国内版数据仪表盘</h1>
      </div>

      {/* 日期范围选择 */}
      <Card className="mb-8 p-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex gap-2">
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) =>
                setDateRange({ ...dateRange, startDate: e.target.value })
              }
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) =>
                setDateRange({ ...dateRange, endDate: e.target.value })
              }
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPresetDateRange(1)}
            >
              今天
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPresetDateRange(7)}
            >
              7 天
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPresetDateRange(30)}
            >
              30 天
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPresetDateRange(365)}
            >
              一年
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPresetDateRange(-1)}
            >
              全部
            </Button>
          </div>
        </div>
      </Card>

      {/* 统计卡片 */}
      {!loading && stats.users && (
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="用户总数"
            value={stats.users?.cn?.totalUsers || 0}
            subtext={`活跃用户: ${stats.users?.cn?.activeUsers || 0}`}
          />
          <StatsCard
            title="收入总额"
            value={`¥${stats.payments?.cn?.totalRevenue || "0"}`}
            subtext={`已完成: ${stats.payments?.cn?.completedPayments || 0} / 总订单: ${stats.payments?.cn?.totalOrders || 0}`}
          />
          <StatsCard
            title="订阅用户"
            value={stats.subscriptions?.cn?.activeSubscriptions || 0}
            subtext={`总订阅数: ${stats.subscriptions?.cn?.totalSubscriptions || 0}`}
          />
          <StatsCard
            title="应用版本"
            value={stats.downloads?.cn?.activeVersions || 0}
            subtext={`版本总数: ${stats.downloads?.cn?.totalVersions || 0}`}
          />
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <p className="text-gray-500">加载中...</p>
        </div>
      )}

      {/* 图表区域 */}
      {!loading && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 用户增长 */}
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">用户增长趋势</h2>
            <UserGrowthChart data={stats.users?.cn} />
          </Card>

          {/* 收入统计 */}
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">收入统计</h2>
            <RevenueChart data={stats.payments?.cn} />
          </Card>

          {/* 支付方式分布 */}
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">支付方式分布</h2>
            <PaymentMethodChart
              cnData={stats.payments?.cn?.providerDistribution || {}}
              intlData={{}}
            />
          </Card>

          {/* 平台下载分布 */}
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">平台下载分布</h2>
            <DownloadChart data={stats.downloads?.cn?.platformDistribution || {}} />
          </Card>
        </div>
      )}
    </div>
  );
}
