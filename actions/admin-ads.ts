"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  CloudBaseConnector,
  isCloudBaseConfigured,
} from "@/lib/admin/cloudbase-connector";
import { getAdminSession } from "@/lib/admin/session";
import { getCurrentAdminDataProvider } from "@/lib/admin/region";

export type AdPosition =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "sidebar"
  | "bottom-left"
  | "bottom-right";

export interface Advertisement {
  id: string;
  title: string;
  position: AdPosition;
  media_type: "image" | "video";
  media_url: string;
  target_url: string | null;
  is_active: boolean;
  priority: number;
  created_at: string;
  source: "supabase" | "cloudbase" | "both";
  file_size?: number;
  cloudbase_file_id?: string | null;
}

export interface CreateAdResult {
  success: boolean;
  error?: string;
  data?: Advertisement;
}

export interface UpdateAdResult {
  success: boolean;
  error?: string;
}

export interface DeleteAdResult {
  success: boolean;
  error?: string;
}

export interface ListAdsResult {
  success: boolean;
  error?: string;
  data?: Advertisement[];
}

export interface StorageFile {
  name: string;
  url: string;
  size?: number;
  lastModified?: string;
  source: "supabase" | "cloudbase";
  fileId?: string;
  adId?: string;
}

export interface ListFilesResult {
  success: boolean;
  error?: string;
  supabaseFiles?: StorageFile[];
  cloudbaseFiles?: StorageFile[];
}

const COLLECTION = "advertisements";
const STORAGE_BUCKET = "ads";

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

function normalizeAd(record: any): Advertisement {
  return {
    id: record?.id || record?._id || record?._ID || record?.docId,
    title: record?.title || "",
    position: record?.position,
    media_type: record?.media_type,
    media_url: record?.media_url || "",
    target_url: record?.target_url || null,
    is_active: Boolean(record?.is_active),
    priority: Number(record?.priority || 0),
    created_at: record?.created_at || new Date().toISOString(),
    source: (record?.source || getCurrentSource()) as Advertisement["source"],
    file_size:
      typeof record?.file_size === "number" ? record.file_size : undefined,
    cloudbase_file_id: record?.cloudbase_file_id || null,
  };
}

async function findCloudBaseAd(id: string): Promise<any | null> {
  const { db } = await getCloudBase();
  let result = await db.collection(COLLECTION).where({ _id: id }).limit(1).get();
  if (result?.data?.length) return result.data[0];
  result = await db.collection(COLLECTION).where({ id }).limit(1).get();
  return result?.data?.[0] || null;
}

async function updateCloudBaseAd(id: string, data: Record<string, unknown>) {
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

  throw new Error("广告不存在");
}

