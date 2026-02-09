"use server";

/**
 * 广告管理 Server Actions
 * 实现双端同步：Supabase (国际版) + CloudBase (国内版)
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import { CloudBaseConnector, isCloudBaseConfigured } from "@/lib/admin/cloudbase-connector";
import { IS_DOMESTIC_VERSION } from "@/config";
import { getAdminSession } from "@/lib/admin/session";
import { revalidatePath } from "next/cache";

// 广告位置类型
export type AdPosition = "top" | "bottom" | "left" | "right" | "sidebar" | "bottom-left" | "bottom-right";

// 广告类型定义
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
    const filePath = `${fileName}`;

    const { error } = await supabaseAdmin.storage
      .from("ads")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (error) {
      console.error("Supabase upload error:", error);
      return null;
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("ads")
      .getPublicUrl(filePath);

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
    console.log("CloudBase not configured, skipping upload");
    return null;
  }

  try {
    const { app } = await getCloudBase();
    const buffer = Buffer.from(await file.arrayBuffer());
    const cloudPath = `ads/${fileName}`;

    const uploadResult = await app.uploadFile({
      cloudPath,
      fileContent: buffer,
    });

    if (!uploadResult.fileID) {
      console.error("CloudBase upload failed: no fileID returned");
      return null;
    }

    return uploadResult.fileID;
  } catch (err) {
    console.error("CloudBase upload exception:", err);
    return null;
  }
}

/**
 * 创建广告（使用客户端预上传的文件URL）
 * 文件已在客户端直接上传到存储，绕过 Server Action body size 限制
 */
