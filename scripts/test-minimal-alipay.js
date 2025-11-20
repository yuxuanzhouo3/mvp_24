// 测试最简化的支付宝参数
const fs = require("fs");
const AlipaySdk = require("alipay-sdk");

// 读取 .env.local
const envContent = fs.readFileSync(".env.local", "utf8");
const envLines = envContent.split("\n");

let privateKey = "";
let alipayPublicKey = "";

for (const line of envLines) {
  if (line.startsWith("ALIPAY_PRIVATE_KEY=")) {
    privateKey = line.substring("ALIPAY_PRIVATE_KEY=".length).trim();
  } else if (line.startsWith("ALIPAY_ALIPAY_PUBLIC_KEY=")) {
    alipayPublicKey = line.substring("ALIPAY_ALIPAY_PUBLIC_KEY=".length).trim();
  }
}

const formatPrivateKey = (key) => {
  if (key.includes("BEGIN")) return key;
  return `-----BEGIN RSA PRIVATE KEY-----\n${key}\n-----END RSA PRIVATE KEY-----`;
};

const formatPublicKey = (key) => {
  if (key.includes("BEGIN")) return key;
  return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
};

async function testMinimalParams() {
  const AlipaySdkClass = AlipaySdk.default || AlipaySdk;
  const sdk = new AlipaySdkClass({
    appId: "9021000157643313",
    privateKey: formatPrivateKey(privateKey),
    alipayPublicKey: formatPublicKey(alipayPublicKey),
    gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
    signType: "RSA2",
    camelcase: false,
  });

  console.log("=== 测试1: 使用 alipay.trade.wap.pay (手机网站支付) ===\n");
  try {
    const result1 = await sdk.pageExec(
      "alipay.trade.wap.pay",
      {},
      {
        bizContent: {
          out_trade_no: "wap_" + Date.now(),
          total_amount: "0.01",
          subject: "test",
          product_code: "QUICK_WAP_WAY",
        },
      }
    );
    console.log("✅ alipay.trade.wap.pay 成功生成表单");
    const actionMatch = result1.match(/action="([^"]+)"/);
    if (actionMatch) {
      console.log("URL:", actionMatch[1].substring(0, 150) + "...\n");
    }
  } catch (error) {
    console.error("❌ alipay.trade.wap.pay 失败:", error.message, "\n");
  }

  console.log("=== 测试2: 使用 alipay.trade.page.pay 不带 product_code ===\n");
  try {
    const result2 = await sdk.pageExec(
      "alipay.trade.page.pay",
      {},
      {
        bizContent: {
          out_trade_no: "page_" + Date.now(),
          total_amount: "0.01",
          subject: "test",
        },
      }
    );
    console.log("✅ 无 product_code 成功生成表单");
    const actionMatch = result2.match(/action="([^"]+)"/);
    if (actionMatch) {
      console.log("URL:", actionMatch[1].substring(0, 150) + "...\n");
    }
  } catch (error) {
    console.error("❌ 无 product_code 失败:", error.message, "\n");
  }

  console.log("=== 测试3: 使用 alipay.trade.create (统一收单) ===\n");
  try {
    const result3 = await sdk.exec(
      "alipay.trade.create",
      {},
      {
        bizContent: {
          out_trade_no: "create_" + Date.now(),
          total_amount: "0.01",
          subject: "test",
          buyer_id: "2088722086682040", // 沙箱买家ID
        },
      }
    );
    console.log("✅ alipay.trade.create 成功");
    console.log("结果:", JSON.stringify(result3, null, 2), "\n");
  } catch (error) {
    console.error("❌ alipay.trade.create 失败:", error.message, "\n");
  }

  console.log("=== 测试4: 查询可用的支付产品 ===");
  console.log("请访问沙箱控制台检查以下产品是否已开通：");
  console.log(
    "1. 电脑网站支付 (alipay.trade.page.pay + FAST_INSTANT_TRADE_PAY)"
  );
  console.log("2. 手机网站支付 (alipay.trade.wap.pay + QUICK_WAP_WAY)");
  console.log("3. APP支付 (alipay.trade.app.pay + QUICK_MSECURITY_PAY)");
  console.log("4. 当面付 (alipay.trade.precreate + FACE_TO_FACE_PAYMENT)");
}

testMinimalParams();
