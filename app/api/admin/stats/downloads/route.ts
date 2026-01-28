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

    const result: any = {
      data: {},
      cn: {},
      intl: {},
      updateTime: now.toISOString(),
    };

    // 查询版本发布信息（Supabase）- INTL 版本
    if (region === "all" || region === "INTL") {
      try {
        console.log("[Stats API] 开始查询 INTL 下载数据");
        
        const { data: releases, error: releaseError } = await supabaseAdmin
          .from("app_releases")
          .select("version, platform, is_active, is_mandatory")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(100);

        console.log("[Stats API] app_releases 查询结果:", { releaseError, releaseCount: releases?.length });

        const activeVersions = releases?.filter((r: any) => r.is_active) || [];
        const mandatoryUpdates = releases?.filter((r: any) => r.is_mandatory) || [];

        // 按平台统计
        const platformDistribution: Record<string, number> = {};
        releases?.forEach((r: any) => {
          const platform = r.platform || "unknown";
          platformDistribution[platform] =
            (platformDistribution[platform] || 0) + 1;
        });

        result.intl = {
          totalVersions: releases?.length || 0,
          activeVersions: activeVersions.length,
          mandatoryUpdates: mandatoryUpdates.length,
          platformDistribution,
          latestVersions: activeVersions.slice(0, 5).map((v: any) => ({
            version: v.version,
            platform: v.platform,
            isMandatory: v.is_mandatory,
          })),
          updateTime: now.toISOString(),
        };
      } catch (err) {
        console.error("[Stats API] INTL 下载数据查询错误:", err);
        result.intl = {
          totalVersions: 0,
          activeVersions: 0,
          mandatoryUpdates: 0,
          platformDistribution: {},
          latestVersions: [],
          error: "无法获取数据",
        };
      }
    }

    // 查询版本发布信息（CloudBase）- CN 版本
    // 注意：CloudBase 中没有 app_releases 集合，该功能仅在 Supabase (INTL) 中可用
    if (region === "all" || region === "CN") {
      result.cn = {
        totalVersions: 0,
        activeVersions: 0,
        mandatoryUpdates: 0,
        platformDistribution: {},
        latestVersions: [],
        updateTime: now.toISOString(),
      };
    }

    // 合计数据
    if (region === "all") {
      const intlPlatforms = result.intl.platformDistribution || {};
      const cnPlatforms = result.cn.platformDistribution || {};
      
      const totalPlatforms: Record<string, number> = {};
      Object.keys({ ...intlPlatforms, ...cnPlatforms }).forEach((key) => {
        totalPlatforms[key] = (intlPlatforms[key] || 0) + (cnPlatforms[key] || 0);
      });

      result.data = {
        totalVersions:
          (result.intl.totalVersions || 0) + (result.cn.totalVersions || 0),
        activeVersions:
          (result.intl.activeVersions || 0) + (result.cn.activeVersions || 0),
        mandatoryUpdates:
          (result.intl.mandatoryUpdates || 0) + (result.cn.mandatoryUpdates || 0),
        platformDistribution: totalPlatforms,
        updateTime: now.toISOString(),
      };
    } else if (region === "INTL") {
      result.data = result.intl;
    } else if (region === "CN") {
      result.data = result.cn;
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[Stats API] 下载统计错误:", err);
    return NextResponse.json(
      { success: false, error: "获取统计数据失败" },
      { status: 500 }
    );
  }
}
