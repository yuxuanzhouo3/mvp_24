import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/admin/session";
import { getCurrentAdminDataProvider } from "@/lib/admin/region";
import { CloudBaseConnector } from "@/lib/admin/cloudbase-connector";

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

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const bucket = String(formData.get("bucket") || "");
    const path = String(formData.get("path") || "");

    if (!file || !bucket || !path) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    if (getCurrentAdminDataProvider() === "cloudbase") {
      const connector = new CloudBaseConnector();
      await connector.initialize();
      const app = connector.getApp();
      const buffer = Buffer.from(await file.arrayBuffer());
      const cloudPath = `${bucket}/${path}`;
      const uploadResult = await app.uploadFile({
        cloudPath,
        fileContent: buffer,
      });

      if (!uploadResult.fileID) {
        return NextResponse.json({ error: "CloudBase 上传失败" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        url: uploadResult.fileID,
        fileSize: file.size,
      });
    }

    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    const { error } = await supabaseAdmin.storage.from(bucket).upload(path, file, {
      upsert: true,
    });

    if (error) {
      console.error("Supabase upload error:", error);
      return NextResponse.json({ error: "Supabase 上传失败" }, { status: 500 });
    }

    const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({
      success: true,
      url: data.publicUrl,
      fileSize: file.size,
    });
  } catch (error) {
    console.error("Upload API error:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
