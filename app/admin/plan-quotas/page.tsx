"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RefreshCw, Save } from "lucide-react";

interface PlanQuotaSettings {
  planId: "free" | "basic" | "pro" | "enterprise";
  tokenLimit: number;
  imageLimit: number;
  videoAudioLimit: number;
  updatedAt?: string | null;
}

const PLAN_LABELS: Record<PlanQuotaSettings["planId"], { label: string; tone: string }> = {
  free: { label: "免费版", tone: "secondary" },
  basic: { label: "基础版", tone: "outline" },
  pro: { label: "专业版", tone: "default" },
  enterprise: { label: "企业版", tone: "secondary" },
};

function toNumber(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

export default function PlanQuotasPage() {
  const [rows, setRows] = useState<PlanQuotaSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const planOrder = useMemo(
    () => ["free", "basic", "pro", "enterprise"] as const,
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/admin/plan-quotas", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "加载失败");
      }
      setRows(Array.isArray(data?.data) ? data.data : []);
    } catch (err: any) {
      setError(err?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleChange = (
    planId: PlanQuotaSettings["planId"],
    key: "tokenLimit" | "imageLimit" | "videoAudioLimit",
    value: string
  ) => {
    setRows((prev) =>
      prev.map((row) =>
        row.planId === planId
          ? {
              ...row,
              [key]: toNumber(value),
            }
          : row
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/admin/plan-quotas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: rows }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "保存失败");
      }
      setRows(Array.isArray(data?.data) ? data.data : rows);
      setSuccess("已保存并立即生效");
    } catch (err: any) {
      setError(err?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const orderedRows = useMemo(() => {
    const map = new Map(rows.map((row) => [row.planId, row]));
    return planOrder
      .map((planId) => map.get(planId))
      .filter(Boolean) as PlanQuotaSettings[];
  }, [planOrder, rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">套餐限额</h1>
          <p className="text-gray-500">修改后立即生效，已消耗额度不会回退</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || rows.length === 0}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>操作失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertTitle>操作成功</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>套餐额度配置</CardTitle>
          <CardDescription>
            对话 Token 为月度上限；视频与音频共享同一额度。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>套餐</TableHead>
                <TableHead>对话 Token / 月</TableHead>
                <TableHead>图片次数 / 月</TableHead>
                <TableHead>视频/音频次数 / 月</TableHead>
                <TableHead>最近更新</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderedRows.map((row) => {
                const meta = PLAN_LABELS[row.planId];
                return (
                  <TableRow key={row.planId}>
                    <TableCell>
                      <Badge variant={meta.tone as any}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={row.tokenLimit}
                        onChange={(e) =>
                          handleChange(row.planId, "tokenLimit", e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={row.imageLimit}
                        onChange={(e) =>
                          handleChange(row.planId, "imageLimit", e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={row.videoAudioLimit}
                        onChange={(e) =>
                          handleChange(
                            row.planId,
                            "videoAudioLimit",
                            e.target.value
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "-"}
                    </TableCell>
                  </TableRow>
                );
              })}

              {!loading && orderedRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-gray-500">
                    暂无数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
