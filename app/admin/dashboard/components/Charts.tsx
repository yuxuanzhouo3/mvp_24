"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/card";

const COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
];

// 用户增长趋势图
export function UserGrowthChart({ data }: { data: any }) {
  if (!data || !Array.isArray(data)) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">用户增长趋势</h3>
        <div className="h-64 flex items-center justify-center text-gray-400">
          暂无数据
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">用户增长趋势</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip
            contentStyle={{
              backgroundColor: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: "0.375rem",
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="cn"
            stroke="#3b82f6"
            name="国内版"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="intl"
            stroke="#ef4444"
            name="国际版"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

// 月度收入趋势图
export function RevenueChart({ data }: { data: any }) {
  if (!data || !Array.isArray(data)) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">月度收入趋势</h3>
        <div className="h-64 flex items-center justify-center text-gray-400">
          暂无数据
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">月度收入趋势</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip
            contentStyle={{
              backgroundColor: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: "0.375rem",
            }}
          />
          <Legend />
          <Bar dataKey="cn" fill="#3b82f6" name="国内版" />
          <Bar dataKey="intl" fill="#ef4444" name="国际版" />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

// 支付方式分布
export function PaymentMethodChart({
  cnData,
  intlData,
}: {
  cnData: Record<string, number>;
  intlData: Record<string, number>;
}) {
  const cnChartData = Object.entries(cnData || {}).map(([name, value]) => ({
    name,
    value,
  }));
  const intlChartData = Object.entries(intlData || {}).map(([name, value]) => ({
    name,
    value,
  }));

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* CN 支付方式 */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">国内版支付方式分布</h3>
        {cnChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={cnChartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {cnChartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#f9fafb",
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.375rem",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-400">
            暂无数据
          </div>
        )}
      </Card>

      {/* INTL 支付方式 */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">国际版支付方式分布</h3>
        {intlChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={intlChartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {intlChartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#f9fafb",
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.375rem",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-400">
            暂无数据
          </div>
        )}
      </Card>
    </div>
  );
}

// 版本下载统计
export function DownloadChart({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data || {})
    .filter(([_, count]) => typeof count === "number" && count > 0)
    .map(([platform, count]) => ({
      platform: String(platform),
      downloads: Number(count),
    }));

  if (chartData.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">各平台下载统计</h3>
        <div className="h-64 flex items-center justify-center text-gray-400">
          暂无数据
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">各平台下载统计</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="platform" type="category" width={90} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: "0.375rem",
            }}
            formatter={(value) => {
              if (typeof value === "number") {
                return value.toLocaleString();
              }
              return String(value);
            }}
          />
          <Bar dataKey="downloads" fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
