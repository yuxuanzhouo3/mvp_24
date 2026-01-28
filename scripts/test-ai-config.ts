/**
 * AI 配置测试脚本
 * 测试双配置系统是否正常工作
 */

import {
  loadAIConfig,
  getEnabledAgents,
  hasEnabledAI,
  getProviderConfig,
} from "../lib/ai/ai-config-loader";

console.log("🧪 开始测试 AI 配置系统\n");

// 测试中国区域
console.log("========== 🇨🇳 中国区域配置 ==========");
const chinaConfig = loadAIConfig("china");
console.log("区域:", chinaConfig.region);
console.log("总智能体数量:", chinaConfig.agents.length);
console.log(
  "已启用智能体:",
  getEnabledAgents("china").map((a) => a.name)
);
console.log("有可用 AI:", hasEnabledAI("china"));

chinaConfig.providers.forEach((p) => {
  console.log(`\n${p.provider}:`);
  console.log("  - 状态:", p.enabled ? "✅ 已启用" : "❌ 未启用");
  console.log("  - API Key:", p.apiKey ? "已配置" : "❌ 未配置");
  console.log("  - Base URL:", p.baseURL);
});

// 测试全球区域
console.log("\n========== 🌍 全球区域配置 ==========");
const globalConfig = loadAIConfig("global");
console.log("区域:", globalConfig.region);
console.log("总智能体数量:", globalConfig.agents.length);
console.log(
  "已启用智能体:",
  getEnabledAgents("global").map((a) => a.name)
);
console.log("有可用 AI:", hasEnabledAI("global"));

globalConfig.providers.forEach((p) => {
  console.log(`\n${p.provider}:`);
  console.log("  - 状态:", p.enabled ? "✅ 已启用" : "❌ 未启用");
  console.log("  - API Key:", p.apiKey ? "已配置" : "❌ 未配置");
  console.log("  - Base URL:", p.baseURL);
});

// 测试 USA 作为 global 的别名
console.log("\n========== 🇺🇸 USA 区域（应使用全球配置）==========");
const usaConfig = loadAIConfig("usa");
console.log("区域:", usaConfig.region);
console.log("已启用智能体数量:", getEnabledAgents("usa").length);

console.log("\n✅ 测试完成！");
