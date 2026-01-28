/**
 * 用户数据模型和接口定义
 */

/**
 * 用户基本信息接口
 */
export interface User {
  id: string;
  email?: string;
  phone?: string;
  name?: string;
  avatar?: string;
  gender?: "male" | "female" | "other";
  birthDate?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

/**
 * 用户资料接口（扩展的用户信息）
 */
export interface UserProfile extends User {
  // 认证信息
  authProvider?: "wechat" | "email" | "google" | "github";
  wechatOpenId?: string;
  wechatUnionId?: string;

  // 账户状态
  status?: "active" | "inactive" | "suspended";
  emailVerified?: boolean;
  phoneVerified?: boolean;

  // 个人信息
  bio?: string;
  location?: string;
  website?: string;
  language?: string;

  // 偏好设置
  preferences?: {
    theme?: "light" | "dark" | "auto";
    notifications?: boolean;
    emailNotifications?: boolean;
    privateProfile?: boolean;
  };

  // 元数据
  metadata?: Record<string, any>;

  // 时间戳
  lastLoginAt?: Date | string;
  lastLoginIp?: string;
  loginCount?: number;
}

/**
 * 创建用户资料的请求数据
 */
export interface CreateUserProfileRequest
  extends Omit<UserProfile, "id" | "createdAt" | "updatedAt"> {
  // 在创建时 id 由系统生成
}

/**
 * 更新用户资料的请求数据
 */
export type UpdateUserProfileRequest = Partial<CreateUserProfileRequest>;

/**
 * 用户资料响应数据
 */
export type UserProfileResponse = UserProfile;

/**
 * 微信用户信息（来自微信登录）
 */
export interface WechatUserInfo {
  openid: string;
  unionid?: string;
  nickname: string;
  sex?: 0 | 1 | 2; // 0=未知, 1=男, 2=女
  province?: string;
  city?: string;
  country?: string;
  headimgurl?: string;
  privilege?: string[];
}

/**
 * 用户资料工具函数
 */

/**
 * 从微信用户信息创建用户资料
 */
export function createProfileFromWechatUser(
  userId: string,
  wechatInfo: WechatUserInfo
): UserProfile {
  return {
    id: userId,
    name: wechatInfo.nickname,
    avatar: wechatInfo.headimgurl,
    wechatOpenId: wechatInfo.openid,
    wechatUnionId: wechatInfo.unionid,
    authProvider: "wechat",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    loginCount: 1,
    lastLoginAt: new Date(),
    metadata: {
      wechatProvince: wechatInfo.province,
      wechatCity: wechatInfo.city,
      wechatCountry: wechatInfo.country,
    },
  };
}

/**
 * 从邮箱密码用户创建用户资料
 */
export function createProfileFromEmailUser(
  userId: string,
  email: string,
  name?: string,
  avatar?: string
): UserProfile {
  return {
    id: userId,
    email,
    name,
    avatar,
    authProvider: "email",
    status: "active",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    loginCount: 1,
    lastLoginAt: new Date(),
  };
}

/**
 * 合并用户资料（用于更新现有资料）
 */
export function mergeUserProfile(
  existing: UserProfile | Record<string, any>,
  updates: Partial<UserProfile>
): UserProfile {
  return {
    ...(existing as Record<string, any>),
    ...updates,
    updatedAt: new Date(),
  } as UserProfile;
}

/**
 * 验证用户资料数据
 */
export function validateUserProfile(profile: Partial<UserProfile>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (profile.email && !isValidEmail(profile.email)) {
    errors.push("Invalid email format");
  }

  if (profile.phone && !isValidPhone(profile.phone)) {
    errors.push("Invalid phone format");
  }

  if (profile.name && profile.name.length < 1) {
    errors.push("Name cannot be empty");
  }

  if (profile.name && profile.name.length > 255) {
    errors.push("Name is too long (max 255 characters)");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 辅助函数：验证邮箱格式
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 辅助函数：验证电话号码格式
 */
export function isValidPhone(phone: string): boolean {
  // 简单的电话号码验证（支持国际格式）
  const phoneRegex = /^[+]?[\d\s\-()]{7,}$/;
  return phoneRegex.test(phone);
}
