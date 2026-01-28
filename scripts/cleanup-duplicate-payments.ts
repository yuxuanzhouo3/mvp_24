// scripts/cleanup-duplicate-payments.ts
// 清理重复的支付记录

import { readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";

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

// 创建supabase admin客户端
function createSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
  }

  return createClient(supabaseUrl, serviceRoleKey || (anonKey as string), {
    auth: { persistSession: false },
  });
}

interface Payment {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  transaction_id: string | null;
  created_at: string;
}

async function findDuplicatePayments() {
  console.log("正在查找重复的支付记录...\n");

  const supabaseAdmin = createSupabaseAdmin();
  const { data: payments, error } = await supabaseAdmin
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("获取支付记录失败:", error);
    return;
  }

  if (!payments || payments.length === 0) {
    console.log("未找到支付记录");
    return;
  }

  console.log(`总共找到 ${payments.length} 条支付记录\n`);

  // 按用户、金额、货币、支付方式分组
  const groups = new Map<string, Payment[]>();

  payments.forEach((payment: Payment) => {
    const key = `${payment.user_id}-${payment.amount}-${payment.currency}-${payment.payment_method}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(payment);
  });

  // 找出重复的组
  const duplicates: Array<{ key: string; payments: Payment[] }> = [];

  groups.forEach((groupPayments, key) => {
    if (groupPayments.length > 1) {
      // 检查是否在短时间内创建
      const sorted = groupPayments.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      for (let i = 1; i < sorted.length; i++) {
        const timeDiff =
          new Date(sorted[i].created_at).getTime() -
          new Date(sorted[i - 1].created_at).getTime();

        // 如果在5分钟内创建了多个相同的支付，认为是重复
        if (timeDiff < 5 * 60 * 1000) {
          const isDuplicate = duplicates.find((d) => d.key === key);
          if (!isDuplicate) {
            duplicates.push({ key, payments: sorted });
          }
          break;
        }
      }
    }
  });

  if (duplicates.length === 0) {
    console.log("✅ 未发现重复的支付记录");
    return;
  }

  console.log(`⚠️  发现 ${duplicates.length} 组重复的支付记录:\n`);

  duplicates.forEach((group, index) => {
    const [userId, amount, currency, method] = group.key.split("-");
    console.log(`--- 重复组 ${index + 1} ---`);
    console.log(`用户ID: ${userId}`);
    console.log(`金额: ${amount} ${currency}`);
    console.log(`支付方式: ${method}`);
    console.log(`记录数: ${group.payments.length}\n`);

    group.payments.forEach((payment, i) => {
      console.log(`  ${i + 1}. ID: ${payment.id}`);
      console.log(`     状态: ${payment.status}`);
      console.log(`     交易ID: ${payment.transaction_id || "无"}`);
      console.log(`     创建时间: ${payment.created_at}\n`);
    });
  });

  return duplicates;
}

async function deleteDuplicatePayments(dryRun: boolean = true) {
  const duplicates = await findDuplicatePayments();

  if (!duplicates || duplicates.length === 0) {
    return;
  }

  console.log("\n" + "=".repeat(60));

  if (dryRun) {
    console.log("\n🔍 预览模式 - 以下是将要删除的记录:\n");

    let totalToDelete = 0;

    duplicates.forEach((group) => {
      // 保留第一个（最早的）支付记录，删除其他的
      const toDelete = group.payments.slice(1);
      totalToDelete += toDelete.length;

      console.log(`组: ${group.key}`);
      console.log(
        `保留: ${group.payments[0].id} (${group.payments[0].status})`
      );
      console.log(
        `删除: ${toDelete.map((p) => `${p.id} (${p.status})`).join(", ")}\n`
      );
    });

    console.log(`\n总共将删除 ${totalToDelete} 条重复记录`);
    console.log(
      "\n💡 要执行实际删除，请使用: npm run cleanup-payments -- --confirm"
    );
  } else {
    console.log("\n⚠️  确认删除模式 - 正在删除重复记录...\n");

    const supabaseAdmin = createSupabaseAdmin();
    let deletedCount = 0;

    for (const group of duplicates) {
      const toDelete = group.payments.slice(1);

      for (const payment of toDelete) {
        const { error } = await supabaseAdmin
          .from("payments")
          .delete()
          .eq("id", payment.id);

        if (error) {
          console.error(`❌ 删除失败: ${payment.id}`, error);
        } else {
          console.log(`✅ 已删除: ${payment.id} (${payment.status})`);
          deletedCount++;
        }
      }
    }

    console.log(`\n✅ 成功删除 ${deletedCount} 条重复支付记录`);
  }
}

// 主函数
async function main() {
  // 加载环境变量
  loadEnv();

  const args = process.argv.slice(2);
  const confirm = args.includes("--confirm");

  console.log("🔍 支付记录重复检测和清理工具\n");
  console.log("=".repeat(60) + "\n");

  await deleteDuplicatePayments(!confirm);
}

main().catch((error) => {
  console.error("执行失败:", error);
  process.exit(1);
});
