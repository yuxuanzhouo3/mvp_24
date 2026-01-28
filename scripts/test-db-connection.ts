// scripts/test-db-connection.ts - 数据库连接测试脚本
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

// 手动加载环境变量
function loadEnv() {
  try {
    const envPath = join(process.cwd(), ".env.local");
    const envContent = readFileSync(envPath, "utf-8");
    const envVars = envContent.split("\n").filter((line) => line.includes("="));

    envVars.forEach((line) => {
      const [key, ...valueParts] = line.split("=");
      const value = valueParts.join("=").trim();
      if (key && value) {
        process.env[key.trim()] = value.replace(/^["']|["']$/g, ""); // 移除引号
      }
    });
  } catch (error) {
    console.warn("⚠️  无法加载 .env.local 文件:", (error as Error).message);
  }
}

async function testDatabaseConnection() {
  console.log("🔍 测试Supabase数据库连接...\n");

  // 加载环境变量
  loadEnv();

  // 获取环境变量
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("❌ 错误: 缺少Supabase环境变量");
    console.log("请检查 .env.local 文件中的:");
    console.log("- NEXT_PUBLIC_SUPABASE_URL");
    console.log("- NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return false;
  }

  console.log("📡 连接信息:");
  console.log(`- URL: ${supabaseUrl}`);
  console.log(`- Key: ${supabaseAnonKey.substring(0, 20)}...`);

  try {
    // 创建Supabase客户端
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 测试1: 基本连接测试
    console.log("\n🔗 测试1: 基本连接...");
    const { data: healthCheck, error: healthError } = await supabase
      .from("user_profiles")
      .select("count")
      .limit(1);

    if (healthError) {
      console.error("❌ 连接失败:", healthError.message);
      return false;
    }

    console.log("✅ 基本连接成功");

    // 测试2: 检查表是否存在
    console.log("\n📋 测试2: 检查数据库表...");

    const tables = [
      "user_profiles",
      "gpt_sessions",
      "gpt_messages",
      "subscriptions",
      "payments",
    ];
    const tableStatus: { [key: string]: boolean } = {};

    for (const table of tables) {
      try {
        const { error } = await supabase.from(table).select("*").limit(1);

        tableStatus[table] = !error;
        console.log(
          `${table}: ${!error ? "✅ 存在" : "❌ 不存在 - " + error.message}`
        );
      } catch (err) {
        tableStatus[table] = false;
        console.log(`${table}: ❌ 错误 - ${(err as Error).message}`);
      }
    }

    // 测试3: 尝试插入测试数据（如果表存在）
    console.log("\n💾 测试3: 数据操作测试...");

    const hasUserProfiles = tableStatus["user_profiles"];
    if (hasUserProfiles) {
      try {
        // 注意：这只是测试，不会实际插入数据
        const testQuery = supabase.from("user_profiles").select("*").limit(1);

        await testQuery;
        console.log("✅ 数据查询测试成功");
      } catch (err) {
        console.log("❌ 数据查询测试失败:", (err as Error).message);
      }
    } else {
      console.log("⚠️  跳过数据测试（表不存在）");
    }

    // 总结
    console.log("\n📊 测试总结:");
    const existingTables = Object.values(tableStatus).filter(Boolean).length;
    const totalTables = tables.length;

    console.log(`- 表存在: ${existingTables}/${totalTables}`);
    console.log(`- 连接状态: ✅ 正常`);

    if (existingTables === 0) {
      console.log("\n⚠️  警告: 没有找到任何数据库表");
      console.log("请在Supabase控制台运行数据库迁移脚本");
      console.log(
        "位置: supabase/migrations/20241201000000_initial_schema.sql"
      );
    } else if (existingTables < totalTables) {
      console.log("\n⚠️  部分表缺失，建议运行完整的数据库迁移");
    } else {
      console.log("\n🎉 数据库完全就绪！所有表都存在并可访问");
    }

    return true;
  } catch (error) {
    console.error("❌ 数据库连接测试失败:", (error as Error).message);
    return false;
  }
}

// 运行测试
testDatabaseConnection()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("测试脚本执行失败:", error);
    process.exit(1);
  });
