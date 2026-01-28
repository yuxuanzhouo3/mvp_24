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

    // 查询 INTL（Supabase）订阅数据
    if (region === "all" || region === "INTL") {
      try {
        console.log("[Stats API] 开始查询 INTL 订阅数据，日期范围:", dateStart, "到", dateEnd);
        
        const { data: subscriptions, error: subError } = await supabaseAdmin
          .from("subscriptions")
          .select("plan_id, status, created_at")
          .gte("created_at", dateStart.toISOString())
          .lte("created_at", dateEnd.toISOString());

        console.log("[Stats API] subscriptions 查询结果:", { subError, subCount: subscriptions?.length });

        const activeSubscriptions = subscriptions?.filter(
          (s: any) => s.status === "active"
        ) || [];

        // 按 plan 分布
        const planDistribution: Record<string, number> = {};
        subscriptions?.forEach((s: any) => {
          const plan = s.plan_id || "free";
          planDistribution[plan] = (planDistribution[plan] || 0) + 1;
        });

        result.intl = {
          totalSubscriptions: subscriptions?.length || 0,
          activeSubscriptions: activeSubscriptions.length,
          planDistribution,
          updateTime: now.toISOString(),
        };
      } catch (err) {
        console.error("[Stats API] INTL 订阅查询错误:", err);
        result.intl = {
          totalSubscriptions: 0,
          activeSubscriptions: 0,
          planDistribution: {},
          error: "无法获取数据",
        };
      }
    }

    // 查询 CN（CloudBase）订阅数据
    if (region === "all" || region === "CN") {
      try {
        const db = getDatabase();
        
        // 尝试从 subscriptions 集合查询
        try {
          const subscriptionQuery = await db.collection("subscriptions").get();
          const subscriptions = (subscriptionQuery.data || []).filter((s: any) => {
            const createdAt = new Date(s.created_at || s.createdAt);
            return createdAt >= dateStart && createdAt <= dateEnd;
          });

          const activeSubscriptions = subscriptions.filter(
            (s: any) => s.status === "active"
          );

          // 按 plan 分布
          const planDistribution: Record<string, number> = {};
          subscriptions.forEach((s: any) => {
            const plan = s.plan || "free";
            planDistribution[plan] = (planDistribution[plan] || 0) + 1;
          });

          result.cn = {
            totalSubscriptions: subscriptions.length,
            activeSubscriptions: activeSubscriptions.length,
            planDistribution,
            updateTime: now.toISOString(),
          };
          
          console.log("[Stats API] CN 订阅查询成功:", result.cn);
        } catch (collectionError: any) {
          // 如果集合不存在，返回空结果而不是错误
          if (collectionError?.code === "DATABASE_COLLECTION_NOT_EXIST") {
            console.log("[Stats API] subscriptions 集合不存在，返回空结果");
            result.cn = {
              totalSubscriptions: 0,
              activeSubscriptions: 0,
              planDistribution: {},
              updateTime: now.toISOString(),
            };
          } else {
            throw collectionError;
          }
        }
      } catch (err) {
        console.error("[Stats API] CN 订阅查询错误:", err);
        result.cn = {
          totalSubscriptions: 0,
          activeSubscriptions: 0,
          planDistribution: {},
        };
      }
    }

    // 合计数据
    if (region === "all") {
      result.data = {
        totalSubscriptions:
          (result.intl.totalSubscriptions || 0) + (result.cn.totalSubscriptions || 0),
        activeSubscriptions:
          (result.intl.activeSubscriptions || 0) + (result.cn.activeSubscriptions || 0),
        updateTime: now.toISOString(),
      };
    } else if (region === "INTL") {
      result.data = result.intl;
    } else if (region === "CN") {
      result.data = result.cn;
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[Stats API] 订阅统计错误:", err);
    return NextResponse.json(
      { success: false, error: "获取统计数据失败" },
      { status: 500 }
    );
  }
}
