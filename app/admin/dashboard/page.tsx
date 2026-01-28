"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Globe, Building2 } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-4xl font-bold text-gray-900">数据仪表盘</h1>
        <p className="mb-12 text-lg text-gray-600">
          选择要查看的版本的详细数据和统计信息
        </p>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* CN 版本卡片 */}
          <Card className="flex flex-col border-2 p-8 transition-all hover:border-blue-500 hover:shadow-lg">
            <div className="mb-6 flex items-center gap-3">
              <Building2 className="h-8 w-8 text-blue-600" />
              <h2 className="text-2xl font-bold text-gray-900">国内版</h2>
            </div>

            <p className="mb-6 flex-1 text-gray-600">
              查看国内版用户数据、支付信息、订阅统计和应用下载统计。支持微信支付和支付宝。
            </p>

            <div className="space-y-3 border-t border-gray-200 pt-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">主要支付方式：</span>
                <span className="font-semibold">微信支付 / 支付宝</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">货币：</span>
                <span className="font-semibold">CNY（人民币）</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">数据库：</span>
                <span className="font-semibold">CloudBase</span>
              </div>
            </div>

            <Link href="/admin/dashboard/cn" className="mt-6">
              <Button className="w-full bg-blue-600 py-6 text-lg hover:bg-blue-700">
                进入国内版仪表盘 →
              </Button>
            </Link>
          </Card>

          {/* INTL 版本卡片 */}
          <Card className="flex flex-col border-2 p-8 transition-all hover:border-green-500 hover:shadow-lg">
            <div className="mb-6 flex items-center gap-3">
              <Globe className="h-8 w-8 text-green-600" />
              <h2 className="text-2xl font-bold text-gray-900">国际版</h2>
            </div>

            <p className="mb-6 flex-1 text-gray-600">
              查看国际版用户数据、支付信息、订阅统计和应用下载统计。支持 Stripe 和 PayPal。
            </p>

            <div className="space-y-3 border-t border-gray-200 pt-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">主要支付方式：</span>
                <span className="font-semibold">Stripe / PayPal</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">货币：</span>
                <span className="font-semibold">USD（美元）</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">数据库：</span>
                <span className="font-semibold">Supabase</span>
              </div>
            </div>

            <Link href="/admin/dashboard/intl" className="mt-6">
              <Button className="w-full bg-green-600 py-6 text-lg hover:bg-green-700">
                进入国际版仪表盘 →
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
