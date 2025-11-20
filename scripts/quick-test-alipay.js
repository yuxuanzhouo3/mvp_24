// 快速测试支付宝 SDK
const fs = require("fs");
const AlipaySdk = require("alipay-sdk");

// 读取 .env.local 文件
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

console.log("私钥长度:", privateKey.length);
console.log("公钥长度:", alipayPublicKey.length);

// 格式化密钥
const formatPrivateKey = (key) => {
  if (key.includes("BEGIN")) return key;
  return `-----BEGIN RSA PRIVATE KEY-----\n${key}\n-----END RSA PRIVATE KEY-----`;
};

const formatPublicKey = (key) => {
  if (key.includes("BEGIN")) return key;
  return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
};

async function test() {
  console.log("\n初始化 SDK...");

  const AlipaySdkClass = AlipaySdk.default || AlipaySdk;
  const sdk = new AlipaySdkClass({
    appId: "9021000157643313",
    privateKey: formatPrivateKey(privateKey),
    alipayPublicKey: formatPublicKey(alipayPublicKey),
    gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
    signType: "RSA2",
    camelcase: false,
  });

  console.log("SDK 初始化成功");

  try {
    console.log("\n创建 0.01 元测试订单...");
    const result = await sdk.pageExec(
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
          subject: "Test",
        },
      }
    );

    console.log("✅ SDK 调用成功！");
    console.log("返回的HTML包含 <form>:", result.includes("<form"));
    console.log("返回的HTML包含 alipay:", result.includes("alipay"));

    // 提取表单action URL
    const actionMatch = result.match(/action="([^"]+)"/);
    if (actionMatch) {
      console.log("表单提交地址:", actionMatch[1]);
    }
  } catch (error) {
    console.error("❌ 错误:", error.message);
    console.error("完整错误:", error);
  }
}

test();
