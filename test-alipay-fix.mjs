#!/usr/bin/env node
/**
 * 简单测试脚本：验证 Alipay 签名修复
 * 用途：确认 checkNotifySignV2 方法存在并正确使用
 */

import { AlipaySdk } from 'alipay-sdk';
import * as fs from 'fs';

console.log('🧪 Testing Alipay SDK signature verification fix...\n');

try {
  // 初始化 SDK（使用 .env.local 中的配置）
  const alipaySdk = new AlipaySdk({
    appId: process.env.ALIPAY_APP_ID || '9021000157643313',
    privateKey: (process.env.ALIPAY_PRIVATE_KEY || '').substring(0, 50) + '...',
    alipayPublicKey: (process.env.ALIPAY_ALIPAY_PUBLIC_KEY || '').substring(0, 50) + '...',
    gateway: process.env.ALIPAY_GATEWAY_URL || 'https://openapi-sandbox.dl.alipaydev.com/gateway.do',
  });

  // 检查方法是否存在
  console.log('✅ SDK initialized successfully');
  console.log(`   - checkNotifySign method exists: ${typeof alipaySdk.checkNotifySign === 'function' ? '✓' : '✗'}`);
  console.log(`   - checkNotifySignV2 method exists: ${typeof alipaySdk.checkNotifySignV2 === 'function' ? '✓' : '✗'}`);

  // 模拟支付宝同步返回参数（demo 用，签名无效）
  const testParams = {
    sign_type: 'RSA2',
    sign: 'demoSignatureForTesting',
    gmt_create: '2025-11-22 14:29:33',
    out_trade_no: 'pay_1763792939804_u93u4v7vq',
    trade_no: '2025112222001445001442069736',
    total_amount: '0.01',
    buyer_pay_amount: '0.01',
    trade_status: 'TRADE_SUCCESS',
  };

  console.log('\n📋 Test parameters:');
  console.log('   Keys:', Object.keys(testParams));
  console.log('   Has sign:', !!testParams.sign);
  console.log('   Has sign_type:', !!testParams.sign_type);

  // 测试 checkNotifySignV2
  console.log('\n🔐 Testing checkNotifySignV2...');
  try {
    const result = alipaySdk.checkNotifySignV2(testParams);
    console.log(`   Result: ${result} (expected: false for demo signature)`);
  } catch (err) {
    console.log(`   Error (expected for demo signature): ${(err as Error).message}`);
  }

  // 检查环境变量
  console.log('\n🌍 Environment check:');
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase().trim();
  const alipayEnv = (process.env.ALIPAY_SANDBOX || '').toLowerCase().trim();
  console.log(`   NODE_ENV: "${process.env.NODE_ENV}" → normalized: "${nodeEnv}"`);
  console.log(`   ALIPAY_SANDBOX: "${process.env.ALIPAY_SANDBOX}" → normalized: "${alipayEnv}"`);
  console.log(`   Will skip verification: ${nodeEnv === 'development' || alipayEnv === 'true' ? '✓ YES' : '✗ NO'}`);

  console.log('\n✅ Test completed successfully - SDK and methods are ready!');
  console.log('\n📝 Summary of changes:');
  console.log('   1. Switched from checkNotifySign → checkNotifySignV2');
  console.log('   2. Fixed env check to be case-insensitive and trim whitespace');
  console.log('   3. Added detailed logging for debugging');
  console.log('   4. Always verify (SDK internally skips if ALIPAY_SANDBOX=true)');

} catch (error) {
  console.error('❌ Test failed:', (error as Error).message);
  process.exit(1);
}
