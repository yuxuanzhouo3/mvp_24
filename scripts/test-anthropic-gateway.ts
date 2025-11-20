/**
 * 测试 Anthropic Gateway 连接
 */

import Anthropic from "@anthropic-ai/sdk";

async function testAnthropicGateway() {
  console.log("🧪 测试 Anthropic Gateway 连接\n");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.ANTHROPIC_BASE_URL;

  if (!apiKey) {
    console.error("❌ ANTHROPIC_API_KEY 未设置");
    process.exit(1);
  }

  console.log("📋 配置信息:");
  console.log(`   API Key: ${apiKey.substring(0, 10)}...`);
  console.log(
    `   Base URL: ${baseURL || "默认 (https://api.anthropic.com)"}\n`
  );

  const client = new Anthropic({
    apiKey,
    baseURL,
  });

  try {
    console.log("🔄 发送测试请求...\n");

    const startTime = Date.now();

    const response = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 50,
      messages: [
        {
          role: "user",
          content: "Hello! Please respond with 'Connection successful!'",
        },
      ],
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log("✅ API 调用成功！\n");
    console.log("📊 响应信息:");
    console.log(`   模型: ${response.model}`);
    console.log(
      `   回复: ${
        response.content[0]?.type === "text" ? response.content[0].text : "N/A"
      }`
    );
    console.log(
      `   用量: ${
        response.usage.input_tokens + response.usage.output_tokens
      } tokens`
    );
    console.log(`   耗时: ${duration}ms\n`);

    if (response.usage) {
      const cost =
        (response.usage.input_tokens * 0.00025 +
          response.usage.output_tokens * 0.00125) /
        1000;
      console.log(`💰 预估成本: $${cost.toFixed(6)}`);
    }

    console.log("\n✨ Anthropic Gateway 配置正确！");
  } catch (error: any) {
    console.error("\n❌ 测试失败:");
    console.error(`   错误: ${error.message}`);
    if (error.status) {
      console.error(`   状态码: ${error.status}`);
    }
    if (error.type) {
      console.error(`   错误类型: ${error.type}`);
    }
    console.log("\n💡 请检查:");
    console.log("   1. ANTHROPIC_API_KEY 是否正确");
    console.log("   2. ANTHROPIC_BASE_URL 是否可访问");
    console.log("   3. 网络连接是否正常");
    process.exit(1);
  }
}

testAnthropicGateway();
