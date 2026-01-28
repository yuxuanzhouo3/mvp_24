/**
 * 执行 Supabase SQL 迁移：添加 metadata 字段到 payments 表
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
    console.log("🔄 开始执行迁移...\n");

    // 1. 验证表结构
    console.log("1️⃣  检查 payments 表结构...");
    const { data: tableInfo, error: checkError } = await supabaseAdmin
      .from("payments")
      .select("id")
      .limit(1);

    if (checkError && checkError.code !== "PGRST116") {
      console.error("❌ 无法访问 payments 表:", checkError);
      return;
    }

    console.log("✅ payments 表可以访问");

    // 2. 提示用户手动执行迁移
    console.log("\n2️⃣  需要手动执行以下 SQL 迁移：\n");
    console.log("在 Supabase 控制台 → SQL Editor 中执行：\n");
    console.log(`
┌─────────────────────────────────────────────────────────────┐
│ 添加 metadata 字段到 payments 表                              │
└─────────────────────────────────────────────────────────────┘

-- 添加 metadata 列
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT NULL;

-- 添加 GIN 索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_payments_metadata 
  ON public.payments USING gin (metadata);

-- 添加列注释
COMMENT ON COLUMN public.payments.metadata IS 
  'JSON metadata containing payment details like days, paymentType, billingCycle';
    `);

    console.log("\n✅ 完成后请：");
    console.log("   1. 重启应用服务");
    console.log("   2. 重新创建支付订单");
    console.log("   3. 数据应该会正确保存到数据库");
  } catch (error) {
    console.error("❌ 脚本执行失败:", error);
  }
}

console.log("🚀 Supabase 迁移工具\n");
console.log("=".repeat(60));
applyMigration().catch(console.error);
