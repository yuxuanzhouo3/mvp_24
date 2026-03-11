/**
 * CloudBase 集合初始化脚本
 * 用于在腾讯云 CloudBase 中创建必需的集合
 *
 * 使用方法：
 * npm run init:cloudbase
 *
 * 注意：
 * 1. 某些数据库操作需要在 CloudBase 控制台中手动完成（如集合创建）
 * 2. 此脚本主要用于验证集合是否存在和索引配置
 * 3. 正式部署时应该在 CloudBase 控制台操作
 */

import cloudbase from "@cloudbase/node-sdk";
import dotenv from "dotenv";
import path from "path";

// 显式加载 .env.local 文件
const envPath = path.resolve(process.cwd(), ".env.local");
const envResult = dotenv.config({ path: envPath });

if (envResult.error) {
  console.warn(`⚠️  无法加载 .env.local: ${envResult.error.message}`);
}

console.log(`📁 环境文件: ${envPath}`);
console.log(`✅ 环境变量已加载\n`);

const cloudbaseId = process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID || "";
const secretId = process.env.CLOUDBASE_SECRET_ID || "";
const secretKey = process.env.CLOUDBASE_SECRET_KEY || "";

if (!cloudbaseId || !secretId || !secretKey) {
  console.error("❌ 缺少必需的环境变量：");
  console.error(
    `   - NEXT_PUBLIC_WECHAT_CLOUDBASE_ID: ${cloudbaseId ? "✅" : "❌"}`
  );
  console.error(`   - CLOUDBASE_SECRET_ID: ${secretId ? "✅" : "❌"}`);
  console.error(`   - CLOUDBASE_SECRET_KEY: ${secretKey ? "✅" : "❌"}`);
  process.exit(1);
}

console.log(`🔑 环境配置验证：`);
console.log(`   - CloudBase 环境 ID: ${cloudbaseId.substring(0, 10)}...`);
console.log(`   - Secret ID 已设置: ✅`);
console.log(`   - Secret Key 已设置: ✅\n`);

const app = cloudbase.init({
  env: cloudbaseId,
  secretId: secretId,
  secretKey: secretKey,
});

const db = app.database();

// 需要创建的集合 (方案 1: 单表设计 - 无 user_profiles)
const REQUIRED_COLLECTIONS = [
  "web_users",
  "ai_conversations",
  "payments",
  "tokens",
  "subscriptions",
  "wechat_logins",
  "security_logs",
  "refresh_tokens",
  "admin_users", // 添加管理员用户集合
  "advertisements", // 广告集合
  "app_releases", // 应用发布集合
  "plan_quota_settings", // 套餐月额度配置
  "web_referral_links",
  "web_referral_clicks",
  "web_referral_relations",
  "web_referral_rewards",
];

async function checkCollectionExists(collectionName: string): Promise<boolean> {
  try {
    console.log(`🔍 检查集合 "${collectionName}" 是否存在...`);

    // 尝试查询集合中的第一条记录
    const result = await db.collection(collectionName).limit(1).get();

    console.log(`✅ 集合 "${collectionName}" 存在`);
    return true;
  } catch (error: any) {
    if (error.code === "DATABASE_COLLECTION_NOT_EXIST") {
      console.log(`❌ 集合 "${collectionName}" 不存在`);
      return false;
    }
    throw error;
  }
}

