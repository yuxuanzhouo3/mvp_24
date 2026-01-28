import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminSessionToken } from "@/lib/admin/session";

/**
 * Generate signed upload URL for admin file uploads
 * Uses service role key to create signed URLs for client-side uploads
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

    // Get request body
    const body = await request.json();
    const { bucket, path } = body;

    if (!bucket || !path) {
      return NextResponse.json(
        { error: "缺少必要参数" },
        { status: 400 }
      );
    }

    // Generate signed upload URL (valid for 1 hour)
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUploadUrl(path);

    if (error) {
      console.error("Create signed URL error:", error);
      return NextResponse.json(
        { error: "创建上传链接失败" },
        { status: 500 }
      );
    }

    // Get public URL for the file
    const { data: publicUrlData } = supabaseAdmin.storage
      .from(bucket)
      .getPublicUrl(path);

    return NextResponse.json({
      signedUrl: data.signedUrl,
      publicUrl: publicUrlData.publicUrl,
      token: data.token,
      path: data.path,
    });
  } catch (err) {
    console.error("Upload URL API error:", err);
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    );
  }
}
