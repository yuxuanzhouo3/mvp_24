/**
 * 插入测试用户到 CloudBase web_users 集合
 * 使用方法: node scripts/insert-test-user.js
 */

require("dotenv").config({ path: ".env.local" });
const cloudbase = require("@cloudbase/node-sdk");
const bcrypt = require("bcryptjs");

async function insertTestUser() {
  try {
    console.log("🔌 初始化 CloudBase...");
    console.log("ENV ID:", process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID);

    const app = cloudbase.init({
      env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
      secretId: process.env.CLOUDBASE_SECRET_ID,
      secretKey: process.env.CLOUDBASE_SECRET_KEY,
    });

    const db = app.database();
    const usersCollection = db.collection("web_users");

    // 测试用户信息
    const testEmail = "test@example.com";
    const testPassword = "Test123456";
    const hashedPassword = await bcrypt.hash(testPassword, 10);

    console.log(`📝 准备插入测试用户: ${testEmail}`);

    // 检查用户是否已存在
    const existingUser = await usersCollection
      .where({ email: testEmail })
      .get();

    if (existingUser.data && existingUser.data.length > 0) {
      console.log(`⚠️ 用户 ${testEmail} 已存在，跳过插入`);
      console.log("已有用户信息:");
      console.log(JSON.stringify(existingUser.data[0], null, 2));
      return;
    }

    // 创建新用户
    const newUser = {
      email: testEmail,
      password: hashedPassword,
      name: "测试用户",
      pro: false,
      region: "china",
      avatar: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log("📊 新用户数据:", newUser);

    const result = await usersCollection.add(newUser);

    console.log(`✅ 测试用户插入成功!`);
    console.log(`📌 用户ID: ${result.id}`);
    console.log(`📧 邮箱: ${testEmail}`);
    console.log(`🔑 密码: ${testPassword}`);
    console.log("\n可以用这个账号登录测试系统了！");
  } catch (error) {
    console.error("❌ 错误:", error.message);
    console.error("完整错误:", error);
    process.exit(1);
  }
}

insertTestUser();
