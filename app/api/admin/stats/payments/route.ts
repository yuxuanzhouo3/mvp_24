import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getDatabase } from "@/lib/cloudbase-service";
import { getAdminSession } from "@/lib/admin/session";

export async function GET(req: NextRequest) {
  try {
    // 权限检查
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "未授权访问" },
        { status: 401 }
      );
    }

    // 获取查询参数
    const searchParams = req.nextUrl.searchParams;
    const region = searchParams.get("region") || "all";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const now = new Date();
    const dateStart = startDate
      ? new Date(startDate)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dateEnd = endDate ? new Date(endDate) : now;

    const result: any = {
      data: {},
      cn: {},
      intl: {},
      updateTime: now.toISOString(),
    };

    // 查询 INTL（Supabase）支付数据
    if (region === "all" || region === "INTL") {
      try {
        console.log("[Stats API] 开始查询 INTL 支付数据，日期范围:", dateStart, "到", dateEnd);
        
        // 查询所有支付记录（不限状态）以统计总订单数
        const { data: allPayments, error: paymentError } = await supabaseAdmin
          .from("payments")
          .select("amount, currency, status, payment_method, created_at")
          .gte("created_at", dateStart.toISOString())
          .lte("created_at", dateEnd.toISOString());

        console.log("[Stats API] payments 查询结果:", { paymentError, paymentCount: allPayments?.length });

        const completedPaymentsList = allPayments?.filter((p: any) => p.status === "completed") || [];
        const totalRevenue = completedPaymentsList.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
        const completedPayments = completedPaymentsList.length;
        const totalOrders = allPayments?.length || 0;

        // 按支付方式统计
        const providerDistribution: Record<string, number> = {};
        completedPaymentsList.forEach((p: any) => {
          const provider = p.payment_method || "unknown";
          providerDistribution[provider] = (providerDistribution[provider] || 0) + 1;
        });

        result.intl = {
          totalRevenue: totalRevenue.toFixed(2),
          completedPayments,
          totalOrders,
          providerDistribution,
          updateTime: now.toISOString(),
        };
      } catch (err) {
        console.error("[Stats API] INTL 支付查询错误:", err);
        result.intl = {
          totalRevenue: "0.00",
          completedPayments: 0,
          providerDistribution: {},
          error: "无法获取数据",
        };
      }
    }

    // 查询 CN（CloudBase）支付数据
    if (region === "all" || region === "CN") {
      try {
        const db = getDatabase();
        
        // 尝试从 payments 集合查询支付数据
        try {
          const paymentQuery = await db.collection("payments").get();
          const allPaymentsInRange = (paymentQuery.data || []).filter((p: any) => {
            // 兼容多种时间字段：created_at, createdAt, updated_at, updatedAt
            const timeStr = p.created_at || p.createdAt || p.updated_at || p.updatedAt;
            if (!timeStr) return false;
            const createdAt = new Date(timeStr);
            return createdAt >= dateStart && createdAt <= dateEnd;
          });

          const completedPaymentsList = allPaymentsInRange.filter((p: any) => {
            // 兼容多种完成状态：completed, COMPLETED, SUCCESS
            return p.status === "completed" || 
                   p.status === "COMPLETED" || 
                   p.status === "SUCCESS";
          });

          let totalRevenue = 0;
          const providerDistribution: Record<string, number> = {};

          completedPaymentsList.forEach((p: any) => {
            totalRevenue += parseFloat(p.amount) || 0;
            // 兼容多种支付方式字段：payment_method, method, provider
            const provider = p.payment_method || p.method || p.provider || "unknown";
            providerDistribution[provider] = (providerDistribution[provider] || 0) + 1;
          });

          result.cn = {
            totalRevenue: totalRevenue.toFixed(2),
            completedPayments: completedPaymentsList.length,
            totalOrders: allPaymentsInRange.length,
            providerDistribution,
            updateTime: now.toISOString(),
          };
          
          console.log("[Stats API] CN 支付查询成功:", result.cn);
        } catch (collectionError: any) {
          // 如果集合不存在，返回空结果而不是错误
          if (collectionError?.code === "DATABASE_COLLECTION_NOT_EXIST") {
            console.log("[Stats API] payments 集合不存在，返回空结果");
            result.cn = {
              totalRevenue: "0",
              completedPayments: 0,
              providerDistribution: {},
              updateTime: now.toISOString(),
            };
          } else {
            throw collectionError;
          }
        }
      } catch (err) {
        console.error("[Stats API] CN 支付查询错误:", err);
        result.cn = {
          totalRevenue: "0",
          completedPayments: 0,
          providerDistribution: {},
        };
      }
    }

    // 合计数据
    if (region === "all") {
      const intlRevenue = parseFloat(result.intl.totalRevenue || "0");
      const cnRevenue = parseFloat(result.cn.totalRevenue || "0");
      result.data = {
        totalRevenue: (intlRevenue + cnRevenue).toFixed(2),
        completedPayments: (result.intl.completedPayments || 0) + (result.cn.completedPayments || 0),
        totalOrders: (result.intl.totalOrders || 0) + (result.cn.totalOrders || 0),
        updateTime: now.toISOString(),
      };
    } else if (region === "INTL") {
      result.data = result.intl;
    } else if (region === "CN") {
      result.data = result.cn;
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[Stats API] 支付统计错误:", err);
    return NextResponse.json(
      { success: false, error: "获取统计数据失败" },
      { status: 500 }
    );
  }
}
