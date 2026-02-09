import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/admin/session";
import { IS_DOMESTIC_VERSION } from "@/config";
import { isCloudBaseConfigured } from "@/lib/admin/cloudbase-connector";

/**
 * Handle file upload with progress for admin operations
 * Supports both Supabase and CloudBase backends
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin session
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
    const bucket = formData.get("bucket") as string;
    const path = formData.get("path") as string;

    if (!file || !bucket || !path) {
      return NextResponse.json(
        { error: "缺少必要参数" },
        { status: 400 }
      );
    }

    let fileUrl: string | null = null;

    if (IS_DOMESTIC_VERSION && isCloudBaseConfigured()) {
      // CloudBase upload
      const { CloudBaseConnector } = await import("@/lib/admin/cloudbase-connector");
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
        return NextResponse.json(
          { error: "CloudBase 上传失败" },
          { status: 500 }
        );
      }

      fileUrl = uploadResult.fileID;
    } else {
      // Supabase upload
      const { supabaseAdmin } = await import("@/lib/supabase-admin");

      const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .upload(path, file, {
          upsert: true,
        });

      if (error) {
        console.error("Supabase upload error:", error);
        return NextResponse.json(
          { error: "Supabase 上传失败" },
          { status: 500 }
        );
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from(bucket)
        .getPublicUrl(path);

      fileUrl = publicUrlData.publicUrl;
    }

    return NextResponse.json({
      success: true,
      url: fileUrl,
      fileSize: file.size,
    });
  } catch (err) {
    console.error("Upload API error:", err);
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    );
  }
}