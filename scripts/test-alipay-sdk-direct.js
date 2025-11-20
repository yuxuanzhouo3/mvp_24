// 直接测试支付宝 SDK
const AlipaySdk = require("alipay-sdk");

async function testAlipaySDK() {
  console.log("初始化支付宝 SDK...");
  console.log("APP_ID: 9021000157643313");

  // 格式化密钥
  const formatPrivateKey = (key) => {
    if (key.includes("BEGIN")) return key;
    return `-----BEGIN RSA PRIVATE KEY-----\n${key}\n-----END RSA PRIVATE KEY-----`;
  };

  const formatPublicKey = (key) => {
    if (key.includes("BEGIN")) return key;
    return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
  };

  const privateKey = process.env.ALIPAY_PRIVATE_KEY;
  const publicKey = process.env.ALIPAY_ALIPAY_PUBLIC_KEY;

  if (!privateKey || !publicKey) {
    console.error(
      "❌ 错误: 请设置环境变量 ALIPAY_PRIVATE_KEY 和 ALIPAY_ALIPAY_PUBLIC_KEY"
    );
    process.exit(1);
  }

  const AlipaySdkClass = AlipaySdk.default || AlipaySdk;
  const sdk = new AlipaySdkClass({
    appId: "9021000157643313",
    privateKey: formatPrivateKey(privateKey),
    alipayPublicKey: formatPublicKey(publicKey),
    gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
    signType: "RSA2",
    camelcase: false,
  });

  console.log("\n创建测试订单...");

  try {
    // 测试: 使用1分钱测试
    console.log("\n=== 测试: 0.01元订单 ===");
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
    console.log("✅ 测试成功！");
    console.log("HTML包含form:", result.includes("<form"));
  } catch (error) {
    console.error("❌ 测试失败:", error.message);
  }
}

testAlipaySDK();