async function initCloudBaseCollections() {
  console.log("\n🚀 开始初始化 CloudBase 集合\n");
  console.log("=".repeat(60));

  const missingCollections: string[] = [];

  for (const collectionName of REQUIRED_COLLECTIONS) {
    try {
      const exists = await checkCollectionExists(collectionName);
      if (!exists) {
        missingCollections.push(collectionName);
      }
    } catch (error) {
      console.error(`❌ 检查集合 "${collectionName}" 时出错:`, error);
    }
  }

  console.log("\n" + "=".repeat(60));

  if (missingCollections.length === 0) {
    console.log("✅ 所有集合都已存在！系统已准备好。");
    return;
  }

  console.log(`\n⚠️  发现 ${missingCollections.length} 个缺失的集合：`);
  missingCollections.forEach((name) => {
    console.log(`   - ${name}`);
  });

  console.log("\n📋 请在腾讯云 CloudBase 控制台中执行以下步骤：\n");

  console.log("1️⃣  打开腾讯云 CloudBase 控制台");
  console.log(`   URL: https://console.cloud.tencent.com/tcb/db`);
  console.log(`   环境 ID: ${process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID}\n`);

  console.log("2️⃣  创建以下集合（如果不存在）：");
  missingCollections.forEach((name) => {
    console.log(`   - ${name}`);
  });

  console.log("\n3️⃣  为集合创建必要的索引：");
  console.log("   web_users:");
  console.log("     - 唯一索引: email");
  console.log("     - 普通索引: created_at (倒序)");
  console.log("     - 普通索引: subscription_status");
  console.log("     - 唯一索引: referral_code (可选/非空)");
  console.log("     - 普通索引: referred_by\n");

  console.log("   ai_conversations:");
  console.log("     - 复合索引: (user_id, created_at)");
  console.log("     - 普通索引: model\n");

  console.log("   payments:");
  console.log("     - 复合索引: (user_id, created_at)");
  console.log("     - 唯一索引: order_id");
  console.log("     - 普通索引: status\n");

  console.log("   tokens:");
  console.log("     - 复合索引: (user_id, created_at)");
  console.log("     - 普通索引: model\n");

  console.log("   subscriptions:");
  console.log("     - 普通索引: user_id");
  console.log("     - 普通索引: status");
  console.log("     - 普通索引: end_date\n");

  console.log("   wechat_logins:");
  console.log("     - 唯一索引: open_id");
  console.log("     - 普通索引: user_id\n");

  console.log("   security_logs:");
  console.log("     - 复合索引: (user_id, created_at)");
  console.log("     - 复合索引: (email, created_at)");
  console.log("     - 普通索引: event\n");

  console.log("   refresh_tokens:");
  console.log("     - 唯一索引: tokenId");
  console.log("     - 复合索引: (userId, createdAt)");
  console.log("     - 复合索引: (isRevoked, expiresAt)");
  console.log("     - 普通索引: expiresAt\n");

  console.log("   admin_users:");
  console.log("     - 唯一索引: username\n");

  console.log("   advertisements:");
  console.log("     - 普通索引: created_at (倒序)\n");

  console.log("   app_releases:");
  console.log("     - 普通索引: created_at (倒序)");
  console.log("     - 复合索引: (platform, variant)\n");

  console.log("   plan_quota_settings:");
  console.log("     - 唯一索引: plan_id\n");

  console.log("   web_referral_links:");
  console.log("     - 唯一索引: share_code");
  console.log("     - 复合索引: (creator_user_id, created_at)");
  console.log("     - 普通索引: is_active\n");

  console.log("   web_referral_clicks:");
  console.log("     - 复合索引: (share_code, created_at)");
  console.log("     - 普通索引: registered_user_id\n");

  console.log("   web_referral_relations:");
  console.log("     - 唯一索引: invited_user_id");
  console.log("     - 复合索引: (inviter_user_id, invited_user_id)");
  console.log("     - 普通索引: created_at");
  console.log("     - 普通索引: first_paid_transaction_id\n");

  console.log("   web_referral_rewards:");
  console.log("     - 唯一索引: reference_id");
  console.log("     - 复合索引: (user_id, created_at)");
  console.log("     - 普通索引: relation_id");
  console.log("     - 普通索引: related_transaction_id");
  console.log("     - 普通索引: status\n");

  console.log("4️⃣  创建完成后，重新运行此脚本验证：");
  console.log("   npm run init:cloudbase\n");

  // 创建默认管理员
  await createDefaultAdmin();
}

// 创建默认管理员用户
async function createDefaultAdmin() {
  console.log("\n👤 检查并创建默认管理员用户...");

  try {
    // 检查是否已存在管理员
    const existingAdmin = await db.collection("admin_users").limit(1).get();

    if (existingAdmin.data && existingAdmin.data.length > 0) {
      console.log("✅ 默认管理员已存在，跳过创建");
      return;
    }

    // 创建默认管理员
    const defaultAdmin = {
      username: "admin",
      password_hash: "$2b$10$FzplvF7W18GPKf1IB7LcqO/LgGFDq6vh036PuOMHKB4nlTGgXSef.", // bcrypt hash for "admin123"
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.collection("admin_users").add(defaultAdmin);

    console.log("✅ 默认管理员创建成功");
    console.log("   用户名: admin");
    console.log("   密码: admin123");
    console.log("   ⚠️  请在生产环境中立即修改默认密码！");

  } catch (error) {
    console.error("❌ 创建默认管理员失败:", error);
    console.log("   请手动在 CloudBase 控制台创建管理员用户");
  }
}

// 重置管理员密码
async function resetAdminPassword() {
  console.log("\n🔑 重置管理员密码...");

  try {
    const newPassword = "admin123";
    const newHash = "$2b$10$FzplvF7W18GPKf1IB7LcqO/LgGFDq6vh036PuOMHKB4nlTGgXSef."; // bcrypt hash for "admin123"

    const result = await db.collection("admin_users").where({
      username: "admin"
    }).update({
      password_hash: newHash,
      updated_at: new Date().toISOString(),
    });

    if (result.updated > 0) {
      console.log("✅ 管理员密码重置成功");
      console.log("   用户名: admin");
      console.log("   密码: admin123");
    } else {
      console.log("❌ 未找到管理员用户");
    }

  } catch (error) {
    console.error("❌ 重置密码失败:", error);
  }
}

// 运行初始化
const command = process.argv[2];
if (command === "reset-admin") {
  resetAdminPassword().catch((error) => {
    console.error("❌ 重置失败:", error);
    process.exit(1);
  });
} else {
  initCloudBaseCollections().catch((error) => {
    console.error("❌ 初始化失败:", error);
    process.exit(1);
  });
}
