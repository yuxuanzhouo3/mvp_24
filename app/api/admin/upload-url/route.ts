import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminSessionToken } from "@/lib/admin/session";
import { getCurrentAdminDataProvider } from "@/lib/admin/region";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("admin_session")?.value;
    if (!token) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const session = verifyAdminSessionToken(token);
    if (!session) {
      return NextResponse.json({ error: "会话已过期" }, { status: 401 });
    }

    if (getCurrentAdminDataProvider() !== "supabase") {
      return NextResponse.json(
        { error: "当前后台仅允许国内版直传，不提供 Supabase 签名上传链接" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const bucket = String(body?.bucket || "");
    const path = String(body?.path || "");
    if (!bucket || !path) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUploadUrl(path);

    if (error) {
      console.error("Create signed URL error:", error);
      return NextResponse.json({ error: "创建上传链接失败" }, { status: 500 });
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({
      signedUrl: data.signedUrl,
      publicUrl: publicUrlData.publicUrl,
      token: data.token,
      path: data.path,
    });
  } catch (error) {
    console.error("Upload URL API error:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
