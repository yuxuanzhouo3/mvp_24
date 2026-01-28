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
    const region = searchParams.get("region") || "all"; // all, CN, INTL
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const now = new Date();
    const dateStart = startDate
      ? new Date(startDate)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 默认 30 天
    const dateEnd = endDate ? new Date(endDate) : now;

    const result: any = {
      data: {},
      cn: {},
      intl: {},
      updateTime: now.toISOString(),
    };

    // 查询 INTL（Supabase）用户数据
    if (region === "all" || region === "INTL") {
      try {
        console.log("[Stats API] 开始查询 INTL 用户数据，日期范围:", dateStart, "到", dateEnd);
        
        // 使用 auth.admin.listUsers() 获取所有用户，因为 user_profiles 表已被移除
        const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();

        console.log("[Stats API] auth.users 查询结果:", { usersError, userCount: users?.length });

        if (!usersError && users) {
          // 过滤指定日期范围内创建的用户
          const usersInRange = users.filter((user: any) => {
            const createdAt = new Date(user.created_at);
            return createdAt >= dateStart && createdAt <= dateEnd;
          });

          // 获取活跃用户数（有会话记录）
          // 注意：这里我们查询 gpt_sessions 表中在日期范围内的记录
          const { data: activeSessions, error: activeError } = await supabaseAdmin
            .from("gpt_sessions")
            .select("user_id")
            .gte("created_at", dateStart.toISOString())
            .lte("created_at", dateEnd.toISOString());

          console.log("[Stats API] gpt_sessions 查询结果:", { activeError, sessionCount: activeSessions?.length });

          // 统计唯一活跃用户
          const activeUserIds = new Set(activeSessions?.map((s: any) => s.user_id) || []);

          result.intl = {
            totalUsers: users.length,
            activeUsers: activeUserIds.size,
            newUsers: usersInRange.length,
            updateTime: now.toISOString(),
          };
        } else {
          // 如果没有用户，也返回默认结构
          result.intl = {
            totalUsers: 0,
            activeUsers: 0,
            newUsers: 0,
            updateTime: now.toISOString(),
          };
        }
      } catch (err) {
        console.error("[Stats API] INTL 用户查询错误:", err);
        result.intl = {
          totalUsers: 0,
          activeUsers: 0,
          newUsers: 0,
          error: "无法获取数据",
        };
      }
    }

    // 查询 CN（CloudBase）用户数据
    if (region === "all" || region === "CN") {
      try {
        const db = getDatabase();
        
        // 查询所有用户
        const userQuery = await db.collection("web_users").get();
        const allUsers = userQuery.data || [];
        
        // 过滤指定日期范围内创建的用户
        const usersInRange = allUsers.filter((user: any) => {
          const createdAt = new Date(user.createdAt || user.created_at || user.updatedAt);
          return createdAt >= dateStart && createdAt <= dateEnd;
        });

        // 获取活跃用户数（有对话记录）
        const conversationQuery = await db.collection("ai_conversations").get();
        const conversations = conversationQuery.data || [];
        const activeUserIds = new Set(conversations.map((c: any) => c.user_id));

        result.cn = {
          totalUsers: allUsers.length,
          activeUsers: activeUserIds.size,
          newUsers: usersInRange.length,
          updateTime: now.toISOString(),
        };
        
        console.log("[Stats API] CN 用户查询成功:", result.cn);
      } catch (err) {
        console.error("[Stats API] CN 用户查询错误:", err);
        result.cn = {
          totalUsers: 0,
          activeUsers: 0,
          newUsers: 0,
          error: "无法获取数据",
        };
      }
    }

    // 合计数据
    if (region === "all") {
      result.data = {
        totalUsers:
          (result.intl.totalUsers || 0) + (result.cn.totalUsers || 0),
        activeUsers:
          (result.intl.activeUsers || 0) + (result.cn.activeUsers || 0),
        newUsers: (result.intl.newUsers || 0) + (result.cn.newUsers || 0),
        updateTime: now.toISOString(),
      };
    } else if (region === "INTL") {
      result.data = result.intl;
    } else if (region === "CN") {
      result.data = result.cn;
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[Stats API] 用户统计错误:", err);
    return NextResponse.json(
      { success: false, error: "获取统计数据失败" },
      { status: 500 }
    );
  }
}
