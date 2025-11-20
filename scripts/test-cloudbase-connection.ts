/**
 * CloudBase 连接测试脚本
 * 测试是否能够正确连接和操作 CloudBase 数据库
 */

import cloudbase from "@cloudbase/node-sdk";
import dotenv from "dotenv";
import path from "path";

// 加载环境变量
const envPath = path.resolve(process.cwd(), ".env.local");
dotenv.config({ path: envPath });

async function testCloudBaseConnection() {
  try {
    console.log("🔧 CloudBase 连接测试\n");
    console.log("=".repeat(60));

    const cloudbaseId = process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID || "";
    const secretId = process.env.CLOUDBASE_SECRET_ID || "";
    const secretKey = process.env.CLOUDBASE_SECRET_KEY || "";

    console.log(`📝 配置信息：`);
    console.log(`   - 环境 ID: ${cloudbaseId.substring(0, 10)}...`);
    console.log(`   - Secret ID: ${secretId.substring(0, 10)}...`);
    console.log(`   - Secret Key: ${secretKey.substring(0, 10)}...\n`);

    // 初始化 CloudBase
    console.log("🚀 初始化 CloudBase...");
    const app = cloudbase.init({
      env: cloudbaseId,
      secretId: secretId,
      secretKey: secretKey,
    });
    console.log("✅ CloudBase 初始化成功\n");

    // 获取数据库实例
    console.log("📦 获取数据库实例...");
    const db = app.database();
    console.log("✅ 数据库实例获取成功\n");

    // 测试查询 ai_conversations 集合
    console.log("🔍 测试查询 'ai_conversations' 集合...");
    const result = await db.collection("ai_conversations").limit(1).get();

    console.log(`✅ 集合查询成功`);
    console.log(`   - 返回记录数: ${result.data?.length || 0}\n`);

    // 测试创建文档
    console.log("✏️  测试创建文档...");
    const testData = {
      user_id: "test-user-123",
      title: "测试对话",
      model: "gpt-4",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages: [],
    };

    const createResult = await db.collection("ai_conversations").add(testData);

    console.log(`✅ 文档创建成功`);
    console.log(`   - 文档 ID: ${createResult.id}`);
    console.log(`   - 测试数据: ${JSON.stringify(testData, null, 2)}\n`);

    // 测试查询新创建的文档
    console.log("🔎 测试查询新创建的文档...");
    if (createResult.id) {
      const queryResult = await db
        .collection("ai_conversations")
        .doc(createResult.id)
        .get();

      if (queryResult.data && queryResult.data.length > 0) {
        console.log(`✅ 文档查询成功`);
        console.log(
          `   - 文档内容: ${JSON.stringify(queryResult.data[0], null, 2)}\n`
        );
      }

      // 清理：删除测试文档
      console.log("🗑️  清理测试数据...");
      await db.collection("ai_conversations").doc(createResult.id).remove();
      console.log(`✅ 测试文档已删除\n`);
    }

    console.log("=".repeat(60));
    console.log("✅ 所有测试通过！CloudBase 运行正常");
    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ 测试失败：");
    console.error(`   错误代码: ${error.code}`);
    console.error(`   错误信息: ${error.message}`);
    console.error(`   完整错误: ${JSON.stringify(error, null, 2)}`);
    process.exit(1);
  }
}

testCloudBaseConnection();