async function removeCloudBaseAd(id: string) {
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

  throw new Error("广告不存在");
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

export async function createAdvertisementWithUrl(data: {
  title: string;
  position: AdPosition;
  mediaType: "image" | "video";
  mediaUrl: string;
  targetUrl?: string;
  priority?: number;
  isActive: boolean;
  fileSize: number;
}): Promise<CreateAdResult> {
  try {
    await requireAdmin();

    const { title, position, mediaType, mediaUrl, targetUrl, priority = 0, isActive, fileSize } = data;
    if (!title || !position || !mediaType || !mediaUrl) {
      return { success: false, error: "请填写必要字段" };
    }

    const source = getCurrentSource();
    const now = new Date().toISOString();

    if (shouldUseCloudBaseBackend()) {
      const { db } = await getCloudBase();
      const payload = {
        title,
        position,
        media_type: mediaType,
        media_url: mediaUrl,
        target_url: targetUrl || null,
        is_active: isActive,
        priority,
        file_size: fileSize,
        source,
        cloudbase_file_id: mediaUrl.startsWith("cloud://") ? mediaUrl : null,
        created_at: now,
        updated_at: now,
      };
      const result = await db.collection(COLLECTION).add(payload);
      const ad = normalizeAd({ ...payload, _id: result.id });

      revalidatePath("/admin/ads");
      revalidatePath("/api/advertisements");
      revalidatePath("/");
      return { success: true, data: ad };
    }

    const { data: ad, error } = await supabaseAdmin
      .from(COLLECTION)
      .insert({
        title,
        position,
        media_type: mediaType,
        media_url: mediaUrl,
        target_url: targetUrl || null,
        is_active: isActive,
        priority,
        file_size: fileSize,
        source,
      })
      .select()
      .single();

    if (error || !ad) {
      console.error("Create advertisement error:", error);
      return { success: false, error: "创建广告失败" };
    }

    revalidatePath("/admin/ads");
    revalidatePath("/api/advertisements");
    revalidatePath("/");
    return { success: true, data: normalizeAd(ad) };
  } catch (error) {
    console.error("Create advertisement error:", error);
    return { success: false, error: "创建广告失败" };
  }
}

export async function createAdvertisement(formData: FormData): Promise<CreateAdResult> {
  try {
    await requireAdmin();

    const title = String(formData.get("title") || "");
    const position = formData.get("position") as AdPosition;
    const mediaType = formData.get("mediaType") as "image" | "video";
    const targetUrl = String(formData.get("targetUrl") || "");
    const priority = parseInt(String(formData.get("priority") || "0"), 10) || 0;
    const isActive = formData.get("isActive") === "true";
    const file = formData.get("file") as File;

    if (!title || !position || !mediaType) {
      return { success: false, error: "请填写必要字段" };
    }
    if (!file || file.size === 0) {
      return { success: false, error: "请上传媒体文件" };
    }

    const ext = file.name.split(".").pop() || "bin";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const mediaUrl = shouldUseCloudBaseBackend()
      ? await uploadToCloudBase(file, fileName)
      : await uploadToSupabase(file, fileName);

    if (!mediaUrl) {
      return { success: false, error: "文件上传失败" };
    }

    return createAdvertisementWithUrl({
      title,
      position,
      mediaType,
      mediaUrl,
      targetUrl: targetUrl || undefined,
      priority,
      isActive,
      fileSize: file.size,
    });
  } catch (error) {
    console.error("Create advertisement error:", error);
    return { success: false, error: "创建广告失败" };
  }
}

export async function listAdvertisements(): Promise<ListAdsResult> {
  try {
    await requireAdmin();

    if (shouldUseCloudBaseBackend()) {
      const { db } = await getCloudBase();
      const result = await db.collection(COLLECTION).orderBy("created_at", "desc").get();
      return {
        success: true,
        data: (result?.data || []).map((item: any) => normalizeAd(item)),
      };
    }

    const { data, error } = await supabaseAdmin
      .from(COLLECTION)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("List advertisements error:", error);
      return { success: false, error: "获取广告列表失败" };
    }

    return { success: true, data: (data || []).map((item: any) => normalizeAd(item)) };
  } catch (error) {
    console.error("List advertisements error:", error);
    return { success: false, error: "获取广告列表失败" };
  }
}

export async function updateAdvertisement(
  id: string,
  formData: FormData
): Promise<UpdateAdResult> {
  try {
    await requireAdmin();

    const updateData = {
      title: String(formData.get("title") || ""),
      target_url: String(formData.get("targetUrl") || "") || null,
      priority: parseInt(String(formData.get("priority") || "0"), 10) || 0,
      is_active: formData.get("isActive") === "true",
      updated_at: new Date().toISOString(),
    };

    if (shouldUseCloudBaseBackend()) {
      await updateCloudBaseAd(id, updateData);
    } else {
      const { error } = await supabaseAdmin.from(COLLECTION).update(updateData).eq("id", id);
      if (error) {
        console.error("Update advertisement error:", error);
        return { success: false, error: "更新广告失败" };
      }
    }

    revalidatePath("/admin/ads");
    revalidatePath("/api/advertisements");
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Update advertisement error:", error);
    return { success: false, error: "更新广告失败" };
  }
}

