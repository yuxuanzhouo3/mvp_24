import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Cloud, Database, Server } from "lucide-react";
import { getCurrentAdminDataProvider, getCurrentAdminRegionLabel } from "@/lib/admin/region";

export default function SettingsPage() {
  const regionLabel = getCurrentAdminRegionLabel();
  const providerLabel = getCurrentAdminDataProvider() === "cloudbase" ? "CloudBase" : "Supabase";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">系统设置</h1>
        <p className="text-gray-500">当前后台仅管理 {regionLabel} 数据</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
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

        <Card>
          <CardHeader>
            <CardTitle>系统信息</CardTitle>
            <CardDescription>当前后台只连接当前部署区的数据面</CardDescription>
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
                <span className="text-sm">当前区域</span>
              </div>
              <Badge>{regionLabel}</Badge>
            </div>

            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-gray-400" />
                <span className="text-sm">当前数据库</span>
              </div>
              <Badge variant="outline">{providerLabel}</Badge>
            </div>

            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-gray-400" />
                <span className="text-sm">数据策略</span>
              </div>
              <Badge variant="secondary">单区隔离</Badge>
            </div>

            <div className="pt-4 text-xs text-gray-400">
              <p>后台不再跨国内版/国际版同步广告、版本和统计数据。</p>
              <p className="mt-1">当前部署只读写 {regionLabel} 对应的数据源与存储。</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">危险区域</CardTitle>
          <CardDescription>以下操作不可撤销，请谨慎操作</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">清空当前区域数据</p>
              <p className="text-sm text-gray-500">仅影响当前后台所连接的广告、版本和文件数据</p>
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
