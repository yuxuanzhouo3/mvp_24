"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, Cloud, Server } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">系统设置</h1>
        <p className="text-gray-500">管理系统配置和账户安全</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 修改密码 */}
        <Card>
          <CardHeader>
            <CardTitle>管理员凭据</CardTitle>
            <CardDescription>当前管理员账号密码由环境变量统一管理</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-600">
            <p>请在部署环境中设置以下变量，并重启服务后生效：</p>
            <div className="rounded-md border bg-gray-50 p-3 space-y-1 font-mono text-xs">
              <p>ADMIN_USERNAME=your-admin-username</p>
              <p>ADMIN_PASSWORD=your-admin-password</p>
              <p>ADMIN_PASSWORD_HASH=optional-bcrypt-hash</p>
            </div>
            <p className="text-xs text-gray-500">
              当配置了 <code>ADMIN_PASSWORD_HASH</code> 时，优先使用哈希校验。
            </p>
          </CardContent>
        </Card>

        {/* 系统信息 */}
        <Card>
          <CardHeader>
            <CardTitle>系统信息</CardTitle>
            <CardDescription>当前系统配置概览</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-gray-400" />
                <span className="text-sm">系统版本</span>
              </div>
              <Badge variant="secondary">v3.0.0</Badge>
            </div>

            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-gray-400" />
                <span className="text-sm">国际版数据库</span>
              </div>
              <Badge>Supabase</Badge>
            </div>

            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-gray-400" />
                <span className="text-sm">国内版数据库</span>
              </div>
              <Badge variant="outline">CloudBase</Badge>
            </div>

            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-gray-400" />
                <span className="text-sm">存储服务</span>
              </div>
              <Badge variant="secondary">双端同步</Badge>
            </div>

            <div className="pt-4 text-xs text-gray-400">
              <p>后台管理系统支持国际版和国内版的双端数据同步。</p>
              <p className="mt-1">
                上传的文件可选择同步到 Supabase Storage 和 CloudBase COS。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 危险操作区域 */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">危险区域</CardTitle>
          <CardDescription>以下操作不可撤销，请谨慎操作</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">清空所有数据</p>
              <p className="text-sm text-gray-500">
                删除所有广告、版本和文件数据
              </p>
            </div>
            <Button variant="destructive" disabled>
              暂不支持
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
