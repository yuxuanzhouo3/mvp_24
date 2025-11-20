// lib/architecture-modules/layers/third-party/payment/providers/config-templates.ts
// 支付提供商配置模板 - 供各系统参考和复制

// ==================== 支付宝配置模板 ====================
export interface AlipayConfigTemplate {
  // 应用配置
  appId: string; // 支付宝应用ID
  privateKey: string; // 应用私钥
  publicKey: string; // 支付宝公钥

  // 回调配置
  notifyUrl: string; // 异步通知URL (服务器回调)
  returnUrl?: string; // 同步跳转URL (用户支付完成后跳转)

  // 环境配置
  gatewayUrl?: string; // 支付宝网关地址，默认生产环境
  sandbox?: boolean; // 是否沙箱环境

  // 可选配置
  timeout?: number; // 请求超时时间(毫秒)
  signType?: "RSA2" | "RSA"; // 签名类型，默认RSA2
}

/**
 * 支付宝配置示例
 */
export const alipayConfigExample: AlipayConfigTemplate = {
  appId: "your_alipay_app_id",
  privateKey: `-----BEGIN PRIVATE KEY-----
你的应用私钥内容
-----END PRIVATE KEY-----`,
  publicKey: `-----BEGIN PUBLIC KEY-----
支付宝公钥内容
-----END PUBLIC KEY-----`,
  notifyUrl: "https://your-domain.com/api/payment/webhook/alipay",
  returnUrl: "https://your-domain.com/payment/success",
  sandbox: false, // 生产环境设为false
  timeout: 30000,
  signType: "RSA2",
};

// ==================== 微信支付配置模板 ====================
export interface WechatConfigTemplate {
  // 应用配置
  appId: string; // 微信应用ID
  mchId: string; // 商户号

  // 密钥配置
  privateKey: string; // 商户私钥
  serialNo: string; // 证书序列号
  apiv3PrivateKey?: string; // APIv3私钥 (新版本需要)

  // 回调配置
  notifyUrl: string; // 异步通知URL

  // 环境配置
  sandbox?: boolean; // 是否沙箱环境

  // 可选配置
  timeout?: number; // 请求超时时间(毫秒)
}

/**
 * 微信支付配置示例
 */
export const wechatConfigExample: WechatConfigTemplate = {
  appId: "your_wechat_app_id",
  mchId: "your_merchant_id",
  privateKey: `-----BEGIN PRIVATE KEY-----
你的商户私钥内容
-----END PRIVATE KEY-----`,
  serialNo: "your_certificate_serial_number",
  apiv3PrivateKey: "your_apiv3_private_key",
  notifyUrl: "https://your-domain.com/api/payment/wechat/notify",
  sandbox: false,
  timeout: 30000,
};

// ==================== Stripe配置模板 ====================
export interface StripeConfigTemplate {
  // 密钥配置
  secretKey: string; // 秘密密钥 (sk_live_xxx)
  publishableKey: string; // 发布密钥 (pk_live_xxx)

  // Webhook配置
  webhookSecret: string; // Webhook签名密钥

  // 页面配置
  successUrl: string; // 支付成功跳转URL
  cancelUrl: string; // 支付取消跳转URL

  // 可选配置
  timeout?: number; // 请求超时时间(毫秒)
}

/**
 * Stripe配置示例
 */
export const stripeConfigExample: StripeConfigTemplate = {
  secretKey: "sk_live_your_secret_key_here",
  publishableKey: "pk_live_your_publishable_key_here",
  webhookSecret: "whsec_your_webhook_secret_here",
  successUrl:
    "https://your-domain.com/payment/success?session_id={CHECKOUT_SESSION_ID}",
  cancelUrl: "https://your-domain.com/payment/cancel",
  timeout: 30000,
};

// ==================== 配置验证函数 ====================

/**
 * 验证支付宝配置
 */
export function validateAlipayConfig(config: AlipayConfigTemplate): void {
  const required = ["appId", "privateKey", "publicKey", "notifyUrl"];
  for (const key of required) {
    if (!config[key as keyof AlipayConfigTemplate]) {
      throw new Error(`Alipay config missing: ${key}`);
    }
  }
}

/**
 * 验证微信支付配置
 */
export function validateWechatConfig(config: WechatConfigTemplate): void {
  const required = ["appId", "mchId", "privateKey", "serialNo", "notifyUrl"];
  for (const key of required) {
    if (!config[key as keyof WechatConfigTemplate]) {
      throw new Error(`WeChat config missing: ${key}`);
    }
  }
}

/**
 * 验证Stripe配置
 */
export function validateStripeConfig(config: StripeConfigTemplate): void {
  const required = [
    "secretKey",
    "publishableKey",
    "webhookSecret",
    "successUrl",
    "cancelUrl",
  ];
  for (const key of required) {
    if (!config[key as keyof StripeConfigTemplate]) {
      throw new Error(`Stripe config missing: ${key}`);
    }
  }
}
