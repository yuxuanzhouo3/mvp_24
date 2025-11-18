"use server";

import cloudbase from "@cloudbase/node-sdk";

/**
 * 用户资料接口 (方案 1: 单表设计)
 *
 * 注意: 这实际上就是 WebUser，没有单独的 user_profiles 表
 * 为了向后兼容，保留这个接口名称，但直接操作 web_users 表
 */
export interface CloudBaseUserProfile {
  _id: string;

  // 认证信息
  email: string;
  password?: string;

  // 基本信息
  name: string;
  full_name?: string;
  avatar?: string;
  avatar_url?: string;
  phone?: string;
  bio?: string;

  // 状态信息
  pro: boolean;
  subscription_plan?: string;
  subscription_status?: string;
  subscription_expires_at?: string;
  membership_expires_at?: string;

  // 时间戳
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  last_login_at?: string;
  last_login_ip?: string;
  login_count?: number;

  // 用户偏好
  preferences?: {
    language?: string;
    theme?: string;
    notifications?: boolean;
  };
}

function initCloudBase() {
  return cloudbase.init({
    env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
    secretId: process.env.CLOUDBASE_SECRET_ID,
    secretKey: process.env.CLOUDBASE_SECRET_KEY,
  });
}

export async function getUserProfile(
  userId: string
): Promise<CloudBaseUserProfile | null> {
  if (!userId) {
    console.error(" [UserProfile Service] 无效的 userId");
    return null;
  }

  try {
    console.log(" [UserProfile Service] 查询用户资料，userId:", userId);

    const app = initCloudBase();
    const db = app.database();
    const collection = db.collection("web_users");

    const result = await collection.doc(userId).get();

    if (!result.data || result.data.length === 0) {
      console.log(" [UserProfile Service] 用户资料未找到");
      return null;
    }

    console.log(" [UserProfile Service] 查询成功");
    return result.data[0] as CloudBaseUserProfile;
  } catch (error) {
    console.error(" [UserProfile Service] 查询失败:", error);
    return null;
  }
}

export async function createUserProfile(
  userId: string,
  userInfo: {
    email?: string;
    name?: string;
    avatar?: string;
  }
): Promise<CloudBaseUserProfile | null> {
  if (!userId) {
    console.error(" [UserProfile Service] 无效的 userId");
    return null;
  }

  try {
    console.log(" [UserProfile Service] 创建用户资料，userId:", userId);

    const now = new Date().toISOString();
    const profile: CloudBaseUserProfile = {
      _id: userId,
      email: userInfo.email || `user_${userId}@temp.com`,
      name: userInfo.name || "用户",
      avatar: userInfo.avatar || "",
      pro: false,
      created_at: now,
      updated_at: now,
    };

    console.log(" [UserProfile Service] 创建资料:", profile);

    const app = initCloudBase();
    const db = app.database();
    const collection = db.collection("web_users");

    await collection.doc(userId).set(profile);

    console.log(" [UserProfile Service] 创建成功");
    return profile;
  } catch (error) {
    console.error(" [UserProfile Service] 创建异常:", error);
    return null;
  }
}

export async function getOrCreateUserProfile(
  userId: string,
  userInfo?: {
    email?: string;
    name?: string;
    avatar?: string;
  }
): Promise<CloudBaseUserProfile | null> {
  if (!userId) {
    console.error(" [UserProfile Service] 无效的 userId");
    return null;
  }

  try {
    let profile = await getUserProfile(userId);

    if (!profile) {
      console.log(" [UserProfile Service] 用户资料不存在，创建默认资料");
      profile = await createUserProfile(userId, userInfo || {});
    }

    return profile;
  } catch (error) {
    console.error(" [UserProfile Service] 获取或创建失败:", error);
    return null;
  }
}

export async function updateUserProfile(
  userId: string,
  updates: Partial<CloudBaseUserProfile>
): Promise<CloudBaseUserProfile | null> {
  if (!userId) {
    console.error(" [UserProfile Service] 无效的 userId");
    return null;
  }

  try {
    console.log(" [UserProfile Service] 更新用户资料，userId:", userId);

    const app = initCloudBase();
    const db = app.database();
    const collection = db.collection("web_users");

    const dataToUpdate = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await collection.doc(userId).update(dataToUpdate);

    console.log(" [UserProfile Service] 更新成功");

    return getUserProfile(userId);
  } catch (error) {
    console.error(" [UserProfile Service] 更新异常:", error);
    return null;
  }
}
