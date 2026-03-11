"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  CloudBaseConnector,
  isCloudBaseConfigured,
} from "@/lib/admin/cloudbase-connector";
import { getAdminSession } from "@/lib/admin/session";
import { getCurrentAdminDataProvider } from "@/lib/admin/region";

export type Platform = "ios" | "android" | "windows" | "macos" | "linux";

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

const COLLECTION = "app_releases";
const STORAGE_BUCKET = "releases";

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) {
    throw new Error("未授权访问");
  }
  return session;
}

function shouldUseCloudBaseBackend(): boolean {
  return getCurrentAdminDataProvider() === "cloudbase";
}

function getCurrentSource(): "supabase" | "cloudbase" {
  return shouldUseCloudBaseBackend() ? "cloudbase" : "supabase";
}

async function getCloudBase() {
  if (!isCloudBaseConfigured()) {
    throw new Error("CloudBase 未配置，当前国内版后台无法访问数据");
  }
  const connector = new CloudBaseConnector();
  await connector.initialize();
  return {
    db: connector.getClient(),
    app: connector.getApp(),
  };
}

function normalizeRelease(record: any): AppRelease {
  return {
    id: record?.id || record?._id || record?._ID || record?.docId,
    version: record?.version || "",
    platform: record?.platform,
    variant: record?.variant || null,
    file_url: record?.file_url || "",
    file_size:
      typeof record?.file_size === "number" ? record.file_size : null,
    release_notes: record?.release_notes || null,
    is_active: Boolean(record?.is_active),
    is_mandatory: Boolean(record?.is_mandatory),
    source: (record?.source || getCurrentSource()) as AppRelease["source"],
    cloudbase_file_id: record?.cloudbase_file_id || null,
    download_filename: record?.download_filename || null,
    created_at: record?.created_at || new Date().toISOString(),
    updated_at: record?.updated_at || record?.created_at || new Date().toISOString(),
  };
}

async function findCloudBaseRelease(id: string): Promise<any | null> {
  const { db } = await getCloudBase();
  let result = await db.collection(COLLECTION).where({ _id: id }).limit(1).get();
  if (result?.data?.length) return result.data[0];
  result = await db.collection(COLLECTION).where({ id }).limit(1).get();
  return result?.data?.[0] || null;
}

async function updateCloudBaseRelease(id: string, data: Record<string, unknown>) {
  const { db } = await getCloudBase();
  try {
    await db.collection(COLLECTION).doc(id).update(data);
    return;
  } catch {}

  let result = await db.collection(COLLECTION).where({ _id: id }).limit(1).get();
  if (result?.data?.length) {
    await db.collection(COLLECTION).doc(result.data[0]._id).update(data);
    return;
  }

  result = await db.collection(COLLECTION).where({ id }).limit(1).get();
  if (result?.data?.length) {
    await db.collection(COLLECTION).doc(result.data[0]._id).update(data);
    return;
  }

  throw new Error("版本不存在");
}

async function removeCloudBaseRelease(id: string) {
  const { db } = await getCloudBase();
  try {
    await db.collection(COLLECTION).doc(id).remove();
    return;
  } catch {}

  let result = await db.collection(COLLECTION).where({ _id: id }).limit(1).get();
  if (result?.data?.length) {
    await db.collection(COLLECTION).doc(result.data[0]._id).remove();
    return;
  }

  result = await db.collection(COLLECTION).where({ id }).limit(1).get();
  if (result?.data?.length) {
    await db.collection(COLLECTION).doc(result.data[0]._id).remove();
    return;
  }

  throw new Error("版本不存在");
}

