// scripts/cleanup-duplicate-payment-records.ts
// 清理重复的支付记录
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface Payment {
  id: string;
  user_id: string;
  transaction_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  created_at: string;
}

async function findDuplicatePayments() {
  console.log("\n🔍 Searching for duplicate payment records...\n");

  // 查找所有有transaction_id的支付记录
  const { data: allPayments, error } = await supabase
    .from("payments")
    .select("*")
    .not("transaction_id", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("❌ Error fetching payments:", error);
    return;
  }

  if (!allPayments || allPayments.length === 0) {
    console.log("✅ No payments found");
    return;
  }

  console.log(`📊 Total payments with transaction_id: ${allPayments.length}`);

  // 按 transaction_id + user_id 分组
  const grouped = new Map<string, Payment[]>();

  for (const payment of allPayments) {
    const key = `${payment.transaction_id}|${payment.user_id}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(payment);
  }

  // 找出重复的
  const duplicates: { key: string; payments: Payment[] }[] = [];
  for (const [key, payments] of grouped.entries()) {
    if (payments.length > 1) {
      duplicates.push({ key, payments });
    }
  }

  if (duplicates.length === 0) {
    console.log("✅ No duplicate payment records found!");
    return;
  }

  console.log(
    `\n⚠️  Found ${duplicates.length} groups with duplicate records:\n`
  );

  let totalDuplicates = 0;
  const recordsToDelete: string[] = [];

  for (const { key, payments } of duplicates) {
    const [transactionId, userId] = key.split("|");
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Transaction ID: ${transactionId}`);
    console.log(`User ID: ${userId}`);
    console.log(`Duplicate count: ${payments.length}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // 按创建时间排序，保留最早的一条
    payments.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const keepRecord = payments[0]; // 保留最早的
    const deleteRecords = payments.slice(1); // 删除其他的

    console.log(`\n✅ KEEP (earliest):`);
    console.log(`  ID: ${keepRecord.id}`);
    console.log(`  Status: ${keepRecord.status}`);
    console.log(`  Amount: ${keepRecord.amount} ${keepRecord.currency}`);
    console.log(`  Method: ${keepRecord.payment_method}`);
    console.log(
      `  Created: ${new Date(keepRecord.created_at).toLocaleString()}`
    );

    console.log(`\n🗑️  DELETE (${deleteRecords.length} duplicates):`);
    for (const record of deleteRecords) {
      console.log(`  ID: ${record.id}`);
      console.log(`  Status: ${record.status}`);
      console.log(`  Amount: ${record.amount} ${record.currency}`);
      console.log(`  Method: ${record.payment_method}`);
      console.log(`  Created: ${new Date(record.created_at).toLocaleString()}`);
      console.log(`  ---`);

      recordsToDelete.push(record.id);
      totalDuplicates++;
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 Summary:`);
  console.log(`   Total duplicate groups: ${duplicates.length}`);
  console.log(`   Total records to delete: ${totalDuplicates}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // 询问用户是否继续
  if (process.argv.includes("--execute")) {
    console.log("🚀 Executing deletion...\n");

    for (const id of recordsToDelete) {
      const { error } = await supabase.from("payments").delete().eq("id", id);

      if (error) {
        console.error(`❌ Error deleting payment ${id}:`, error);
      } else {
        console.log(`✅ Deleted payment ${id}`);
      }
    }

    console.log(
      `\n✅ Cleanup completed! Deleted ${totalDuplicates} duplicate records.`
    );
  } else {
    console.log(
      "⚠️  DRY RUN MODE - No records were deleted. To execute deletion, run:"
    );
    console.log(
      "   npx tsx scripts/cleanup-duplicate-payment-records.ts --execute\n"
    );
  }
}

// 运行脚本
findDuplicatePayments().catch(console.error);
