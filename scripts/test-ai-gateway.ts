/**
 * Vercel AI Gateway 测试脚本
 * 验证 AI Gateway 配置是否正确
 */

import OpenAI from "openai";

async function testAIGateway() {
  const apiKey = process.env.AI_GATEWAY_API_KEY;

  if (!apiKey) {
    console.error("❌ AI_GATEWAY_API_KEY not found in environment");
    process.exit(1);
  }

  console.log("🧪 Vercel AI Gateway Test\n");
  console.log("Configuration:");
  console.log(`  API Key: ${apiKey.slice(0, 10)}...${apiKey.slice(-4)}`);
  console.log(`  Base URL: https://ai-gateway.vercel.sh/v1\n`);

  const client = new OpenAI({
    apiKey,
    baseURL: "https://ai-gateway.vercel.sh/v1",
  });

  // 测试 OpenAI 模型
  console.log("📤 Testing OpenAI (gpt-4o-mini)...");
  try {
    const startTime = Date.now();
    const response = await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "user",
          content:
            "Say 'Hello from OpenAI via Vercel AI Gateway!' in one sentence.",
        },
      ],
    });
    const duration = Date.now() - startTime;

    console.log("✅ OpenAI Test Successful");
    console.log(`   Response: ${response.choices[0].message.content}`);
    console.log(`   Tokens: ${response.usage?.total_tokens || "N/A"}`);
    console.log(`   Duration: ${duration}ms\n`);
  } catch (error: any) {
    console.error("❌ OpenAI Test Failed");
    console.error(`   Error: ${error.message}\n`);
  }

  // 测试 Anthropic 模型
  console.log("📤 Testing Anthropic (claude-haiku-4)...");
  try {
    const startTime = Date.now();
    const response = await client.chat.completions.create({
      model: "anthropic/claude-haiku-4",
      messages: [
        {
          role: "user",
          content:
            "Say 'Hello from Claude via Vercel AI Gateway!' in one sentence.",
        },
      ],
    });
    const duration = Date.now() - startTime;

    console.log("✅ Anthropic Test Successful");
    console.log(`   Response: ${response.choices[0].message.content}`);
    console.log(`   Tokens: ${response.usage?.total_tokens || "N/A"}`);
    console.log(`   Duration: ${duration}ms\n`);
  } catch (error: any) {
    console.error("❌ Anthropic Test Failed");
    console.error(`   Error: ${error.message}\n`);
  }

  // 测试 Google Gemini 模型
  console.log("📤 Testing Google (gemini-2.0-flash)...");
  try {
    const startTime = Date.now();
    const response = await client.chat.completions.create({
      model: "google/gemini-2.0-flash",
      messages: [
        {
          role: "user",
          content:
            "Say 'Hello from Gemini via Vercel AI Gateway!' in one sentence.",
        },
      ],
    });
    const duration = Date.now() - startTime;

    console.log("✅ Google Gemini Test Successful");
    console.log(`   Response: ${response.choices[0].message.content}`);
    console.log(`   Tokens: ${response.usage?.total_tokens || "N/A"}`);
    console.log(`   Duration: ${duration}ms\n`);
  } catch (error: any) {
    console.error("❌ Google Gemini Test Failed");
    console.error(`   Error: ${error.message}\n`);
  }

  console.log("🎉 All tests completed!");
  console.log("\n💡 Tips:");
  console.log(
    "  - Check Vercel Dashboard > AI Gateway > Overview for usage stats"
  );
  console.log(
    "  - Add BYOK credentials in Integrations for using your own API keys"
  );
  console.log("  - View cost breakdown in the Dashboard");
}

testAIGateway().catch(console.error);