async function deactivateOtherReleases(platform: Platform, variant: Variant | null) {
  if (shouldUseCloudBaseBackend()) {
    const { db } = await getCloudBase();
    const condition: Record<string, unknown> = {
      platform,
      is_active: true,
      variant: variant || null,
    };
    const result = await db.collection(COLLECTION).where(condition).get();
    await Promise.all(
      (result?.data || []).map((item: any) =>
        db.collection(COLLECTION).doc(item._id).update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
      )
    );
    return;
  }

  let query = supabaseAdmin
    .from(COLLECTION)
    .update({ is_active: false })
    .eq("platform", platform);

  query = variant ? query.eq("variant", variant) : query.is("variant", null);
  await query.eq("is_active", true);
}

async function uploadToSupabase(file: File, fileName: string): Promise<string | null> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (error) {
      console.error("Supabase upload error:", error);
      return null;
    }

    const { data } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
    return data.publicUrl;
  } catch (error) {
    console.error("Supabase upload exception:", error);
    return null;
  }
}

async function uploadToCloudBase(file: File, fileName: string): Promise<string | null> {
  try {
    const { app } = await getCloudBase();
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await app.uploadFile({
      cloudPath: `${STORAGE_BUCKET}/${fileName}`,
      fileContent: buffer,
    });
    return result?.fileID || null;
  } catch (error) {
    console.error("CloudBase upload exception:", error);
    return null;
  }
}

