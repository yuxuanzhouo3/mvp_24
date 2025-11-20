// scripts/check-auth-status.ts - 检查认证状态脚本
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

async function checkAuthStatus() {
  console.log("🔍 检查认证状态...\n");

  // 加载环境变量
  loadEnv();

  // 获取环境变量
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("❌ 错误: 缺少Supabase环境变量");
    return false;
  }

  try {
    // 创建Supabase客户端
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 检查session
    console.log("📋 检查当前session...");
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) {
      console.error("❌ 获取session失败:", sessionError.message);
      return false;
    }

    if (sessionData.session) {
      console.log("✅ 发现有效session");
      console.log(`   用户ID: ${sessionData.session.user.id}`);
      console.log(`   邮箱: ${sessionData.session.user.email}`);
      console.log(`   创建时间: ${sessionData.session.user.created_at}`);
      console.log(`   最后登录: ${sessionData.session.user.last_sign_in_at}`);

      // 检查用户数据
      console.log("\n👤 检查用户数据...");
      const { data: userData, error: userError } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", sessionData.session.user.id)
        .single();

      if (userError) {
        console.log("❌ 获取用户数据失败:", userError.message);
      } else {
        console.log("✅ 用户数据存在");
        console.log(`   姓名: ${userData.full_name}`);
        console.log(`   邮箱: ${userData.email}`);
        console.log(`   订阅计划: ${userData.subscription_plan}`);
      }

      return true;
    } else {
      console.log("❌ 没有找到有效session，用户未登录");
      return false;
    }
  } catch (error) {
    console.error("❌ 检查认证状态失败:", (error as Error).message);
    return false;
  }
}

// 运行检查
checkAuthStatus()
  .then((isLoggedIn) => {
    console.log(`\n📊 认证状态: ${isLoggedIn ? "已登录" : "未登录"}`);
    process.exit(isLoggedIn ? 0 : 1);
  })
  .catch((error) => {
    console.error("检查脚本执行失败:", error);
    process.exit(1);
  });
