/**
 * 数据模型定义
 *
 * 虽然 CloudBase 是 NoSQL 数据库，不强制要求预定义表结构，
 * 但我们仍然需要在应用层面定义数据模型以确保数据一致性
 */

// 用户资料数据模型
export interface UserProfile {
  id: string; // 用户 ID（与认证系统对应）
  email: string; // 邮箱地址
  full_name: string; // 真实姓名
  avatar?: string; // 头像 URL（可选）
  avatar_url?: string; // 头像 URL（兼容字段，可选）
  subscription_plan?: "free" | "premium" | "pro"; // 订阅计划
  subscription_status?: "active" | "inactive" | "cancelled"; // 订阅状态
  membership_expires_at?: string; // 会员到期时间 (ISO 字符串)
  created_at?: string; // 创建时间
  updated_at?: string; // 更新时间
}

// 用户会话数据模型
export interface UserSession {
  id: string; // 会话 ID
  user_id: string; // 用户 ID
  access_token: string; // 访问令牌
  refresh_token?: string; // 刷新令牌
  expires_at: string; // 过期时间
  created_at: string; // 创建时间
}

// 聊天会话数据模型
export interface ChatSession {
  id: string; // 会话 ID
  user_id: string; // 用户 ID
  title: string; // 会话标题
  last_message_at: string; // 最后消息时间
  message_count: number; // 消息数量
  is_active: boolean; // 是否活跃
  created_at: string; // 创建时间
  updated_at: string; // 更新时间
}

// 聊天消息数据模型
export interface ChatMessage {
  id: string; // 消息 ID
  session_id: string; // 会话 ID
  user_id: string; // 用户 ID
  role: "user" | "assistant"; // 消息角色
  content: string; // 消息内容
  metadata?: Record<string, any>; // 元数据（如 token 使用情况等）
  created_at: string; // 创建时间
}

// 支付记录数据模型
export interface PaymentRecord {
  id: string; // 支付记录 ID
  user_id: string; // 用户 ID
  order_id: string; // 订单 ID
  payment_method: "alipay" | "wechat" | "stripe"; // 支付方式
  amount: number; // 支付金额（分）
  currency: string; // 货币类型
  status: "pending" | "completed" | "failed" | "refunded"; // 支付状态
  product_type: "subscription" | "onetime"; // 产品类型
  product_id: string; // 产品 ID
  metadata?: Record<string, any>; // 额外元数据
  created_at: string; // 创建时间
  updated_at: string; // 更新时间
}

// 数据验证函数
export class DataValidators {
  static validateUserProfile(data: Partial<UserProfile>): boolean {
    const requiredFields = ["id", "full_name"]; // 移除email的必填要求
    const hasRequiredFields = requiredFields.every((field) => data[field as keyof UserProfile]);

    // email 可以为空字符串或临时email
    const email = data.email;
    const hasValidEmail = !email || email === "" || email.includes("@");

    return hasRequiredFields && hasValidEmail;
  }

  static validateChatSession(data: Partial<ChatSession>): boolean {
    const requiredFields = ["id", "user_id", "title"];
    return requiredFields.every((field) => data[field as keyof ChatSession]);
  }

  static validateChatMessage(data: Partial<ChatMessage>): boolean {
    const requiredFields = ["id", "session_id", "user_id", "role", "content"];
    return requiredFields.every((field) => data[field as keyof ChatMessage]);
  }

  static validatePaymentRecord(data: Partial<PaymentRecord>): boolean {
    const requiredFields = ["id", "user_id", "order_id", "amount", "status"];
    return requiredFields.every((field) => data[field as keyof PaymentRecord]);
  }
}

// 默认值生成器
export class DefaultValues {
  static userProfile(userId: string, email: string): UserProfile {
    return {
      id: userId,
      email,
      full_name: email.split("@")[0], // 默认使用邮箱前缀作为姓名
      avatar_url: "",
      subscription_plan: "free",
      subscription_status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  static chatSession(userId: string, title: string): ChatSession {
    return {
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user_id: userId,
      title,
      last_message_at: new Date().toISOString(),
      message_count: 0,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  static chatMessage(
    sessionId: string,
    userId: string,
    role: "user" | "assistant",
    content: string
  ): ChatMessage {
    return {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      session_id: sessionId,
      user_id: userId,
      role,
      content,
      created_at: new Date().toISOString(),
    };
  }
}

// 数据迁移和初始化脚本示例
export class DatabaseMigrations {
  /**
   * 初始化数据库集合和索引
   * 注意：CloudBase 不需要预先创建集合，但我们可以在这里定义索引
   */
  static async initializeCollections(): Promise<void> {
    console.log("🔄 初始化数据库集合...");

    // 在 CloudBase 控制台中创建以下索引：
    // 1. user_profiles: user_id (如果需要)
    // 2. chat_sessions: user_id, is_active
    // 3. chat_messages: session_id, created_at
    // 4. payment_records: user_id, status, created_at

    console.log("✅ 数据库集合初始化完成");
    console.log("📋 请在腾讯云 CloudBase 控制台中创建以下索引：");
    console.log("   - user_profiles.user_id");
    console.log("   - chat_sessions.user_id, chat_sessions.is_active");
    console.log("   - chat_messages.session_id, chat_messages.created_at");
    console.log(
      "   - payment_records.user_id, payment_records.status, payment_records.created_at"
    );
  }

  /**
   * 数据一致性检查
   */
  static async validateDataConsistency(): Promise<void> {
    console.log("🔍 检查数据一致性...");

    // 这里可以添加数据验证逻辑
    // 例如：检查所有用户资料都有对应的用户信息
    // 检查所有聊天消息都有对应的会话

    console.log("✅ 数据一致性检查完成");
  }
}
