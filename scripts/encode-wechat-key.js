#!/usr/bin/env node

/**
 * 将微信支付私钥编码为 Base64，用于环境变量
 * 用法: node scripts/encode-wechat-key.js
 */

const fs = require('fs');
const path = require('path');

// 从 .env.local 读取私钥
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');

// 提取 WECHAT_PAY_PRIVATE_KEY
const match = envContent.match(/WECHAT_PAY_PRIVATE_KEY=([\s\S]*?)(?=\n[A-Z_]|$)/);

if (!match || !match[1]) {
  console.error('❌ 无法从 .env.local 找到 WECHAT_PAY_PRIVATE_KEY');
  process.exit(1);
}

const privateKeyPem = match[1].trim();
console.log('原始私钥长度:', privateKeyPem.length);
console.log('原始私钥预览:', privateKeyPem.substring(0, 100));

// 去除 PEM 格式，只保留 Base64 内容
const keyContent = privateKeyPem
  .replace(/-----BEGIN[^-]*-----/, '')
  .replace(/-----END[^-]*-----/, '')
  .replace(/\s/g, '');

console.log('\n提取后的 Base64 内容长度:', keyContent.length);

// 编码为 Base64
const encoded = Buffer.from(privateKeyPem).toString('base64');

console.log('\n✅ Base64 编码后的私钥（用于环境变量）：');
console.log('\nWECHAT_PAY_PRIVATE_KEY_BASE64=' + encoded);

console.log('\n📋 使用方式：');
console.log('1. 复制上面的编码私钥');
console.log('2. 在腾讯云部署环境设置中添加环境变量 WECHAT_PAY_PRIVATE_KEY_BASE64');
console.log('3. 或者在 .env.local 中替换 WECHAT_PAY_PRIVATE_KEY 为单行 Base64 格式');

console.log('\n💡 验证编码：');
const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
console.log('解码验证（应该与原始一致）:', decoded.substring(0, 100));
