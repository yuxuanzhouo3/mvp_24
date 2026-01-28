/**
 * 应用 Supabase 迁移：修复 payments 和 subscriptions 表的外键
 * 问题：这些表的 user_id 外键引用 user_profiles，但 INTL 模式不使用 user_profiles
 * 解决：改为直接引用 auth.users(id)
 */

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);

async function applyMigration() {
  try {
    console.log("🔄 修复 payments 和 subscriptions 表的外键...\n");
    console.log("=".repeat(70));

    // 检查当前约束
    console.log("\n📋 当前约束信息：\n");
    console.log("问题描述：");
    console.log("  ❌ payments.user_id 引用 → user_profiles(id)");
    console.log("  ❌ subscriptions.user_id 引用 → user_profiles(id)");
    console.log("  ❌ 但 INTL 模式不使用 user_profiles 表\n");

    console.log("解决方案：");
    console.log("  ✅ payments.user_id 引用 → auth.users(id)");
    console.log("  ✅ subscriptions.user_id 引用 → auth.users(id)\n");

    console.log("=".repeat(70));
    console.log("\n🚀 需要在 Supabase 控制台执行以下 SQL：\n");

    const sql = `
-- ========================================
-- 修复外键约束
-- ========================================

-- 1️⃣ 删除旧的外键约束
ALTER TABLE public.payments
DROP CONSTRAINT IF EXISTS payments_user_id_fkey;

ALTER TABLE public.subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey;

-- 2️⃣ 添加新的外键约束（直接引用 auth.users）
ALTER TABLE public.payments
ADD CONSTRAINT payments_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.subscriptions
ADD CONSTRAINT subscriptions_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3️⃣ 验证迁移成功
SELECT constraint_name, table_name, column_name 
FROM information_schema.key_column_usage 
WHERE table_name IN ('payments', 'subscriptions') 
AND column_name = 'user_id';
    `;

    console.log(sql);
    console.log("\n" + "=".repeat(70));

    console.log("\n✅ 执行步骤：\n");
    console.log("1. 复制上面的 SQL");
    console.log("2. 打开 Supabase 控制台 → SQL Editor");
    console.log("3. 粘贴并执行 SQL");
    console.log("4. 重启应用");
    console.log("5. 重新测试支付流程\n");

    console.log("📝 验证完成标志：");
    console.log("✓ payments.user_id 外键指向 auth.users(id)");
    console.log("✓ subscriptions.user_id 外键指向 auth.users(id)");
    console.log("✓ 能成功创建支付记录");
    console.log("✓ 能成功创建订阅记录\n");
  } catch (error) {
    console.error("❌ 脚本执行失败:", error);
  }
}

console.log("\n🔧 Supabase 外键修复工具\n");
applyMigration().catch(console.error);
