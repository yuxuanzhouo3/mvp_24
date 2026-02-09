#!/usr/bin/env node

/**
 * 广告功能测试脚本
 * 用于调试和测试广告系统
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function testAdvertisementAPI() {
  console.log("🧪 开始测试广告 API...\n");

  try {
    // 1. 测试获取所有广告
    console.log("1️⃣  测试获取所有广告...");
    const response1 = await fetch(`${BASE_URL}/api/advertisements`);
    const data1 = await response1.json();
    console.log("✅ 结果:", data1);
    console.log("");

    // 2. 测试按位置筛选广告
    console.log("2️⃣  测试按位置筛选广告 (top)...");
    const response2 = await fetch(`${BASE_URL}/api/advertisements?position=top`);
    const data2 = await response2.json();
    console.log("✅ 结果:", data2);
    console.log("");

    // 3. 测试不同位置
    const positions = ["top", "bottom", "left", "right", "sidebar", "bottom-left", "bottom-right"];
    console.log("3️⃣  测试所有位置的广告...");
    for (const pos of positions) {
      const response = await fetch(`${BASE_URL}/api/advertisements?position=${pos}`);
      const data = await response.json();
      console.log(`   ${pos}: ${data.count} 条广告`);
    }
    console.log("");

    console.log("✨ 测试完成！\n");
    console.log("📝 说明:");
    console.log("   - 公开 API: /api/advertisements");
    console.log("   - 支持参数: ?position=<position>");
    console.log("   - 返回已启用的广告列表");
    console.log("   - 后台管理: /admin/ads (需要管理员权限)\n");

  } catch (error) {
    console.error("❌ 测试失败:", error);
  }
}

async function debugDatabaseStatus() {
  console.log("🔍 数据库状态检查...\n");
  
  console.log("📊 广告表信息:");
  console.log("   表名: advertisements");
  console.log("   字段: id, title, position, media_type, media_url, target_url, is_active, priority, created_at, source, file_size");
  console.log("");
  console.log("💡 如何启用广告:");
  console.log("   1. 访问后台管理界面: http://localhost:3000/admin/ads");
  console.log("   2. 点击 '新建广告' 按钮");
  console.log("   3. 填写广告信息");
  console.log("   4. 上传广告图片或视频");
  console.log("   5. 点击 '创建' 按钮");
  console.log("   6. 在列表中启用广告（切换状态开关）");
  console.log("");
  console.log("🎯 前台显示位置:");
  console.log("   - top: 顶部横幅");
  console.log("   - bottom: 底部横幅");
  console.log("   - left: 输入框左侧");
  console.log("   - right: 输入框右侧");
  console.log("   - sidebar: 侧边栏");
  console.log("   - bottom-left: 底部左侧");
  console.log("   - bottom-right: 底部右侧");
  console.log("");
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("         🎨 广告系统诊断工具");
  console.log("═══════════════════════════════════════════════════════════════\n");

  await testAdvertisementAPI();
  await debugDatabaseStatus();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("         ✨ 诊断完成");
  console.log("═══════════════════════════════════════════════════════════════");
}

main().catch(console.error);
