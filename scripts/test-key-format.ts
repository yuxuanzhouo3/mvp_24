// scripts/test-key-format.ts - 测试不同的私钥格式
const AlipaySdk = require("alipay-sdk");
import * as fs from "fs";

async function testKeyFormats() {
  // 读取base64私钥
  const base64Key = fs.readFileSync("alipay_private_base64.txt", "utf8").trim();
  const pemKey = fs.readFileSync("pkcs1_private.pem", "utf8");

  console.log("Testing different key formats...\n");

  // 测试1: Base64格式(无PEM头尾)
  console.log("Test 1: Base64 format (no PEM headers)");
  try {
    const sdk1 = new AlipaySdk.default({
      appId: process.env.ALIPAY_APP_ID || "9021000157643313",
      privateKey: base64Key,
      signType: "RSA2",
      alipayPublicKey: process.env.ALIPAY_ALIPAY_PUBLIC_KEY,
      gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
    });

    const result1 = await sdk1.pageExec("alipay.trade.page.pay", "POST", {
      out_trade_no: "test_" + Date.now(),
      product_code: "FAST_INSTANT_TRADE_PAY",
      total_amount: "0.01",
      subject: "Test",
    });

    console.log("✅ Base64 format works!");
    console.log("Result preview:", result1.substring(0, 100) + "...\n");
  } catch (error: any) {
    console.log("❌ Base64 format failed:", error.message, "\n");
  }

  // 测试2: PEM格式(带头尾)
  console.log("Test 2: PEM format (with headers)");
  try {
    const sdk2 = new AlipaySdk.default({
      appId: process.env.ALIPAY_APP_ID || "9021000157643313",
      privateKey: pemKey,
      signType: "RSA2",
      alipayPublicKey: process.env.ALIPAY_ALIPAY_PUBLIC_KEY,
      gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
    });

    const result2 = await sdk2.pageExec("alipay.trade.page.pay", "POST", {
      out_trade_no: "test_" + Date.now(),
      product_code: "FAST_INSTANT_TRADE_PAY",
      total_amount: "0.01",
      subject: "Test",
    });

    console.log("✅ PEM format works!");
    console.log("Result preview:", result2.substring(0, 100) + "...\n");
  } catch (error: any) {
    console.log("❌ PEM format failed:", error.message, "\n");
  }

  // 测试3: PEM格式但去除换行(\n替换为实际换行)
  console.log("Test 3: PEM format with actual line breaks");
  try {
    const multilinePem = pemKey.replace(/\\n/g, "\n");
    const sdk3 = new AlipaySdk.default({
      appId: process.env.ALIPAY_APP_ID || "9021000157643313",
      privateKey: multilinePem,
      signType: "RSA2",
      alipayPublicKey: process.env.ALIPAY_ALIPAY_PUBLIC_KEY,
      gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
    });

    const result3 = await sdk3.pageExec("alipay.trade.page.pay", "POST", {
      out_trade_no: "test_" + Date.now(),
      product_code: "FAST_INSTANT_TRADE_PAY",
      total_amount: "0.01",
      subject: "Test",
    });

    console.log("✅ Multi-line PEM format works!");
    console.log("Result preview:", result3.substring(0, 100) + "...");
  } catch (error: any) {
    console.log("❌ Multi-line PEM format failed:", error.message);
  }
}

testKeyFormats();