export async function createReleaseWithUrl(data: {
  version: string;
  platform: Platform;
  variant: Variant | null;
  releaseNotes: string | null;
  isActive: boolean;
  isMandatory: boolean;
  fileUrl: string;
  fileSize: number;
  cloudbaseFileId?: string | null;
}): Promise<CreateReleaseResult> {
  try {
    await requireAdmin();

    const { version, platform, releaseNotes, isActive, isMandatory, fileUrl, fileSize } = data;
    const variant = platform === "macos" ? ("apple-silicon" as Variant) : data.variant;
    const cloudbaseFileId = data.cloudbaseFileId || (fileUrl.startsWith("cloud://") ? fileUrl : null);
    const downloadFilename = deriveDownloadFilename(fileUrl);

    if (!version || !platform || !fileUrl) {
      return { success: false, error: "请填写必要字段" };
    }

    if (isActive) {
      await deactivateOtherReleases(platform, variant);
    }

    const source = getCurrentSource();
    const now = new Date().toISOString();

    if (shouldUseCloudBaseBackend()) {
      const { db } = await getCloudBase();
      const payload = {
        version,
        platform,
        variant: variant || null,
        file_url: fileUrl,
        file_size: fileSize,
        release_notes: releaseNotes || null,
        is_active: isActive,
        is_mandatory: isMandatory,
        source,
        cloudbase_file_id: cloudbaseFileId,
        download_filename: downloadFilename,
        created_at: now,
        updated_at: now,
      };
      const result = await db.collection(COLLECTION).add(payload);
      const release = normalizeRelease({ ...payload, _id: result.id });

      revalidatePath("/admin/releases");
      revalidatePath("/api/releases/active");
      return { success: true, data: release };
    }

    const { data: release, error } = await supabaseAdmin
      .from(COLLECTION)
      .insert({
        version,
        platform,
        variant: variant || null,
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

    if (error || !release) {
      console.error("Create release error:", error);
      return { success: false, error: "创建版本失败" };
    }

    revalidatePath("/admin/releases");
    revalidatePath("/api/releases/active");
    return { success: true, data: normalizeRelease(release) };
  } catch (error) {
    console.error("Create release error:", error);
    return { success: false, error: "创建版本失败" };
  }
}

export async function createRelease(formData: FormData): Promise<CreateReleaseResult> {
  try {
    await requireAdmin();

    const version = String(formData.get("version") || "");
    const platform = formData.get("platform") as Platform;
    const variant = (formData.get("variant") as Variant | null) || null;
    const releaseNotes = String(formData.get("releaseNotes") || "") || null;
    const isActive = formData.get("isActive") === "true";
    const isMandatory = formData.get("isMandatory") === "true";
    const file = formData.get("file") as File;

    if (!version || !platform || !file || file.size === 0) {
      return { success: false, error: "请填写必要字段并上传安装包" };
    }

    const ext = file.name.split(".").pop() || "bin";
    const fileName = `${platform}-${variant || "default"}-${version}-${Date.now()}.${ext}`;

    let fileUrl: string | null = null;
    let cloudbaseFileId: string | null = null;

    if (shouldUseCloudBaseBackend()) {
      cloudbaseFileId = await uploadToCloudBase(file, fileName);
      fileUrl = cloudbaseFileId;
    } else {
      fileUrl = await uploadToSupabase(file, fileName);
    }

    if (!fileUrl) {
      return { success: false, error: "文件上传失败" };
    }

    return createReleaseWithUrl({
      version,
      platform,
      variant,
      releaseNotes,
      isActive,
      isMandatory,
      fileUrl,
      fileSize: file.size,
      cloudbaseFileId,
    });
  } catch (error) {
    console.error("Create release error:", error);
    return { success: false, error: "创建版本失败" };
  }
}

export async function listReleases(): Promise<ListReleasesResult> {
  try {
    await requireAdmin();

    if (shouldUseCloudBaseBackend()) {
      const { db } = await getCloudBase();
      const result = await db.collection(COLLECTION).orderBy("created_at", "desc").get();
      return {
        success: true,
        data: (result?.data || []).map((item: any) => normalizeRelease(item)),
      };
    }

    const { data, error } = await supabaseAdmin
      .from(COLLECTION)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("List releases error:", error);
      return { success: false, error: "获取版本列表失败" };
    }

    return { success: true, data: (data || []).map((item: any) => normalizeRelease(item)) };
  } catch (error) {
    console.error("List releases error:", error);
    return { success: false, error: "获取版本列表失败" };
  }
}

export async function updateRelease(
  id: string,
  formData: FormData
): Promise<UpdateReleaseResult> {
  try {
    await requireAdmin();

    const releaseNotes = String(formData.get("releaseNotes") || "") || null;
    const isActive = formData.get("isActive") === "true";
    const isMandatory = formData.get("isMandatory") === "true";
    const now = new Date().toISOString();

    if (shouldUseCloudBaseBackend()) {
      const current = await findCloudBaseRelease(id);
      if (!current) {
        return { success: false, error: "版本不存在" };
      }
      if (isActive) {
        await deactivateOtherReleases(current.platform, current.variant || null);
      }
      await updateCloudBaseRelease(id, {
        release_notes: releaseNotes,
        is_active: isActive,
        is_mandatory: isMandatory,
        updated_at: now,
      });
    } else {
      const { data: current, error: fetchError } = await supabaseAdmin
        .from(COLLECTION)
        .select("platform, variant")
        .eq("id", id)
        .single();
      if (fetchError || !current) {
        return { success: false, error: "版本不存在" };
      }
      if (isActive) {
        await deactivateOtherReleases(current.platform, current.variant || null);
      }
      const { error } = await supabaseAdmin
        .from(COLLECTION)
        .update({
          release_notes: releaseNotes,
          is_active: isActive,
          is_mandatory: isMandatory,
          updated_at: now,
        })
        .eq("id", id);
      if (error) {
        console.error("Update release error:", error);
        return { success: false, error: "更新版本失败" };
      }
    }

    revalidatePath("/admin/releases");
    revalidatePath("/api/releases/active");
    return { success: true };
  } catch (error) {
    console.error("Update release error:", error);
    return { success: false, error: "更新版本失败" };
  }
}

export async function toggleReleaseStatus(
  id: string,
  isActive: boolean
): Promise<UpdateReleaseResult> {
  try {
    await requireAdmin();

    const now = new Date().toISOString();

    if (shouldUseCloudBaseBackend()) {
      const current = await findCloudBaseRelease(id);
      if (!current) {
        return { success: false, error: "版本不存在" };
      }
      if (isActive) {
        await deactivateOtherReleases(current.platform, current.variant || null);
      }
      await updateCloudBaseRelease(id, { is_active: isActive, updated_at: now });
    } else {
      const { data: current, error: fetchError } = await supabaseAdmin
        .from(COLLECTION)
        .select("platform, variant")
        .eq("id", id)
        .single();
      if (fetchError || !current) {
        return { success: false, error: "版本不存在" };
      }
      if (isActive) {
        await deactivateOtherReleases(current.platform, current.variant || null);
      }
      const { error } = await supabaseAdmin
        .from(COLLECTION)
        .update({ is_active: isActive, updated_at: now })
        .eq("id", id);
      if (error) {
        console.error("Toggle release status error:", error);
        return { success: false, error: "切换状态失败" };
      }
    }

    revalidatePath("/admin/releases");
    revalidatePath("/api/releases/active");
    return { success: true };
  } catch (error) {
    console.error("Toggle release status error:", error);
    return { success: false, error: "切换状态失败" };
  }
}

export async function deleteRelease(id: string): Promise<DeleteReleaseResult> {
  try {
    await requireAdmin();

    if (shouldUseCloudBaseBackend()) {
      const release = await findCloudBaseRelease(id);
      if (!release) {
        return { success: false, error: "版本不存在" };
      }
      const fileId = release.cloudbase_file_id || (String(release.file_url || "").startsWith("cloud://") ? release.file_url : null);
      if (fileId) {
        try {
          const { app } = await getCloudBase();
          await app.deleteFile({ fileList: [fileId] });
        } catch (error) {
          console.error("Delete CloudBase file error:", error);
        }
      }
      await removeCloudBaseRelease(id);
    } else {
      const { data: release, error: fetchError } = await supabaseAdmin
        .from(COLLECTION)
        .select("*")
        .eq("id", id)
        .single();
      if (fetchError || !release) {
        return { success: false, error: "版本不存在" };
      }
      if (release.file_url) {
        try {
          const fileName = String(release.file_url).split("/").pop();
          if (fileName) {
            await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([fileName]);
          }
        } catch (error) {
          console.error("Delete Supabase file error:", error);
        }
      }
      const { error } = await supabaseAdmin.from(COLLECTION).delete().eq("id", id);
      if (error) {
        console.error("Delete release error:", error);
        return { success: false, error: "删除版本失败" };
      }
    }

    revalidatePath("/admin/releases");
    revalidatePath("/api/releases/active");
    return { success: true };
  } catch (error) {
    console.error("Delete release error:", error);
    return { success: false, error: "删除版本失败" };
  }
}

export async function getActiveRelease(
  platform: Platform,
  variant?: Variant | null
): Promise<AppRelease | null> {
  try {
    if (shouldUseCloudBaseBackend()) {
      const { db } = await getCloudBase();
      const result = await db
        .collection(COLLECTION)
        .where({
          platform,
          variant: variant || null,
          is_active: true,
        })
        .orderBy("created_at", "desc")
        .limit(1)
        .get();
      const item = result?.data?.[0];
      return item ? normalizeRelease(item) : null;
    }

    let query = supabaseAdmin
      .from(COLLECTION)
      .select("*")
      .eq("platform", platform)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);

    query = variant ? query.eq("variant", variant) : query.is("variant", null);

    const { data, error } = await query.maybeSingle();
    if (error) {
      console.error("Get active release error:", error);
      return null;
    }
    return data ? normalizeRelease(data) : null;
  } catch (error) {
    console.error("Get active release error:", error);
    return null;
  }
}

function deriveDownloadFilename(fileUrl: string, fallback?: string): string {
  if (!fileUrl) return fallback || "download.bin";
  const cleanUrl = fileUrl.split("?")[0] || fileUrl;
  const lastSegment = cleanUrl.split("/").pop() || "";
  return lastSegment || fallback || "download.bin";
}
