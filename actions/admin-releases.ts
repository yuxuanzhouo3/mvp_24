"use server";

/**
 * 发布版本管理 Server Actions
 * 实现双端同步：Supabase (国际版) + CloudBase (国内版)
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import { CloudBaseConnector, isCloudBaseConfigured } from "@/lib/admin/cloudbase-connector";
import { getAdminSession } from "@/lib/admin/session";
import { revalidatePath } from "next/cache";

// 平台类型
export type Platform = "ios" | "android" | "windows" | "macos" | "linux";

// 变体/架构类型
export type Variant =
  | "x64"
  | "x86"
  | "arm64"
  | "intel"
  | "m"
  | "deb"
  | "rpm"
  | "appimage"
  | "snap"
  | "flatpak"
  | "aur"
  | "apple-silicon";

// 发布版本类型定义
export interface AppRelease {
  id: string;
  version: string;
  platform: Platform;
  variant: Variant | null;
  file_url: string;
  file_size: number | null;
  release_notes: string | null;
  is_active: boolean;
  is_mandatory: boolean;
  source: "supabase" | "cloudbase" | "both";
  cloudbase_file_id?: string | null;
  download_filename?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateReleaseResult {
  success: boolean;
  error?: string;
  data?: AppRelease;
}

export interface UpdateReleaseResult {
  success: boolean;
  error?: string;
}

export interface DeleteReleaseResult {
  success: boolean;
  error?: string;
}

export interface ListReleasesResult {
  success: boolean;
  error?: string;
  data?: AppRelease[];
}

/**
 * 验证管理员权限
 */
async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) {
    throw new Error("未授权访问");
  }
  return session;
}

async function deactivateOtherReleases(platform: Platform, variant: Variant | null) {
  const query = supabaseAdmin.from("app_releases").update({ is_active: false }).eq("platform", platform);
  if (variant) {
    query.eq("variant", variant);
  } else {
    query.is("variant", null);
  }
  await query;
}

/**
 * 获取 CloudBase 客户端
 */
async function getCloudBase() {
  const connector = new CloudBaseConnector();
  await connector.initialize();
  return {
    db: connector.getClient(),
    app: connector.getApp(),
  };
}

/**
 * 上传文件到 Supabase Storage
 */
async function uploadToSupabase(
  file: File,
  fileName: string
): Promise<string | null> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error } = await supabaseAdmin.storage
      .from("releases")
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (error) {
      console.error("Supabase upload error:", error);
      return null;
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("releases")
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (err) {
    console.error("Supabase upload exception:", err);
    return null;
  }
}

/**
 * 上传文件到 CloudBase Storage
 */
async function uploadToCloudBase(
  file: File,
  fileName: string
): Promise<string | null> {
  if (!isCloudBaseConfigured()) {
    return null;
  }

  try {
    const { app } = await getCloudBase();
    const buffer = Buffer.from(await file.arrayBuffer());
    const cloudPath = `releases/${fileName}`;

    const uploadResult = await app.uploadFile({
      cloudPath,
      fileContent: buffer,
    });

    if (!uploadResult.fileID) {
      console.error("CloudBase upload failed");
      return null;
    }

    return uploadResult.fileID;
  } catch (err) {
    console.error("CloudBase upload exception:", err);
    return null;
  }
}

/**
 * 创建发布版本（使用客户端预上传的文件URL）
 * 文件已在客户端直接上传到 Supabase Storage，绕过 Server Action body size 限制
 */
