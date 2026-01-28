import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("app_releases")
      .select("platform, variant, version, cloudbase_file_id, download_filename, file_url, file_size")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Active Releases API]", error);
      return NextResponse.json({ success: false, error: "获取版本信息失败" }, { status: 500 });
    }

    const activeMap: Record<string, any> = {};
    let fallbackMacRelease = null;

    (data || []).forEach((release) => {
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