export async function toggleAdvertisementStatus(
  id: string,
  isActive: boolean
): Promise<UpdateAdResult> {
  try {
    await requireAdmin();

    if (shouldUseCloudBaseBackend()) {
      await updateCloudBaseAd(id, {
        is_active: isActive,
        updated_at: new Date().toISOString(),
      });
    } else {
      const { error } = await supabaseAdmin
        .from(COLLECTION)
        .update({ is_active: isActive })
        .eq("id", id);
      if (error) {
        console.error("Toggle advertisement status error:", error);
        return { success: false, error: "切换状态失败" };
      }
    }

    revalidatePath("/admin/ads");
    revalidatePath("/api/advertisements");
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Toggle advertisement status error:", error);
    return { success: false, error: "切换状态失败" };
  }
}

export async function deleteAdvertisement(id: string): Promise<DeleteAdResult> {
  try {
    await requireAdmin();

    if (shouldUseCloudBaseBackend()) {
      const ad = await findCloudBaseAd(id);
      if (!ad) {
        return { success: false, error: "广告不存在" };
      }

      const fileId = ad.cloudbase_file_id || (String(ad.media_url || "").startsWith("cloud://") ? ad.media_url : null);
      if (fileId) {
        try {
          const { app } = await getCloudBase();
          await app.deleteFile({ fileList: [fileId] });
        } catch (error) {
          console.error("Delete CloudBase storage file error:", error);
        }
      }

      await removeCloudBaseAd(id);
    } else {
      const { data: ad, error: fetchError } = await supabaseAdmin
        .from(COLLECTION)
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError || !ad) {
        return { success: false, error: "广告不存在" };
      }

      if (ad.media_url) {
        try {
          const fileName = String(ad.media_url).split("/").pop();
          if (fileName) {
            await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([fileName]);
          }
        } catch (error) {
          console.error("Delete Supabase storage file error:", error);
        }
      }

      const { error } = await supabaseAdmin.from(COLLECTION).delete().eq("id", id);
      if (error) {
        console.error("Delete advertisement error:", error);
        return { success: false, error: "删除广告失败" };
      }
    }

    revalidatePath("/admin/ads");
    revalidatePath("/api/advertisements");
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Delete advertisement error:", error);
    return { success: false, error: "删除广告失败" };
  }
}

export async function listStorageFiles(): Promise<ListFilesResult> {
  try {
    await requireAdmin();

    if (shouldUseCloudBaseBackend()) {
      const { db } = await getCloudBase();
      const result = await db.collection(COLLECTION).get();
      const cloudbaseFiles = (result?.data || [])
        .filter((item: any) => item?.cloudbase_file_id)
        .map((item: any) => ({
          name: String(item.cloudbase_file_id).split("/").pop() || "",
          url: item.cloudbase_file_id,
          size: item.file_size,
          source: "cloudbase" as const,
          fileId: item.cloudbase_file_id,
          adId: item._id || item.id,
        }));
      return { success: true, cloudbaseFiles, supabaseFiles: [] };
    }

    const { data: files, error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).list();
    if (error) {
      console.error("List storage files error:", error);
      return { success: false, error: "获取文件列表失败" };
    }

    const supabaseFiles = (files || []).map((file: any) => {
      const { data } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(file.name);
      return {
        name: file.name,
        url: data.publicUrl,
        size: file.metadata?.size,
        lastModified: file.updated_at,
        source: "supabase" as const,
      };
    });

    return { success: true, supabaseFiles, cloudbaseFiles: [] };
  } catch (error) {
    console.error("List storage files error:", error);
    return { success: false, error: "获取文件列表失败" };
  }
}

export async function deleteStorageFile(
  name: string,
  source: "supabase" | "cloudbase",
  fileId?: string
): Promise<DeleteAdResult> {
  try {
    await requireAdmin();

    if (shouldUseCloudBaseBackend()) {
      if (source !== "cloudbase" || !fileId) {
        return { success: false, error: "当前后台仅允许删除国内版文件" };
      }
      const { app } = await getCloudBase();
      await app.deleteFile({ fileList: [fileId] });
      return { success: true };
    }

    if (source !== "supabase") {
      return { success: false, error: "当前后台仅允许删除国际版文件" };
    }

    const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([name]);
    if (error) {
      console.error("Delete storage file error:", error);
      return { success: false, error: "删除文件失败" };
    }

    return { success: true };
  } catch (error) {
    console.error("Delete storage file error:", error);
    return { success: false, error: "删除文件失败" };
  }
}