export async function createReleaseWithUrl(
  data: {
    version: string;
    platform: Platform;
    variant: Variant | null;
    releaseNotes: string | null;
    isActive: boolean;
    isMandatory: boolean;
    fileUrl: string;
    fileSize: number;
    uploadTarget?: "supabase" | "both";
    cloudbaseFileId?: string | null;
  }
): Promise<CreateReleaseResult> {
  try {
    await requireAdmin();

    const { version, platform, variant, releaseNotes, isActive, isMandatory, fileUrl, fileSize, uploadTarget = "supabase" } = data;
    const normalizedVariant = platform === "macos" ? ("apple-silicon" as Variant) : variant;
    const cloudbaseFileId = data.cloudbaseFileId || (fileUrl.startsWith("cloud://") ? fileUrl : null);
    const downloadFilename = deriveDownloadFilename(fileUrl);

    if (!version || !platform) {
      return { success: false, error: "请填写必要字段" };
    }

    if (!fileUrl) {
      return { success: false, error: "文件上传失败" };
    }

    // 确定来源
    const source = uploadTarget === "both" && isCloudBaseConfigured() ? "both" : "supabase";

    await deactivateOtherReleases(platform, normalizedVariant);

    // 插入数据库记录
    const { data: release, error } = await supabaseAdmin
      .from("app_releases")
      .insert({
        version,
        platform,
        variant: normalizedVariant || null,
        file_url: fileUrl,
        file_size: fileSize,
        release_notes: releaseNotes || null,
        is_active: isActive,
        is_mandatory: isMandatory,
        source,
        cloudbase_file_id: cloudbaseFileId,
        download_filename: downloadFilename,
      })
      .select()
      .single();

    if (error) {
      console.error("Insert release error:", error);
      return { success: false, error: "创建版本失败" };
    }

    // 同步到 CloudBase（如果选择双端且配置了）
    if (uploadTarget === "both" && isCloudBaseConfigured()) {
      try {
        const { db } = await getCloudBase();
        await db.collection("app_releases").add({
          ...release,
          supabase_url: fileUrl,
        });
      } catch (err) {
        console.error("CloudBase sync error:", err);
      }
    }

    revalidatePath("/admin/releases");
    return { success: true, data: release };
  } catch (err) {
    console.error("Create release error:", err);
    return { success: false, error: "创建版本失败" };
  }
}

/**
 * 创建发布版本（通过 Server Action 上传，有 body size 限制）
 * @deprecated 推荐使用 createReleaseWithUrl，支持大文件上传
 */
export async function createRelease(
  formData: FormData
): Promise<CreateReleaseResult> {
  try {
    await requireAdmin();

    const version = formData.get("version") as string;
    const platform = formData.get("platform") as Platform;
    const rawVariant = formData.get("variant") as Variant | null;
    const releaseNotes = formData.get("releaseNotes") as string;
    const isActive = formData.get("isActive") === "true";
    const isMandatory = formData.get("isMandatory") === "true";
    const file = formData.get("file") as File;
    const uploadTarget = (formData.get("uploadTarget") as string) || "both";
    const variant = platform === "macos" ? ("apple-silicon" as Variant) : rawVariant;

    if (!version || !platform) {
      return { success: false, error: "请填写必要字段" };
    }

    if (!file || file.size === 0) {
      return { success: false, error: "请上传安装包文件" };
    }

    // 生成文件名
    const ext = file.name.split(".").pop();
    const fileName = `${platform}-${variant || "default"}-${version}.${ext}`;

    let supabaseUrl: string | null = null;
    let cloudbaseFileId: string | null = null;

    if (uploadTarget === "supabase" || uploadTarget === "both") {
      supabaseUrl = await uploadToSupabase(file, fileName);
    }

    if (uploadTarget === "cloudbase" || uploadTarget === "both") {
      cloudbaseFileId = await uploadToCloudBase(file, fileName);
    }

    const fileUrl = supabaseUrl || cloudbaseFileId;
    if (!fileUrl) {
      return { success: false, error: "文件上传失败" };
    }

    let source: "supabase" | "cloudbase" | "both" = "supabase";
    if (supabaseUrl && cloudbaseFileId) {
      source = "both";
    } else if (cloudbaseFileId) {
      source = "cloudbase";
    }

    await deactivateOtherReleases(platform, variant);

    const downloadFilename = deriveDownloadFilename(file.name);

    const { data, error } = await supabaseAdmin
      .from("app_releases")
      .insert({
        version,
        platform,
        variant: variant || null,
        file_url: fileUrl,
        file_size: file.size,
        release_notes: releaseNotes || null,
        is_active: isActive,
        is_mandatory: isMandatory,
        source,
        cloudbase_file_id: cloudbaseFileId,
        download_filename: downloadFilename,
      })
      .select()
      .single();

    if (error) {
      console.error("Insert release error:", error);
      return { success: false, error: "创建版本失败" };
    }

    // 同步到 CloudBase
    if (isCloudBaseConfigured() && (uploadTarget === "cloudbase" || uploadTarget === "both")) {
      try {
        const { db } = await getCloudBase();
        await db.collection("app_releases").add({
          ...data,
          cloudbase_file_id: cloudbaseFileId,
        });
      } catch (err) {
        console.error("CloudBase sync error:", err);
      }
    }

    revalidatePath("/admin/releases");
    return { success: true, data };
  } catch (err) {
    console.error("Create release error:", err);
    return { success: false, error: "创建版本失败" };
  }
}

