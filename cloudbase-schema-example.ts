/**
 * 腾讯云 CloudBase 数据模型定义示例
 * 用于 user_profiles 集合
 *
 * 在腾讯云控制台创建数据模型时，可以参考以下结构：
 */

export interface UserProfile {
  // 主键 (自动生成)
  _id: string;

  // 用户 ID (用于关联用户)
  id: string;

  // 邮箱地址
  email: string;

  // 用户全名
  full_name: string;

  // 头像 URL
  avatar_url: string;

  // 订阅计划 (free, pro, premium)
  subscription_plan: "free" | "pro" | "premium";

  // 订阅状态 (active, inactive, cancelled)
  subscription_status: "active" | "inactive" | "cancelled";

  // 创建时间 (自动生成)
  _createTime: number;

  // 更新时间 (自动更新)
  _updateTime: number;
}

/**
 * 数据模型字段配置建议：
 *
 * 字段名: id
 * 类型: String
 * 必填: 是
 * 描述: 用户唯一标识符
 *
 * 字段名: email
 * 类型: String
 * 必填: 否
 * 描述: 用户邮箱地址
 *
 * 字段名: full_name
 * 类型: String
 * 必填: 是
 * 默认值: "用户"
 * 描述: 用户显示名称
 *
 * 字段名: avatar_url
 * 类型: String
 * 必填: 否
 * 描述: 用户头像URL
 *
 * 字段名: subscription_plan
 * 类型: String
 * 必填: 是
 * 默认值: "free"
 * 枚举值: ["free", "pro", "premium"]
 * 描述: 用户订阅计划
 *
 * 字段名: subscription_status
 * 类型: String
 * 必填: 是
 * 默认值: "active"
 * 枚举值: ["active", "inactive", "cancelled"]
 * 描述: 订阅状态
 */

/**
 * 索引建议：
 * 1. id 字段 - 唯一索引 (用于快速查找用户资料)
 * 2. email 字段 - 普通索引 (如果需要按邮箱查询)
 * 3. subscription_plan 字段 - 普通索引 (用于统计和筛选)
 */
