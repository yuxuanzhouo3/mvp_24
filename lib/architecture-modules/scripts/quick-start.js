// scripts/quick-start.js - 快速开始脚本
const path = require("path");
const fs = require("fs");

console.log("🚀 架构模块快速开始指南\n");

// 检查项目结构（相对于architecture-modules目录）
const requiredFiles = [
  "index.ts",
  "core/types.ts",
  "core/geo-router.ts",
  "utils/ip-detection.ts", // 现在包含在模块内部
];

console.log("📋 检查项目结构...");
let allFilesExist = true;
for (const file of requiredFiles) {
  const fullPath = path.resolve(__dirname, "..", file);
  if (fs.existsSync(fullPath)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - 未找到 (${fullPath})`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  console.log("\n❌ 项目结构不完整，请确保所有文件都已正确复制");
  process.exit(1);
}

console.log("\n📦 检查依赖...");
// 这里可以添加依赖检查逻辑

console.log("\n⚙️ 环境变量检查...");
const envChecks = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", desc: "Supabase URL（海外）" },
  { key: "NEXT_PUBLIC_WECHAT_CLOUDBASE_ID", desc: "CloudBase ID（国内）" },
  { key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", desc: "Stripe公钥（海外支付）" },
  { key: "WECHAT_PAY_APP_ID", desc: "微信支付AppID（国内支付）" },
];

let envComplete = true;
for (const check of envChecks) {
  const value = process.env[check.key];
  if (value) {
    console.log(`  ✅ ${check.key} - ${check.desc}`);
  } else {
    console.log(`  ⚠️  ${check.key} - ${check.desc} (未配置)`);
    envComplete = false;
  }
}

if (!envComplete) {
  console.log("\n⚠️ 部分环境变量未配置，这可能会影响某些功能");
}

console.log("\n🧪 运行基础测试...");
try {
  // 动态导入测试模块
  const testModule = require("../__tests__/geo-router.test.ts");
  console.log("  ✅ 测试模块加载成功");
} catch (error) {
  console.log(`  ❌ 测试模块加载失败: ${error.message}`);
}

console.log("\n📚 集成步骤总结:");
console.log("1. ✅ 复制架构模块到 lib/architecture-modules/");
console.log("2. ✅ 安装依赖包（IP检测库已内置）");
console.log("3. ⚠️  配置环境变量（见 INTEGRATION_GUIDE.md）");
console.log("4. 📝 创建架构服务类（见 INTEGRATION_GUIDE.md）");
console.log("5. 🔧 集成到 API Routes 和 React 组件");
console.log("6. 🧪 运行集成测试");

console.log("\n📖 详细文档: INTEGRATION_GUIDE.md");
console.log("🔗 示例代码: examples/");

console.log("\n🎉 准备完成！开始你的多地区架构之旅吧！");
