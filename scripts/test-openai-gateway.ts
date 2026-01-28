/**
 * 测试 OpenAI Gateway 连接
 */

import OpenAI from "openai";

async function testOpenAIGateway() {
  console.log("🧪 测试 OpenAI Gateway 连接\n");

  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL;

  if (!apiKey) {
    console.error("❌ OPENAI_API_KEY 未设置");
    process.exit(1);
  }

  console.log("📋 配置信息:");
  console.log(`   API Key: ${apiKey.substring(0, 10)}...`);
  console.log(
    `   Base URL: ${baseURL || "默认 (https://api.openai.com/v1)"}\n`
  );

  const client = new OpenAI({
    apiKey,
    baseURL,
  });

  try {
    console.log("🔄 发送测试请求...\n");

    const startTime = Date.now();

    const response = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: "Hello! Please respond with 'Connection successful!'",
        },
      ],
      max_tokens: 50,
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log("✅ API 调用成功！\n");
    console.log("📊 响应信息:");
    console.log(`   模型: ${response.model}`);
    console.log(`   回复: ${response.choices[0]?.message?.content}`);
    console.log(`   用量: ${response.usage?.total_tokens} tokens`);
    console.log(`   耗时: ${duration}ms\n`);

    if (response.usage) {
      const cost =
        (response.usage.prompt_tokens * 0.0005 +
          response.usage.completion_tokens * 0.0015) /
        1000;
      console.log(`💰 预估成本: $${cost.toFixed(6)}`);
    }

    console.log("\n✨ OpenAI Gateway 配置正确！");
  } catch (error: any) {
    console.error("\n❌ 测试失败:");
    console.error(`   错误: ${error.message}`);
    if (error.status) {
      console.error(`   状态码: ${error.status}`);
    }
    if (error.code) {
      console.error(`   错误代码: ${error.code}`);
    }
    console.log("\n💡 请检查:");
    console.log("   1. OPENAI_API_KEY 是否正确");
    console.log("   2. OPENAI_BASE_URL 是否可访问");
    console.log("   3. 网络连接是否正常");
    process.exit(1);
  }
}

testOpenAIGateway();
