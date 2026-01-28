/**
 * CloudBase 数据库集合 Schema 定义
 * 国内版（中国）数据库架构
 */

/**
 * web_users 集合 - 统一用户表 (方案 1: 单表设计)
 *
 * 包含所有用户信息，无需 user_profiles 表
 * 优点: 简化查询、减少 JOIN、快速 MVP 开发
 */
export interface WebUser {
  _id?: string;

  // 认证信息
  email: string;
  password: string; // bcryptjs 加密后的密码

  // 基本信息
  name: string; // 用户名或昵称
  avatar?: string; // 用户头像 URL
  phone?: string;
  bio?: string;

  // 状态信息
  pro: boolean; // 是否是 Pro 用户
  subscription_plan?: "free" | "pro" | "enterprise"; // 订阅计划
  subscription_status?: "active" | "paused" | "canceled" | "expired";
  subscription_expires_at?: string;
  membership_expires_at?: string;

  // 区域信息
  region: string; // 地区：'china'

  // 登录信息
  created_at: string; // ISO 8601 时间戳
  updated_at: string; // ISO 8601 时间戳
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

/**
 * ai_conversations 集合 - AI 对话记录
 */
export interface AIConversation {
  _id?: string;
  user_id: string; // 关联到 web_users._id
  title: string;
  model: string; // 使用的 AI 模型
  provider: string; // 'deepseek' | 'openai' | 'anthropic'
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: string;
  }>;
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
  cost?: number;
  region: string;
  created_at: string;
  updated_at: string;
}

/**
 * payments 集合 - 支付记录（微信支付/支付宝）
 */
export interface Payment {
  _id?: string;
  user_id: string; // 关联到 web_users._id
  email: string;
  amount: number;
  currency: string; // 'CNY'
  method: "wechat" | "alipay"; // 支付方式
  status: "pending" | "completed" | "failed" | "refunded";
  order_id: string; // 商户订单号
  transaction_id?: string; // 第三方交易 ID
  product_type: "pro" | "tokens" | "subscription"; // 产品类型
  product_name: string;
  quantity?: number;
  region: string;
  created_at: string;
  completed_at?: string;
  metadata?: Record<string, any>;
}

/**
 * tokens 集合 - Token 使用记录
 */
export interface TokenRecord {
  _id?: string;
  user_id: string;
  conversation_id?: string; // 关联到 ai_conversations._id
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number;
  region: string;
  created_at: string;
}

/**
 * subscriptions 集合 - 订阅记录
 */
export interface Subscription {
  _id?: string;
  user_id: string;
  email: string;
  plan: "free" | "pro" | "enterprise";
  status: "active" | "paused" | "canceled" | "expired";
  start_date: string;
  end_date?: string;
  renewal_date?: string;
  auto_renew: boolean;
  monthly_tokens: number;
  used_tokens: number;
  monthly_limit: number;
  price: number;
  currency: string;
  region: string;
  created_at: string;
  updated_at: string;
}

/**
 * wechat_logins 集合 - 微信登录记录
 */
export interface WechatLogin {
  _id?: string;
  user_id?: string; // 如果已关联账户，则有值
  open_id: string; // 微信唯一标识
  nickname?: string;
  avatar?: string;
  union_id?: string;
  status: "active" | "inactive";
  last_login_at: string;
  region: string;
  created_at: string;
  updated_at: string;
}

/**
 * security_logs 集合 - 安全日志
 */
export interface SecurityLog {
  _id?: string;
  user_id?: string;
  email?: string;
  event: string; // 'login' | 'logout' | 'failed_login' | 'account_locked' | etc.
  ip_address: string;
  user_agent?: string;
  status: "success" | "failure";
  message?: string;
  region: string;
  created_at: string;
}

/**
 * refresh_tokens 集合 - Refresh Token 管理（方案 B）
 * 存储所有已签发的 refresh tokens，用于验证、撤销和追踪
 */
export interface RefreshTokenRecord {
  _id?: string;
  tokenId: string; // UUID，在 JWT 中也会包含
  userId: string; // 关联到 web_users._id
  email: string; // 用户邮箱，便于查询
  refreshToken?: string; // 可选：加密后的 token（如果需要存储）
  deviceInfo?: string; // 设备信息（浏览器、系统等）
  ipAddress?: string; // 登录 IP 地址
  userAgent?: string; // User-Agent 字符串
  isRevoked: boolean; // 是否已撤销
  revokedAt?: string; // 撤销时间
  revokeReason?: string; // 撤销原因（logout, suspicious, etc.）
  createdAt: string; // 创建时间
  expiresAt: string; // 过期时间
  lastUsedAt?: string; // 最后使用时间
  usageCount: number; // 使用次数
  region: string; // 地区：'china'
}

/**
 * CloudBase 集合列表 (方案 1: 单表设计 - 无 user_profiles)
 */
export const CLOUDBASE_COLLECTIONS = {
  WEB_USERS: "web_users",
  AI_CONVERSATIONS: "ai_conversations",
  PAYMENTS: "payments",
  TOKENS: "tokens",
  SUBSCRIPTIONS: "subscriptions",
  WECHAT_LOGINS: "wechat_logins",
  SECURITY_LOGS: "security_logs",
  REFRESH_TOKENS: "refresh_tokens",
} as const;

/**
 * 集合索引配置 (方案 1: 单表设计 - 无 user_profiles 索引)
 */
export const CLOUDBASE_INDEXES = {
  [CLOUDBASE_COLLECTIONS.WEB_USERS]: [
    { key: { email: 1 }, unique: true }, // 邮箱唯一索引
    { key: { created_at: -1 } }, // 创建时间倒序
    { key: { subscription_status: 1 } }, // 订阅状态索引
  ],
  [CLOUDBASE_COLLECTIONS.AI_CONVERSATIONS]: [
    { key: { user_id: 1, created_at: -1 } }, // 用户 ID 和时间复合索引
    { key: { model: 1 } },
  ],
  [CLOUDBASE_COLLECTIONS.PAYMENTS]: [
    { key: { user_id: 1, created_at: -1 } },
    { key: { order_id: 1 }, unique: true },
    { key: { status: 1 } },
  ],
  [CLOUDBASE_COLLECTIONS.TOKENS]: [
    { key: { user_id: 1, created_at: -1 } },
    { key: { model: 1 } },
  ],
  [CLOUDBASE_COLLECTIONS.SUBSCRIPTIONS]: [
    { key: { user_id: 1 } },
    { key: { status: 1 } },
    { key: { end_date: 1 } },
  ],
  [CLOUDBASE_COLLECTIONS.WECHAT_LOGINS]: [
    { key: { open_id: 1 }, unique: true },
    { key: { user_id: 1 } },
  ],
  [CLOUDBASE_COLLECTIONS.SECURITY_LOGS]: [
    { key: { user_id: 1, created_at: -1 } },
    { key: { email: 1, created_at: -1 } },
    { key: { event: 1 } },
  ],
  [CLOUDBASE_COLLECTIONS.REFRESH_TOKENS]: [
    { key: { tokenId: 1 }, unique: true }, // Token ID 唯一索引
    { key: { userId: 1, createdAt: -1 } }, // 用户 ID 和创建时间复合索引
    { key: { isRevoked: 1, expiresAt: 1 } }, // 查询有效 token
    { key: { expiresAt: 1 } }, // 定期清理过期 token
  ],
} as const;
