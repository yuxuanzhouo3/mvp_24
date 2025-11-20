// scripts/test-paypal-webhook.ts - 测试PayPal webhook验证
import { createHmac } from "crypto";

async function testPayPalWebhook() {
  console.log("🔍 测试PayPal Webhook配置...\n");

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  console.log("1. 检查环境变量:");
  console.log(`   PAYPAL_WEBHOOK_ID: ${webhookId ? "✅ 已设置" : "❌ 未设置"}`);
  console.log(`   PAYPAL_CLIENT_ID: ${clientId ? "✅ 已设置" : "❌ 未设置"}`);
  console.log(
    `   PAYPAL_CLIENT_SECRET: ${clientSecret ? "✅ 已设置" : "❌ 未设置"}`
  );

  if (!webhookId || !clientId || !clientSecret) {
    console.error("❌ 缺少必要的PayPal环境变量");
    return;
  }

  console.log("\n2. 测试PayPal API连接:");

  try {
    // 获取访问令牌
    const baseUrl =
      process.env.PAYPAL_ENVIRONMENT === "production"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";

    const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${clientId}:${clientSecret}`
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!tokenRes.ok) {
      console.error("❌ 获取PayPal访问令牌失败:", await tokenRes.text());
      return;
    }

    const tokenData = await tokenRes.json();
    console.log("✅ 成功获取访问令牌");

    // 测试webhook验证
    console.log("\n3. 测试webhook验证:");

    // 创建一个模拟的webhook事件
    const mockEvent = {
      id: "WH-1234567890",
      event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
      resource: {
        id: "I-TEST123",
        status: "ACTIVE",
      },
    };

    // 模拟PayPal签名头
    const transmissionId = "test-transmission-id";
    const timestamp = new Date().toISOString();

    // 注意：这只是模拟，实际的PayPal签名验证需要真实的证书
    console.log("⚠️  注意：这是模拟测试，实际webhook需要真实的PayPal签名");
    console.log(`   Webhook ID: ${webhookId}`);
    console.log(`   模拟事件类型: ${mockEvent.event_type}`);
    console.log(`   模拟资源ID: ${mockEvent.resource.id}`);

    // 测试webhook列表API
    console.log("\n4. 检查已注册的webhooks:");

    const webhooksRes = await fetch(`${baseUrl}/v1/notifications/webhooks`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
    });

    if (!webhooksRes.ok) {
      console.error("❌ 获取webhook列表失败:", await webhooksRes.text());
    } else {
      const webhooksData = await webhooksRes.json();
      console.log(
        `✅ 找到 ${webhooksData.webhooks?.length || 0} 个已注册的webhook:`
      );

      webhooksData.webhooks?.forEach((webhook: any, index: number) => {
        console.log(`   ${index + 1}. ID: ${webhook.id}`);
        console.log(`      URL: ${webhook.url}`);
        console.log(
          `      事件: ${
            webhook.event_types?.map((et: any) => et.name).join(", ") || "无"
          }`
        );
        console.log("");
      });

      // 检查我们的webhook ID是否存在
      const ourWebhook = webhooksData.webhooks?.find(
        (w: any) => w.id === webhookId
      );
      if (ourWebhook) {
        console.log("✅ 找到匹配的webhook配置!");
        console.log(`   URL: ${ourWebhook.url}`);
        console.log(`   状态: ${ourWebhook.status}`);
      } else {
        console.log("❌ 未找到匹配的webhook配置");
        console.log("💡 请确保在PayPal开发者控制台创建了正确的webhook");
      }
    }
  } catch (error) {
    console.error("❌ 测试过程中发生错误:", error);
  }

  console.log("\n🎉 PayPal Webhook测试完成!");
}

// 如果直接运行此脚本
if (require.main === module) {
  testPayPalWebhook().catch(console.error);
}

export { testPayPalWebhook };
