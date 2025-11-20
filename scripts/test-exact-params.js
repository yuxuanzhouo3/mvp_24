// 测试与实际应用完全相同的参数
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

async function testWithDifferentParams() {
  const AlipaySdkClass = AlipaySdk.default || AlipaySdk;
  const sdk = new AlipaySdkClass({
    appId: "9021000157643313",
    privateKey: formatPrivateKey(privateKey),
    alipayPublicKey: formatPublicKey(alipayPublicKey),
    gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
    signType: "RSA2",
    camelcase: false,
  });

  console.log("测试不同的参数组合...\n");

  // 测试1: 最简参数（不带URL）
  console.log("=== 测试1: 不带 notify_url 和 return_url ===");
  try {
    const result1 = await sdk.pageExec(
      "alipay.trade.page.pay",
      {},
      {
        bizContent: {
          out_trade_no: "test_" + Date.now(),
          product_code: "FAST_INSTANT_TRADE_PAY",
          total_amount: "0.01",
          subject: "test",
        },
      }
    );
    console.log("✅ 成功生成表单");

    // 提取并打印URL
    const actionMatch = result1.match(/action="([^"]+)"/);
    if (actionMatch) {
      const url = actionMatch[1];
      console.log("请在浏览器中打开以下URL测试支付:\n");
      console.log(url);
      console.log("\n");
    }
  } catch (error) {
    console.error("❌ 失败:", error.message);
  }

  // 等待1秒
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 测试2: 带完整URL
  console.log("\n=== 测试2: 带 notify_url 和 return_url ===");
  try {
    const result2 = await sdk.pageExec(
      "alipay.trade.page.pay",
      {
        notify_url: "http://localhost:3000/api/payment/alipay/notify",
        return_url: "http://localhost:3000/payment/success",
      },
      {
        bizContent: {
          out_trade_no: "test_" + Date.now(),
          product_code: "FAST_INSTANT_TRADE_PAY",
          total_amount: "0.01",
          subject: "test",
        },
      }
    );
    console.log("✅ 成功生成表单");

    const actionMatch = result2.match(/action="([^"]+)"/);
    if (actionMatch) {
      const url = actionMatch[1];
      console.log("请在浏览器中打开以下URL测试支付:\n");
      console.log(url);
      console.log("\n");
    }
  } catch (error) {
    console.error("❌ 失败:", error.message);
  }

  // 等待1秒
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 测试3: 使用exec方法代替pageExec
  console.log("\n=== 测试3: 使用 exec 方法 ===");
  try {
    const result3 = await sdk.exec(
      "alipay.trade.page.pay",
      {
        notify_url: "http://localhost:3000/api/payment/alipay/notify",
        return_url: "http://localhost:3000/payment/success",
      },
      {
        bizContent: {
          out_trade_no: "test_" + Date.now(),
          product_code: "FAST_INSTANT_TRADE_PAY",
          total_amount: "0.01",
          subject: "test",
        },
      }
    );
    console.log("✅ exec 方法成功");
    console.log("返回结果:", JSON.stringify(result3, null, 2));
  } catch (error) {
    console.error("❌ 失败:", error.message);
  }
}

testWithDifferentParams();
