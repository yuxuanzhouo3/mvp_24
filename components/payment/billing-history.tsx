"use client";

import { useState, useEffect } from "react";
import { getAuthClient } from "@/lib/auth/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Receipt, Download, RefreshCw, CreditCard, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";

interface BillingRecord {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: "paid" | "pending" | "failed" | "refunded";
  description: string;
  paymentMethod: string;
  invoiceUrl?: string;
}

interface BillingHistoryProps {
  userId: string;
}

export function BillingHistory({ userId }: BillingHistoryProps) {
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { language } = useLanguage();
  const t = useTranslations(language);

  useEffect(() => {
    const fetchBillingHistory = async () => {
      // 如果没有 userId，不发起请求
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // 从 API 获取历史账单（使用认证 token）
        const sessionResult = await getAuthClient().getSession();
        const token = sessionResult.data.session?.access_token;

        const headers: HeadersInit = token
          ? { Authorization: `Bearer ${token}` }
          : {};

        const resp = await fetch(`/api/payment/history?page=1&pageSize=50`, {
          method: "GET",
          headers,
        });

        if (!resp.ok) {
          throw new Error(t.payment.messages.failed);
        }

        const apiData = await resp.json();
        setRecords(apiData.records || []);
        setError(null);
      } catch (err) {
        console.error("Billing history error:", err);
        setError(t.payment.messages.failed);
      } finally {
        setLoading(false);
      }
    };

    fetchBillingHistory();
  }, [userId]);

  const getStatusBadge = (status: BillingRecord["status"]) => {
    const statusConfig = {
      paid: {
        variant: "default" as const,
        text: language === "zh" ? "已支付" : "Paid",
        className: "bg-green-100 text-green-800 hover:bg-green-100",
      },
      pending: {
        variant: "secondary" as const,
        text: language === "zh" ? "待支付" : "Pending",
        className: "bg-orange-100 text-orange-800 hover:bg-orange-100",
      },
      failed: {
        variant: "destructive" as const,
        text: language === "zh" ? "已取消" : "Cancelled",
        className: "bg-gray-100 text-gray-600 hover:bg-gray-100",
      },
      refunded: {
        variant: "outline" as const,
        text: language === "zh" ? "已退款" : "Refunded",
        className: "bg-blue-100 text-blue-800 hover:bg-blue-100",
      },
    };

    const config = statusConfig[status];
    return (
      <Badge variant={config.variant} className={config.className}>
        {config.text}
      </Badge>
    );
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(
      language === "zh" ? "zh-CN" : "en-US",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
      }
    );
  };

  // 取消订单
  const handleCancelOrder = async (recordId: string) => {
    setProcessingId(recordId);
    try {
      const sessionResult = await getAuthClient().getSession();
      const token = sessionResult.data.session?.access_token;

      const response = await fetch(`/api/payment/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ paymentId: recordId }),
      });

      if (!response.ok) {
        throw new Error("Failed to cancel order");
      }

      toast({
        title: t.payment.messages.success,
        description: t.payment.messages.cancelled,
      });

      // 刷新账单列表
      setRecords((prev) =>
        prev.map((r) =>
          r.id === recordId ? { ...r, status: "failed" as const } : r
        )
      );
    } catch (error) {
      console.error("Cancel order error:", error);
      toast({
        title: t.payment.messages.failed,
        description: t.payment.messages.failed,
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
    }
  };

  // 继续支付
  const handleContinuePayment = async (record: BillingRecord) => {
    setProcessingId(record.id);
    try {
      // 尝试获取原支付链接或创建新的支付会话
      const sessionResult = await getAuthClient().getSession();
      const token = sessionResult.data.session?.access_token;

      const response = await fetch(`/api/payment/continue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ paymentId: record.id }),
      });

      if (!response.ok) {
        throw new Error("Failed to continue payment");
      }

      const result = await response.json();

      if (result.paymentUrl) {
        // 跳转到支付页面
        window.location.href = result.paymentUrl;
      } else {
        throw new Error("No payment URL returned");
      }
    } catch (error) {
      console.error("Continue payment error:", error);
      toast({
        title: t.payment.messages.failed,
        description: t.payment.messages.failed,
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            {t.common.loading}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-destructive py-8">{error}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          {language === "zh" ? "账单历史" : "Billing History"}
        </CardTitle>
        <CardDescription>
          {language === "zh"
            ? "查看和管理您的支付记录"
            : "View and manage your payment records"}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {records.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {language === "zh" ? "暂无账单记录" : "No billing records found"}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === "zh" ? "日期" : "Date"}</TableHead>
                <TableHead>
                  {language === "zh" ? "描述" : "Description"}
                </TableHead>
                <TableHead>{language === "zh" ? "金额" : "Amount"}</TableHead>
                <TableHead>
                  {language === "zh" ? "支付方式" : "Payment Method"}
                </TableHead>
                <TableHead>{language === "zh" ? "状态" : "Status"}</TableHead>
                <TableHead>{language === "zh" ? "操作" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>{formatDate(record.date)}</TableCell>
                  <TableCell>{record.description}</TableCell>
                  <TableCell className="font-medium">
                    {formatAmount(record.amount, record.currency)}
                  </TableCell>
                  <TableCell>{record.paymentMethod}</TableCell>
                  <TableCell>{getStatusBadge(record.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {/* 待处理订单显示继续支付和取消按钮 */}
                      {record.status === "pending" && (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleContinuePayment(record)}
                            disabled={processingId === record.id}
                          >
                            <CreditCard className="h-4 w-4 mr-1" />
                            {language === "zh" ? "继续支付" : "Continue"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancelOrder(record.id)}
                            disabled={processingId === record.id}
                          >
                            <X className="h-4 w-4 mr-1" />
                            {language === "zh" ? "取消" : "Cancel"}
                          </Button>
                        </>
                      )}
                      {/* 已支付订单显示发票下载 */}
                      {record.status === "paid" && record.invoiceUrl && (
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={record.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download className="h-4 w-4 mr-1" />
                            {language === "zh" ? "发票" : "Invoice"}
                          </a>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
