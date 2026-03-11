import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CloudBaseConnector } from "@/lib/admin/cloudbase-connector";
import { getCurrentAdminDataProvider } from "@/lib/admin/region";

export const revalidate = 0;
export const dynamic = "force-dynamic";

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

    if (getCurrentAdminDataProvider() === "cloudbase") {
      const connector = new CloudBaseConnector();
      await connector.initialize();
      const db = connector.getClient();
      const conditions: any = { is_active: true };
      if (position) conditions.position = position;
      const result = await db
        .collection("advertisements")
        .where(conditions)
        .orderBy("priority", "desc")
        .orderBy("created_at", "desc")
        .get();
      ads = (result?.data || []).map((ad: any) => ({
        id: ad.id || ad._id || ad._ID || ad.docId,
        title: ad.title,
        position: ad.position,
        media_type: ad.media_type,
        media_url: ad.media_url,
        target_url: ad.target_url || null,
        is_active: Boolean(ad.is_active),
        priority: Number(ad.priority || 0),
        created_at: ad.created_at,
      }));
    } else {
      let query = supabaseAdmin
        .from("advertisements")
        .select("*")
        .eq("is_active", true)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false });
      if (position) {
        query = query.eq("position", position);
      }
      const { data, error } = await query;
      if (error) {
        console.error("[Ads API] Supabase query error:", error);
        ads = [];
      } else {
        ads = (data || []).map((ad: any) => ({
          id: ad.id,
          title: ad.title,
          position: ad.position,
          media_type: ad.media_type,
          media_url: ad.media_url,
          target_url: ad.target_url || null,
          is_active: Boolean(ad.is_active),
          priority: Number(ad.priority || 0),
          created_at: ad.created_at,
        }));
      }
    }

    const response = NextResponse.json({ success: true, data: ads, count: ads.length });
    response.headers.set("Cache-Control", "public, max-age=10, s-maxage=10");
    return response;
  } catch (error) {
    console.error("[Ads API] Unexpected error:", error);
    const response = NextResponse.json(
      { success: false, error: "获取广告失败", data: [] },
      { status: 500 }
    );
    response.headers.set("Cache-Control", "public, max-age=5, s-maxage=5");
    return response;
  }
}
