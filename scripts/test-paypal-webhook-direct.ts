// scripts/test-paypal-webhook-direct.ts - 直接测试PayPal webhook端点
async function testPayPalWebhookDirect() {
  console.log("🧪 直接测试PayPal webhook端点...\n");

  const webhookUrl =
    "https://mvp-24-main.vercel.app/api/payment/webhook/paypal";

  // 模拟PayPal webhook payload
  const testPayload = {
    id: "WH-TEST-" + Date.now(),
    event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
    resource: {
      id: "I-TEST-" + Date.now(),
      status: "ACTIVE",
      subscriber: {
        email_address: "test@example.com",
      },
    },
    create_time: new Date().toISOString(),
  };

  console.log("📤 发送测试webhook到:", webhookUrl);
  console.log("📋 Payload:", JSON.stringify(testPayload, null, 2));
  console.log("");

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // 注意：这里没有包含PayPal的签名头，因为我们设置了跳过验证
      },
      body: JSON.stringify(testPayload),
    });

    console.log("📥 响应状态:", response.status);
    console.log("📥 响应头:", Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log("📥 响应内容:", responseText);

    if (response.ok) {
      console.log("✅ Webhook请求成功!");
    } else {
      console.log("❌ Webhook请求失败");
    }
  } catch (error) {
    console.error("❌ 请求过程中发生错误:", error);
  }

  console.log("\n🎯 现在检查数据库是否有新的webhook事件...");
  console.log(
    "运行: npx tsx --env-file=.env.local scripts/check-paypal-webhooks.ts"
  );
}

// 如果直接运行此脚本
if (require.main === module) {
  testPayPalWebhookDirect().catch(console.error);
}

export { testPayPalWebhookDirect };
