/**
 * Test All OpenRouter Models
 * 测试所有通过 Vercel OpenRouter 配置的模型
 */

import { aiRouter } from "../lib/ai/router";
import { GLOBAL_AI_AGENTS } from "../lib/ai/global-ai.config";

async function testAllModels() {
  console.log("🚀 Testing All OpenRouter Models\n");
  console.log(`Total models to test: ${GLOBAL_AI_AGENTS.length}\n`);

  // 按提供商分组
  const modelsByProvider = GLOBAL_AI_AGENTS.reduce((acc, agent) => {
    const provider = agent.model.split("/")[0];
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(agent);
    return acc;
  }, {} as Record<string, typeof GLOBAL_AI_AGENTS>);

  console.log("📋 Models by Provider:");
  for (const [provider, agents] of Object.entries(modelsByProvider)) {
    console.log(`  ${provider}: ${agents.length} models`);
  }
  console.log("");

  // 测试每个提供商的第一个模型
  console.log("🧪 Testing sample models from each provider:\n");

  for (const [provider, agents] of Object.entries(modelsByProvider)) {
    const agent = agents[0]; // 测试第一个模型
    console.log(`Testing ${provider}/${agent.name}...`);

    try {
      // 检查模型是否可用
      const isAvailable = aiRouter.isModelAvailable(agent.model);
      console.log(`  ✓ Model available: ${isAvailable}`);

      // 获取 provider
      const providerInstance = await aiRouter.getProviderForModel(agent.model);
      console.log(`  ✓ Provider: ${providerInstance.name || "OpenRouter"}`);

      console.log(`  ✓ Test passed\n`);
    } catch (error) {
      console.error(
        `  ✗ Test failed: ${error instanceof Error ? error.message : error}\n`
      );
    }
  }

  // 显示所有模型列表
  console.log("📝 All Available Models:\n");
  for (const agent of GLOBAL_AI_AGENTS) {
    const provider = agent.model.split("/")[0];
    console.log(
      `  ${provider.padEnd(12)} | ${agent.model.padEnd(35)} | ${
        agent.description
      }`
    );
  }

  console.log("\n✅ Test completed!");
}

// 运行测试
testAllModels().catch(console.error);
