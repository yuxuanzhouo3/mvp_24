#!/usr/bin/env node

/**
 * 腾讯云云开发环境变量验证脚本
 * 用于检查生产环境的环境变量配置是否正确
 */

const requiredEnvVars = [
  // 应用基础配置
  "APP_NAME",
  "APP_URL",
  "NEXT_PUBLIC_APP_URL",
  "NODE_ENV",

  // Supabase 配置
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",

  // 微信云开发
  "NEXT_PUBLIC_WECHAT_CLOUDBASE_ID",

  // Stripe 支付
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",

  // PayPal 支付
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_ENVIRONMENT",
  "PAYPAL_WEBHOOK_ID",

  // 支付宝支付
  "ALIPAY_APP_ID",
  "ALIPAY_GATEWAY_URL",
  "ALIPAY_SANDBOX",
  "ALIPAY_PRIVATE_KEY",
  "ALIPAY_PUBLIC_KEY",

  // AI 服务
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",

  // 地理位置服务
  "IP_API_URL",
  "GEO_CACHE_TTL",
];

const optionalEnvVars = [
  "PAYPAL_SKIP_SIGNATURE_VERIFICATION",
  "ALIPAY_APP_CERT_PATH",
  "ALIPAY_ALIPAY_PUBLIC_CERT_PATH",
  "ALIPAY_ALIPAY_ROOT_CERT_PATH",
  "WECHAT_APP_SECRET",
  "DOMESTIC_SYSTEM_URL",
  "INTERNATIONAL_SYSTEM_URL",
  "DB_CONNECTION_TIMEOUT",
  "AI_GATEWAY_API_KEY",
];

console.log("🔍 检查腾讯云云开发环境变量配置...\n");

let missingRequired = [];
let missingOptional = [];
let presentVars = [];

requiredEnvVars.forEach((varName) => {
  if (process.env[varName]) {
    presentVars.push(varName);
    console.log(`✅ ${varName}: 已配置`);
  } else {
    missingRequired.push(varName);
    console.log(`❌ ${varName}: 缺失 (必需)`);
  }
});

console.log("\n📋 可选环境变量:");
optionalEnvVars.forEach((varName) => {
  if (process.env[varName]) {
    console.log(`✅ ${varName}: 已配置`);
  } else {
    missingOptional.push(varName);
    console.log(`⚠️  ${varName}: 未配置 (可选)`);
  }
});

console.log("\n📊 检查结果:");
console.log(`✅ 已配置变量: ${presentVars.length}`);
console.log(`❌ 缺失必需变量: ${missingRequired.length}`);
console.log(`⚠️  缺失可选变量: ${missingOptional.length}`);

if (missingRequired.length > 0) {
  console.log("\n🚨 严重问题: 以下必需环境变量未配置:");
  missingRequired.forEach((varName) => {
    console.log(`   - ${varName}`);
  });
  console.log("\n请在腾讯云云开发控制台的环境变量设置中添加这些变量。");
  process.exit(1);
} else {
  console.log("\n🎉 所有必需环境变量都已正确配置！");
}

// 检查一些关键配置的值
console.log("\n🔧 关键配置检查:");
console.log(`应用名称: ${process.env.APP_NAME || "未设置"}`);
console.log(`应用URL: ${process.env.APP_URL || "未设置"}`);
console.log(`环境: ${process.env.NODE_ENV || "未设置"}`);
console.log(
  `Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? "已配置" : "未配置"}`
);
console.log(
  `Stripe密钥: ${process.env.STRIPE_SECRET_KEY ? "已配置" : "未配置"}`
);
console.log(
  `DeepSeek API: ${process.env.DEEPSEEK_API_KEY ? "已配置" : "未配置"}`
);

console.log("\n💡 部署建议:");
console.log("1. 确保所有环境变量已在腾讯云云开发控制台中正确设置");
console.log("2. 检查应用是否已正确部署到云函数或云托管");
console.log("3. 访问正确的URL（不带端口号）");
console.log("4. 查看云开发控制台的日志，确认应用启动正常");
