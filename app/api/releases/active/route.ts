import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { IS_DOMESTIC_VERSION } from "@/config";
import { CloudBaseConnector, isCloudBaseConfigured } from "@/lib/admin/cloudbase-connector";

export const runtime = "nodejs";

export async function GET() {
  try {
    let data: any[] = [];

    if (IS_DOMESTIC_VERSION && isCloudBaseConfigured()) {
      // 国内版从 CloudBase 读取
      const connector = new CloudBaseConnector();
      await connector.initialize();
      const db = connector.getClient();

      const result = await db.collection("app_releases")
        .where({
          is_active: true
        })
        .orderBy("created_at", "desc")
        .get();

      data = result.data || [];
    } else {
      // 国际版从 Supabase 读取
      const { data: supaData, error } = await supabaseAdmin
        .from("app_releases")
        .select("platform, variant, version, cloudbase_file_id, download_filename, file_url, file_size")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[Active Releases API]", error);
        return NextResponse.json({ success: false, error: "获取版本信息失败" }, { status: 500 });
      }

      data = supaData || [];
    }

    const activeMap: Record<string, any> = {};
    let fallbackMacRelease: Record<string, any> | null = null;

    const normalizeCloudbaseFileId = (release: any) => {
      if (!release) return release;
      if (!release.cloudbase_file_id && release.file_url && !/^https?:\/\//.test(release.file_url)) {
        release.cloudbase_file_id = release.file_url;
      }
      return release;
    };

    data.forEach((release) => {
      normalizeCloudbaseFileId(release);
      if (release.platform === "macos") {
        if (release.variant === "apple-silicon") {
          if (!activeMap.macos) {
            activeMap.macos = release;
          }
          return;
        }

        if (!fallbackMacRelease) {
          fallbackMacRelease = release;
        }

        return;
      }

      if (!activeMap[release.platform]) {
        activeMap[release.platform] = release;
      }
    });

    if (!activeMap.macos && fallbackMacRelease) {
      activeMap.macos = fallbackMacRelease;
    }

    return NextResponse.json({ success: true, releases: Object.values(activeMap) });
  } catch (err) {
    console.error("[Active Releases API]", err);
    return NextResponse.json({ success: false, error: "获取版本信息失败" }, { status: 500 });
  }
}
