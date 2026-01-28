/**
 * 测试 DeepSeek API 真实调用
 * 运行：npx tsx scripts/test-deepseek-api.ts
 */

async function testDeepSeekAPI() {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    console.error("❌ 未找到 DEEPSEEK_API_KEY");
    return;
  }

  console.log("🧪 测试 DeepSeek API...\n");
  console.log("API Key:", apiKey.substring(0, 10) + "...");
  console.log("Base URL: https://api.deepseek.com/v1\n");

  const url = "https://api.deepseek.com/v1/chat/completions";

  try {
    console.log("📤 发送请求...");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: "你好，请用一句话介绍你自己" }],
        temperature: 0.7,
        max_tokens: 100,
        stream: false,
      }),
    });

    console.log("📥 响应状态:", response.status, response.statusText);

    if (!response.ok) {
      const error = await response.json();
      console.error("❌ API 错误:", JSON.stringify(error, null, 2));
      return;
    }

    const data = await response.json();
    console.log("\n✅ API 调用成功！\n");
    console.log("🤖 DeepSeek 回复:", data.choices[0].message.content);
    console.log("\n📊 Token 使用:");
    console.log("  - Prompt Tokens:", data.usage.prompt_tokens);
    console.log("  - Completion Tokens:", data.usage.completion_tokens);
    console.log("  - Total Tokens:", data.usage.total_tokens);
    console.log(
      "\n💰 预估成本:",
      (data.usage.total_tokens * 0.000001).toFixed(6),
      "USD"
    );
  } catch (error) {
    console.error("❌ 请求失败:", error);
  }
}

testDeepSeekAPI();