/**
 * 获取版本列表
 */
export async function listReleases(): Promise<ListReleasesResult> {
  try {
    await requireAdmin();

    const { data, error } = await supabaseAdmin
      .from("app_releases")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("List releases error:", error);
      return { success: false, error: "获取版本列表失败" };
    }

    return { success: true, data: data || [] };
  } catch (err) {
    console.error("List releases error:", err);
    return { success: false, error: "获取版本列表失败" };
  }
}

/**
 * 更新版本
 */
export async function updateRelease(
  id: string,
  formData: FormData
): Promise<UpdateReleaseResult> {
  try {
    await requireAdmin();

    const releaseNotes = formData.get("releaseNotes") as string;
    const isActive = formData.get("isActive") === "true";
    const isMandatory = formData.get("isMandatory") === "true";

    const { error } = await supabaseAdmin
      .from("app_releases")
      .update({
        release_notes: releaseNotes || null,
        is_active: isActive,
        is_mandatory: isMandatory,
      })
      .eq("id", id);

    if (error) {
      console.error("Update release error:", error);
      return { success: false, error: "更新版本失败" };
    }

    revalidatePath("/admin/releases");
    return { success: true };
  } catch (err) {
    console.error("Update release error:", err);
    return { success: false, error: "更新版本失败" };
  }
}

/**
 * 切换版本状态
 */
export async function toggleReleaseStatus(
  id: string,
  isActive: boolean
): Promise<UpdateReleaseResult> {
  try {
    await requireAdmin();

    const { error } = await supabaseAdmin
      .from("app_releases")
      .update({ is_active: isActive })
      .eq("id", id);

    if (error) {
      return { success: false, error: "切换状态失败" };
    }

    revalidatePath("/admin/releases");
    return { success: true };
  } catch (err) {
    console.error("Toggle release status error:", err);
    return { success: false, error: "切换状态失败" };
  }
}

/**
 * 删除版本
 */
export async function deleteRelease(id: string): Promise<DeleteReleaseResult> {
  try {
    await requireAdmin();

    const { data: release, error: fetchError } = await supabaseAdmin
      .from("app_releases")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !release) {
      return { success: false, error: "版本不存在" };
    }

    // 删除存储文件
    if (release.file_url) {
      try {
        const fileName = release.file_url.split("/").pop();
        if (fileName) {
          await supabaseAdmin.storage.from("releases").remove([fileName]);
        }
      } catch (err) {
        console.error("Delete storage file error:", err);
      }
    }

    // 删除数据库记录
    const { error } = await supabaseAdmin
      .from("app_releases")
      .delete()
      .eq("id", id);

    if (error) {
      return { success: false, error: "删除版本失败" };
    }

    // 同步删除 CloudBase
    if (isCloudBaseConfigured()) {
      try {
        const { db } = await getCloudBase();
        await db.collection("app_releases").where({ id }).remove();
      } catch (err) {
        console.error("CloudBase delete error:", err);
      }
    }

    revalidatePath("/admin/releases");
    return { success: true };
  } catch (err) {
    console.error("Delete release error:", err);
    return { success: false, error: "删除版本失败" };
  }
}

/**
 * 获取当前平台的有效版本
 */
export async function getActiveRelease(
  platform: Platform,
  variant?: Variant | null
): Promise<AppRelease | null> {
  try {
    let query = supabaseAdmin
      .from("app_releases")
      .select("*")
      .eq("platform", platform)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);

    if (variant) {
      query = query.eq("variant", variant);
    } else {
      query = query.is("variant", null);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("Get active release error:", error);
      return null;
    }

    return data;
  } catch (err) {
    console.error("Get active release error:", err);
    return null;
  }
}

function deriveDownloadFilename(fileUrl: string, fallback?: string): string {
  if (!fileUrl) return fallback || "download.bin";
  const cleaned = fileUrl.split("?")[0];
  const parts = cleaned.split("/");
  const name = parts.pop() || fallback;
  return name || "download.bin";
}


/**
 * 获取最新版本
 */
export async function getLatestRelease(
  platform: Platform,
  variant?: Variant
): Promise<AppRelease | null> {
  try {
    let query = supabaseAdmin
      .from("app_releases")
      .select("*")
      .eq("platform", platform)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);

    if (variant) {
      query = query.eq("variant", variant);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("Get latest release error:", error);
      return null;
    }

    return data;
  } catch (err) {
    console.error("Get latest release error:", err);
    return null;
  }
}
