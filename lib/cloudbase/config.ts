/**
 * CloudBase 认证配置
 * 仅用于认证功能，不再涉及数据库操作
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

# CloudBase认证配置 (国内用户)
NEXT_PUBLIC_WECHAT_CLOUDBASE_ID=your_cloudbase_env_id
CLOUDBASE_SECRET_ID=your_cloudbase_secret_id
CLOUDBASE_SECRET_KEY=your_cloudbase_secret_key

# 网站URL
NEXT_PUBLIC_SITE_URL=http://localhost:3000
`;

/**
 * CloudBase 环境变量说明
 */
export const ENV_VARIABLES = {
  // 客户端环境变量（以 NEXT_PUBLIC_ 开头）
  NEXT_PUBLIC_WECHAT_CLOUDBASE_ID: {
    description: "CloudBase 环境ID（用于认证）",
    example: "multigpt-6g9pqxiz52974a7c",
    required: true,
    client: true,
  },

  // 服务端环境变量
  CLOUDBASE_SECRET_ID: {
    description: "CloudBase API 密钥ID（用于服务端认证）",
    example: "AKIDxxxxxxxxxxxxxxxxxxxxxxxxxx",
    required: true,
    client: false,
  },

  CLOUDBASE_SECRET_KEY: {
    description: "CloudBase API 密钥（用于服务端认证）",
    example: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    required: true,
    client: false,
  },
};

/**
 * CloudBase SDK 依赖说明
 */
export const DEPENDENCIES = {
  required: [
    "@cloudbase/js-sdk", // 浏览器端认证SDK
    "@cloudbase/node-sdk", // 服务端认证SDK
  ],

  optional: [
    "bcryptjs", // 密码加密（如果需要）
    "jsonwebtoken", // JWT Token处理（如果需要）
  ],

  devDependencies: [
    "@types/node", // Node.js类型定义
  ],
};