export async function createAdvertisementWithUrl(
  data: {
    title: string;
    position: AdPosition;
    mediaType: "image" | "video";
    mediaUrl: string;
    targetUrl?: string;
    priority?: number;
    isActive: boolean;
    fileSize: number;
  }
): Promise<CreateAdResult> {
  try {
    await requireAdmin();

    const { title, position, mediaType, mediaUrl, targetUrl, priority = 0, isActive, fileSize } = data;

    if (!title || !position || !mediaType || !mediaUrl) {
      return { success: false, error: "请填写必要字段" };
    }

    // 根据部署版本决定主要目标
    const primaryTarget = IS_DOMESTIC_VERSION ? "cloudbase" : "supabase";

    // 确定数据来源
    let source: "supabase" | "cloudbase" | "both" = primaryTarget as "supabase" | "cloudbase";
    if (primaryTarget === "supabase" && isCloudBaseConfigured()) {
      source = "both";
    } else if (primaryTarget === "cloudbase" && !IS_DOMESTIC_VERSION) {
      source = "both";
    }

    // 插入数据库
    let ad: any;

    if (primaryTarget === "supabase") {
      const { data: supaData, error } = await supabaseAdmin
        .from("advertisements")
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

      if (error) {
        console.error("Insert advertisement error:", error);
        return { success: false, error: "创建广告失败" };
      }
      ad = supaData;

      // 如果配置了 CloudBase，同步到 CloudBase 数据库
      if (isCloudBaseConfigured()) {
        try {
          const { db } = await getCloudBase();
          await db.collection("advertisements").add({
            ...ad,
            cloudbase_file_id: mediaUrl.startsWith("cloud://") ? mediaUrl : null,
          });
        } catch (err) {
          console.error("CloudBase sync error:", err);
        }
      }
    } else {
      // CloudBase 为主
      const { db } = await getCloudBase();
      const result = await db.collection("advertisements").add({
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      ad = {
        id: result.id,
        ...result.data,
      };

      // 如果不是国内版，也同步到 Supabase
      if (!IS_DOMESTIC_VERSION) {
        try {
          const { data: supaData, error } = await supabaseAdmin
            .from("advertisements")
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

          if (error) {
            console.error("Supabase sync error:", error);
          }
        } catch (err) {
          console.error("Supabase sync error:", err);
        }
      }
    }

    // 清除缓存
    revalidatePath("/admin/ads");
    revalidatePath("/api/advertisements");
    revalidatePath("/");
    return { success: true, data: ad };
  } catch (err) {
    console.error("Create advertisement error:", err);
    return { success: false, error: "创建广告失败" };
  }
}

/**
 * 创建广告
 */
export async function createAdvertisement(
  formData: FormData
): Promise<CreateAdResult> {
  try {
    await requireAdmin();

    const title = formData.get("title") as string;
    const position = formData.get("position") as AdPosition;
    const mediaType = formData.get("mediaType") as "image" | "video";
    const targetUrl = formData.get("targetUrl") as string;
    const priority = parseInt(formData.get("priority") as string) || 0;
    const isActive = formData.get("isActive") === "true";
    const file = formData.get("file") as File;

    if (!title || !position || !mediaType) {
      return { success: false, error: "请填写必要字段" };
    }

    if (!file || file.size === 0) {
      return { success: false, error: "请上传媒体文件" };
    }

    // 生成唯一文件名
    const ext = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    let supabaseUrl: string | null = null;
    let cloudbaseFileId: string | null = null;

    // 根据部署版本决定上传目标
    const primaryTarget = IS_DOMESTIC_VERSION ? "cloudbase" : "supabase";

    // 上传到主要目标
    if (primaryTarget === "supabase") {
      supabaseUrl = await uploadToSupabase(file, fileName);
    } else if (primaryTarget === "cloudbase" && isCloudBaseConfigured()) {
      cloudbaseFileId = await uploadToCloudBase(file, fileName);
    }

    // 如果主要目标失败，尝试另一个
    if (!supabaseUrl && !cloudbaseFileId) {
      if (primaryTarget === "supabase" && isCloudBaseConfigured()) {
        cloudbaseFileId = await uploadToCloudBase(file, fileName);
      } else if (primaryTarget === "cloudbase") {
        supabaseUrl = await uploadToSupabase(file, fileName);
      }
    }

    const mediaUrl = supabaseUrl || cloudbaseFileId;
    if (!mediaUrl) {
      return { success: false, error: "文件上传失败" };
    }

    // 确定数据来源
    let source: "supabase" | "cloudbase" | "both" = primaryTarget as "supabase" | "cloudbase";
    if (supabaseUrl && cloudbaseFileId) {
      source = "both";
    }

    // 插入数据库
    let data: any;

    if (primaryTarget === "supabase") {
      const { data: supaData, error } = await supabaseAdmin
        .from("advertisements")
        .insert({
          title,
          position,
          media_type: mediaType,
          media_url: mediaUrl,
          target_url: targetUrl || null,
          is_active: isActive,
          priority,
          file_size: file.size,
          source,
        })
        .select()
        .single();

      if (error) {
        console.error("Insert advertisement error:", error);
        return { success: false, error: "创建广告失败" };
      }
      data = supaData;

      // 如果配置了 CloudBase，同步到 CloudBase 数据库
      if (isCloudBaseConfigured()) {
        try {
          const { db } = await getCloudBase();
          await db.collection("advertisements").add({
            ...data,
            cloudbase_file_id: cloudbaseFileId,
          });
        } catch (err) {
          console.error("CloudBase sync error:", err);
        }
      }
    } else {
      // CloudBase 为主
      const { db } = await getCloudBase();
      const result = await db.collection("advertisements").add({
        title,
        position,
        media_type: mediaType,
        media_url: mediaUrl,
        target_url: targetUrl || null,
        is_active: isActive,
        priority,
        file_size: file.size,
        source,
        cloudbase_file_id: cloudbaseFileId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      data = {
        id: result.id,
        ...result.data,
      };

      // 如果不是国内版，也同步到 Supabase
      if (!IS_DOMESTIC_VERSION) {
        try {
          const { data: supaData, error } = await supabaseAdmin
            .from("advertisements")
            .insert({
              title,
              position,
              media_type: mediaType,
              media_url: mediaUrl,
              target_url: targetUrl || null,
              is_active: isActive,
              priority,
              file_size: file.size,
              source,
            })
            .select()
            .single();

          if (error) {
            console.error("Supabase sync error:", error);
          }
        } catch (err) {
          console.error("Supabase sync error:", err);
        }
      }
    }

    // 清除缓存
    revalidatePath("/admin/ads");
    revalidatePath("/api/advertisements");
    revalidatePath("/");
    return { success: true, data };
  } catch (err) {
    console.error("Create advertisement error:", err);
    return { success: false, error: "创建广告失败" };
  }
}

/**
 * 获取广告列表
 */
export async function listAdvertisements(): Promise<ListAdsResult> {
  try {
    await requireAdmin();

    let data: any[] = [];
    const using = IS_DOMESTIC_VERSION && isCloudBaseConfigured() ? "CloudBase" : "Supabase";
    console.log(`[listAdvertisements] Using ${using} database (IS_DOMESTIC_VERSION=${IS_DOMESTIC_VERSION}, isCloudBaseConfigured=${isCloudBaseConfigured()})`);

    if (IS_DOMESTIC_VERSION && isCloudBaseConfigured()) {
      // 国内版从 CloudBase 读取
      const { db } = await getCloudBase();
      const result = await db.collection("advertisements")
        .orderBy("created_at", "desc")
        .get();
      data = (result.data || []).map((ad: any) => ({
        ...ad,
        id: ad.id || ad._id || ad._ID || ad.docId,
      }));
      console.log(`[listAdvertisements] CloudBase returned ${data.length} ads`);
    } else {
      // 国际版从 Supabase 读取
      const { data: supaData, error } = await supabaseAdmin
        .from("advertisements")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("List advertisements error:", error);
        return { success: false, error: "获取广告列表失败" };
      }
      data = supaData || [];
    }

    return { success: true, data };
  } catch (err) {
    console.error("List advertisements error:", err);
    return { success: false, error: "获取广告列表失败" };
  }
}

/**
 * 更新广告
 */
export async function updateAdvertisement(
  id: string,
  formData: FormData
): Promise<UpdateAdResult> {
  try {
    await requireAdmin();

    const title = formData.get("title") as string;
    const targetUrl = formData.get("targetUrl") as string;
    const priority = parseInt(formData.get("priority") as string) || 0;
    const isActive = formData.get("isActive") === "true";

    const updateData = {
      title,
      target_url: targetUrl || null,
      priority,
      is_active: isActive,
    };

    // 根据部署版本决定主要目标
    const primaryTarget = IS_DOMESTIC_VERSION ? "cloudbase" : "supabase";

    if (primaryTarget === "cloudbase" && isCloudBaseConfigured()) {
      // 国内版主要更新 CloudBase
      const { db } = await getCloudBase();
      try {
        await db.collection("advertisements").doc(id).update(updateData);
      } catch (err) {
        // 如果 doc(id) 失败，尝试用 where 查询
        console.warn("Doc update failed, trying where query:", err);
        await db.collection("advertisements")
          .where({ _id: id })
          .update(updateData);
      }

      // 同步到 Supabase
      try {
        await supabaseAdmin
          .from("advertisements")
          .update(updateData)
          .eq("id", id);
      } catch (err) {
        console.error("Supabase sync error:", err);
      }
    } else {
      // 国际版主要更新 Supabase
      const { error } = await supabaseAdmin
        .from("advertisements")
        .update(updateData)
        .eq("id", id);

      if (error) {
        console.error("Update advertisement error:", error);
        return { success: false, error: "更新广告失败" };
      }

      // 同步到 CloudBase
      if (isCloudBaseConfigured()) {
        try {
          const { db } = await getCloudBase();
          try {
            await db.collection("advertisements").doc(id).update(updateData);
          } catch (err) {
            // 如果 doc(id) 失败，尝试用 where 查询
            console.warn("Doc update failed, trying where query:", err);
            await db.collection("advertisements")
              .where({ _id: id })
              .update(updateData);
          }
        } catch (err) {
          console.error("CloudBase sync error:", err);
        }
      }
    }

    // 清除缓存
    revalidatePath("/admin/ads");
    revalidatePath("/api/advertisements");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    console.error("Update advertisement error:", err);
    return { success: false, error: "更新广告失败" };
  }
}

/**
 * 切换广告状态
 */
export async function toggleAdvertisementStatus(
  id: string,
  isActive: boolean
): Promise<UpdateAdResult> {
  try {
    await requireAdmin();

    console.log(`[toggleAdvertisementStatus] Toggling ad ${id} to ${isActive}`);

    // 根据部署版本决定主要目标
    const primaryTarget = IS_DOMESTIC_VERSION ? "cloudbase" : "supabase";

    if (primaryTarget === "cloudbase" && isCloudBaseConfigured()) {
      // 国内版主要更新 CloudBase
      const { db } = await getCloudBase();
      let updateSuccess = false;
      
      try {
        // 尝试用 doc(id) 直接更新
        await db.collection("advertisements").doc(id).update({ is_active: isActive });
        updateSuccess = true;
        console.log(`[toggleAdvertisementStatus] CloudBase doc(${id}) update success`);
      } catch (err: any) {
        // 如果 doc(id) 失败，尝试用 where 查询 _id
        console.warn(`[toggleAdvertisementStatus] Doc update failed: ${err?.message}, trying where query with _id`);
        try {
          await db.collection("advertisements")
            .where({ _id: id })
            .update({ is_active: isActive });
          updateSuccess = true;
          console.log(`[toggleAdvertisementStatus] CloudBase where(_id: ${id}) update success`);
        } catch (whereErr: any) {
          console.error(`[toggleAdvertisementStatus] Where query also failed: ${whereErr?.message}`);
          // 最后尝试用 id 字段查询
          try {
            await db.collection("advertisements")
              .where({ id: id })
              .update({ is_active: isActive });
            updateSuccess = true;
            console.log(`[toggleAdvertisementStatus] CloudBase where(id: ${id}) update success`);
          } catch (idErr: any) {
            console.error(`[toggleAdvertisementStatus] All CloudBase update methods failed: ${idErr?.message}`);
          }
        }
      }

      if (!updateSuccess) {
        return { success: false, error: "CloudBase 更新失败" };
      }

      // 同步到 Supabase
      try {
        await supabaseAdmin
          .from("advertisements")
          .update({ is_active: isActive })
          .eq("id", id);
        console.log(`[toggleAdvertisementStatus] Supabase sync success`);
      } catch (err) {
        console.error("Supabase sync error:", err);
      }
    } else {
      // 国际版主要更新 Supabase
      const { error } = await supabaseAdmin
        .from("advertisements")
        .update({ is_active: isActive })
        .eq("id", id);

      if (error) {
        console.error("Toggle advertisement status error:", error);
        return { success: false, error: "切换状态失败" };
      }
      console.log(`[toggleAdvertisementStatus] Supabase update success`);

      // 同步到 CloudBase
      if (isCloudBaseConfigured()) {
        try {
          const { db } = await getCloudBase();
          try {
            await db.collection("advertisements").doc(id).update({ is_active: isActive });
          } catch (err) {
            // 如果 doc(id) 失败，尝试用 where 查询
            console.warn("Doc update failed, trying where query:", err);
            await db.collection("advertisements")
              .where({ _id: id })
              .update({ is_active: isActive });
          }
        } catch (err) {
          console.error("CloudBase sync error:", err);
        }
      }
    }

    // 清除前台缓存
    revalidatePath("/admin/ads");
    revalidatePath("/api/advertisements");
    revalidatePath("/"); // 清除首页缓存
    console.log(`[toggleAdvertisementStatus] Cache revalidated`);
    return { success: true };
  } catch (err) {
    console.error("Toggle advertisement status error:", err);
    return { success: false, error: "切换状态失败" };
  }
}

/**
 * 删除广告
 */
export async function deleteAdvertisement(id: string): Promise<DeleteAdResult> {
  try {
    await requireAdmin();

    // 先获取广告信息
    const { data: ad, error: fetchError } = await supabaseAdmin
      .from("advertisements")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !ad) {
      return { success: false, error: "广告不存在" };
    }

    // 删除存储文件
    if (ad.media_url) {
      try {
        // 从 URL 提取文件名
        const fileName = ad.media_url.split("/").pop();
        if (fileName) {
          await supabaseAdmin.storage.from("ads").remove([fileName]);
        }
      } catch (err) {
        console.error("Delete storage file error:", err);
      }
    }

    // 删除数据库记录
    const { error } = await supabaseAdmin
      .from("advertisements")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Delete advertisement error:", error);
      return { success: false, error: "删除广告失败" };
    }

    // 如果配置了 CloudBase，同步删除
    if (isCloudBaseConfigured()) {
      try {
        const { db } = await getCloudBase();
        try {
          await db.collection("advertisements").doc(id).remove();
        } catch (err) {
          // 如果 doc(id) 失败，尝试用 where 查询
          console.warn("Doc remove failed, trying where query:", err);
          await db.collection("advertisements")
            .where({ _id: id })
            .remove();
        }
      } catch (err) {
        console.error("CloudBase delete error:", err);
      }
    }

    // 清除缓存
    revalidatePath("/admin/ads");
    revalidatePath("/api/advertisements");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    console.error("Delete advertisement error:", err);
    return { success: false, error: "删除广告失败" };
  }
}

/**
 * 获取存储文件列表
 */
export async function listStorageFiles(): Promise<ListFilesResult> {
  try {
    await requireAdmin();

    const supabaseFiles: StorageFile[] = [];
    const cloudbaseFiles: StorageFile[] = [];

    // 获取 Supabase 文件
    const { data: files, error } = await supabaseAdmin.storage
      .from("ads")
      .list();

    if (!error && files) {
      for (const file of files) {
        const { data: urlData } = supabaseAdmin.storage
          .from("ads")
          .getPublicUrl(file.name);

        supabaseFiles.push({
          name: file.name,
          url: urlData.publicUrl,
          size: file.metadata?.size,
          lastModified: file.updated_at,
          source: "supabase",
        });
      }
    }

    // 获取 CloudBase 文件
    if (isCloudBaseConfigured()) {
      try {
        const { db } = await getCloudBase();
        const result = await db.collection("advertisements").get();

        for (const ad of result.data || []) {
          if (ad.cloudbase_file_id) {
            cloudbaseFiles.push({
              name: ad.cloudbase_file_id.split("/").pop() || "",
              url: ad.cloudbase_file_id,
              size: ad.file_size,
              source: "cloudbase",
              fileId: ad.cloudbase_file_id,
              adId: ad.id,
            });
          }
        }
      } catch (err) {
        console.error("CloudBase list files error:", err);
      }
    }

    return { success: true, supabaseFiles, cloudbaseFiles };
  } catch (err) {
    console.error("List storage files error:", err);
    return { success: false, error: "获取文件列表失败" };
  }
}

/**
 * 删除存储文件
 */
export async function deleteStorageFile(
  name: string,
  source: "supabase" | "cloudbase",
  fileId?: string
): Promise<DeleteAdResult> {
  try {
    await requireAdmin();

    if (source === "supabase") {
      const { error } = await supabaseAdmin.storage.from("ads").remove([name]);
      if (error) {
        return { success: false, error: "删除文件失败" };
      }
    } else if (source === "cloudbase" && fileId && isCloudBaseConfigured()) {
      const { app } = await getCloudBase();
      await app.deleteFile({ fileList: [fileId] });
    }

    return { success: true };
  } catch (err) {
    console.error("Delete storage file error:", err);
    return { success: false, error: "删除文件失败" };
  }
}
