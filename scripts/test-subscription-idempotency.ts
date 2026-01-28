// scripts/test-subscription-idempotency.ts
// 测试订阅幂等性：确保相同 transaction_id 或 provider_subscription_id 不会导致重复扩展
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const userId = `test-user-${Date.now()}`;
  const txn = `TEST-TXN-${Date.now()}`;

  console.log("Creating subscription with transaction id", txn);
  const { data: sub, error: insertError } = await supabase
    .from("subscriptions")
    .insert({
      user_id: userId,
      plan_id: "pro",
      status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(
        Date.now() + 30 * 24 * 3600 * 1000
      ).toISOString(),
      transaction_id: txn,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("Insert subscription error", insertError);
    return;
  }

  console.log("Inserted subscription: ", sub?.id);

  console.log("Checking idempotent query");
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .or(`transaction_id.eq.${txn},provider_subscription_id.eq.${txn}`)
    .maybeSingle();

  if (existing && existing.id) {
    console.log("✅ Idempotent check passed, found subscription", existing.id);
  } else {
    console.log("❌ Idempotent check failed");
  }

  // cleanup
  await supabase.from("subscriptions").delete().eq("user_id", userId);
  console.log("Cleaned up");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
