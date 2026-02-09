/**
 * 公开的广告 API 端点
 * 获取已启用的广告，供前台展示
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CloudBaseConnector, isCloudBaseConfigured } from "@/lib/admin/cloudbase-connector";
import { IS_DOMESTIC_VERSION } from "@/config";

export const revalidate = 0; // 禁用 ISR，每次都从数据库读取最新数据
export const dynamic = 'force-dynamic'; // 强制动态渲染

interface Advertisement {
  id: string;
  title: string;
  position: "top" | "bottom" | "left" | "right" | "sidebar" | "bottom-left" | "bottom-right";
  media_type: "image" | "video";
  media_url: string;
  target_url: string | null;
  is_active: boolean;
  priority: number;
  created_at: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const position = searchParams.get("position");

    let ads: Advertisement[] = [];

    if (IS_DOMESTIC_VERSION && isCloudBaseConfigured()) {
      // 国内版从 CloudBase 读取
      try {
        const connector = new CloudBaseConnector();
        await connector.initialize();
        const db = connector.getClient();
        
        // 构建查询条件
        const conditions: any = { is_active: true };
        if (position) {
          conditions.position = position;
        }
        
        const query = db.collection("advertisements")
          .where(conditions)
          .orderBy("priority", "desc")
          .orderBy("created_at", "desc");
        
        const result = await query.get();
        ads = (result.data || []).map((ad: any) => ({
          id: ad.id || ad._id || ad._ID || ad.docId, // 处理 CloudBase 可能返回不同名称的 ID
          title: ad.title,
          position: ad.position,
          media_type: ad.media_type,
          media_url: ad.media_url,
          target_url: ad.target_url || null,
          is_active: ad.is_active,
          priority: ad.priority || 0,
          created_at: ad.created_at,
        }));
        console.log(`[Ads API] CloudBase query returned ${ads.length} active ads for position: ${position || 'all'}`);
      } catch (err) {
        console.error("[Ads API] CloudBase query error:", err);
        // 失败时返回空列表
        ads = [];
      }
    } else {
      // 国际版从 Supabase 读取
      let query = supabaseAdmin
        .from("advertisements")
        .select("*")
        .eq("is_active", true)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false });

      if (position) {
        query = query.eq("position", position);
      }

      const { data: supaData, error } = await query;

      if (error) {
        console.error("[Ads API] Supabase query error:", error);
        // 失败时返回空列表
        ads = [];
      } else {
        ads = (supaData || []).map((ad: any) => ({
          id: ad.id,
          title: ad.title,
          position: ad.position,
          media_type: ad.media_type,
          media_url: ad.media_url,
          target_url: ad.target_url || null,
          is_active: ad.is_active,
          priority: ad.priority || 0,
          created_at: ad.created_at,
        }));
      }
    }

    const response = NextResponse.json({
      success: true,
      data: ads,
      count: ads.length,
    });
    
    // 添加 Cache-Control 头，允许浏览器最多缓存 10 秒
    response.headers.set("Cache-Control", "public, max-age=10, s-maxage=10");
    return response;
  } catch (err) {
    console.error("[Ads API] Unexpected error:", err);
    const errorResponse = NextResponse.json(
      {
        success: false,
        error: "获取广告失败",
        data: [],
      },
      { status: 500 }
    );
    errorResponse.headers.set("Cache-Control", "public, max-age=5, s-maxage=5");
    return errorResponse;
  }
}
