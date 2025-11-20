/**
 * CloudBase 配置和环境变量说明
 */

/**
 * 环境变量配置说明
 *
 * 需要在 .env.local 文件中配置以下变量：
 */
export const ENV_CONFIG = `
# ============================================
# 环境变量示例文件 (可以推送到Git)
# ============================================
# 使用方法: 复制此文件为 .env.local 并填写真实值

# Supabase配置 (海外用户)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# 腾讯云CloudBase配置 (国内用户)
CLOUDBASE_ENV=your_cloudbase_env_id
NEXT_PUBLIC_CLOUDBASE_ENV=your_cloudbase_env_id
NEXT_PUBLIC_WECHAT_CLOUDBASE_ID=your_cloudbase_env_id

# CloudBase密钥 (服务端专用)
CLOUDBASE_SECRET_ID=your_cloudbase_secret_id
CLOUDBASE_SECRET_KEY=your_cloudbase_secret_key

# 网站URL
NEXT_PUBLIC_SITE_URL=http://localhost:3000
`

/**
 * CloudBase 环境变量说明
 */
export const ENV_VARIABLES = {
  // 客户端环境变量（以 NEXT_PUBLIC_ 开头）
  'NEXT_PUBLIC_WECHAT_CLOUDBASE_ID': {
    description: 'CloudBase 环境ID',
    example: 'cloudbase-1gnip2iaa08260e5',
    required: true,
    client: true
  },

  // 服务端环境变量
  'CLOUDBASE_SECRET_ID': {
    description: 'CloudBase API 密钥ID',
    example: 'AKIDxxxxxxxxxxxxxxxxxxxxxxxxxx',
    required: true,
    client: false
  },

  'CLOUDBASE_SECRET_KEY': {
    description: 'CloudBase API 密钥',
    example: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    required: true,
    client: false
  },

  // 可选的环境变量名称（兼容性）
  'TENCENT_ENV_ID': {
    description: '腾讯云环境ID（可选，与 CLOUDBASE_ENV 相同）',
    example: 'cloudbase-1gnip2iaa08260e5',
    required: false,
    client: false
  },

  'TENCENT_SECRET_ID': {
    description: '腾讯云密钥ID（可选）',
    example: 'AKIDxxxxxxxxxxxxxxxxxxxxxxxxxx',
    required: false,
    client: false
  },

  'TENCENT_SECRET_KEY': {
    description: '腾讯云密钥（可选）',
    example: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    required: false,
    client: false
  }
}

/**
 * CloudBase 权限配置建议
 */
export const PERMISSION_CONFIG = {
  collections: {
    web_users: '仅管理端可读写',
    web_favorites: '所有用户可读，仅创建者可写',
    web_custom_sites: '所有用户可读，仅创建者可写',
    web_subscriptions: '仅管理端可读写',
    web_payment_transactions: '仅管理端可读写'
  },

  notes: [
    '用户数据需要严格保护，使用仅管理端权限',
    '收藏和自定义网站数据可以公开读取，但只能创建者修改',
    '支付相关数据必须使用仅管理端权限',
    '生产环境建议启用数据库访问控制'
  ]
}

/**
 * CloudBase SDK 依赖说明
 */
export const DEPENDENCIES = {
  required: [
    '@cloudbase/js-sdk',      // 浏览器端SDK
    '@cloudbase/node-sdk'     // 服务端SDK
  ],

  optional: [
    'bcryptjs',               // 密码加密
    'jsonwebtoken'            // JWT Token处理
  ],

  devDependencies: [
    '@types/node'             // Node.js类型定义
  ]
}