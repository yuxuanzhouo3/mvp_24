// scripts/add-webhook-support.ts - 添加webhook支持脚本
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

async function addWebhookSupport() {
  console.log("🔧 添加Webhook支持...\n");

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

    console.log("📋 执行数据库迁移...");

    // 由于没有service role key，我们将提供手动SQL命令
    console.log("\n📄 请在Supabase控制台的SQL编辑器中执行以下SQL：");
    console.log("========================================");

    const sql = `
-- 创建webhook事件表用于跟踪和去重webhook事件
create table if not exists public.webhook_events (
  id text primary key,
  provider text not null check (provider in ('paypal', 'stripe', 'alipay', 'wechat')),
  event_type text not null,
  event_data jsonb not null,
  processed boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  processed_at timestamp with time zone
);

-- 为webhook_events表启用行级安全
alter table public.webhook_events enable row level security;

-- 创建索引以提高查询性能
create index if not exists idx_webhook_events_provider on public.webhook_events(provider);
create index if not exists idx_webhook_events_processed on public.webhook_events(processed);
create index if not exists idx_webhook_events_created_at on public.webhook_events(created_at);

-- 为subscriptions表添加provider_subscription_id字段
alter table public.subscriptions
add column if not exists provider_subscription_id text;

-- 创建索引
create index if not exists idx_subscriptions_provider_subscription_id on public.subscriptions(provider_subscription_id);

-- 为payments表添加transaction_id索引（如果不存在）
create index if not exists idx_payments_transaction_id on public.payments(transaction_id);
    `;

    console.log(sql);
    console.log("========================================");

    // 尝试测试表是否存在
    console.log("\n🔍 测试webhook_events表...");

    try {
      const { error } = await supabase
        .from("webhook_events")
        .select("*")
        .limit(1);

      if (error) {
        console.log("❌ webhook_events表不存在，请先执行上述SQL");
        console.log("错误信息:", error.message);
        return false;
      } else {
        console.log("✅ webhook_events表已存在");
      }
    } catch (err) {
      console.log("❌ 无法检查webhook_events表，请先执行上述SQL");
      return false;
    }

    console.log("✅ Webhook支持检查完成！");
    console.log("📊 功能说明:");
    console.log("- webhook_events表：用于跟踪和去重webhook事件");
    console.log("- provider_subscription_id字段：关联支付提供商的订阅ID");
    console.log("- 相关索引：提升查询性能");

    return true;
  } catch (error) {
    console.error("❌ 添加webhook支持失败:", (error as Error).message);
    return false;
  }
}

// 运行脚本
addWebhookSupport()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("脚本执行失败:", error);
    process.exit(1);
  });
