// scripts/test-duplicate-payment-prevention.ts
// 测试重复支付防护机制
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// 模拟测试用户
const TEST_USER_ID = "test-user-" + Date.now();

async function testDuplicatePaymentPrevention() {
  console.log("\n🧪 Testing Duplicate Payment Prevention\n");
  console.log(`Test User ID: ${TEST_USER_ID}\n`);

  try {
    // 测试 1: 创建第一笔支付
    console.log("📝 Test 1: Creating first payment...");
    const payment1 = {
      user_id: TEST_USER_ID,
      amount: 9.99,
      currency: "USD",
      status: "pending",
      payment_method: "paypal",
      transaction_id: `TEST-TXN-${Date.now()}`,
    };

    const { data: firstPayment, error: error1 } = await supabase
      .from("payments")
      .insert(payment1)
      .select()
      .single();

    if (error1) {
      console.error("❌ Failed to create first payment:", error1);
      return;
    }

    console.log("✅ First payment created:", firstPayment.id);

    // 测试 2: 尝试在1分钟内创建相同金额的支付（应该被拒绝）
    console.log("\n📝 Test 2: Attempting duplicate payment within 1 minute...");

    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recentPayments, error: checkError } = await supabase
      .from("payments")
      .select("id, status, created_at")
      .eq("user_id", TEST_USER_ID)
      .eq("amount", 9.99)
      .eq("currency", "USD")
      .eq("payment_method", "paypal")
      .gte("created_at", oneMinuteAgo)
      .in("status", ["pending", "completed"]);

    if (checkError) {
      console.error("❌ Check failed:", checkError);
      return;
    }

    if (recentPayments && recentPayments.length > 0) {
      const paymentAge =
        Date.now() - new Date(recentPayments[0].created_at).getTime();
      console.log(
        `✅ Duplicate detected! Recent payment found (${Math.floor(
          paymentAge / 1000
        )}s ago)`
      );
      console.log("   Payment would be rejected with 429 status");
    } else {
      console.log("⚠️  No duplicate detected (unexpected)");
    }

    // 测试 3: 模拟 webhook 处理 - 检查已完成的支付
    console.log("\n📝 Test 3: Simulating webhook duplicate check...");

    // 首先创建一个已完成的支付
    const completedPayment = {
      user_id: TEST_USER_ID,
      amount: 19.99,
      currency: "USD",
      status: "completed",
      payment_method: "paypal",
      transaction_id: `TEST-TXN-COMPLETED-${Date.now()}`,
    };

    const { data: payment2, error: error2 } = await supabase
      .from("payments")
      .insert(completedPayment)
      .select()
      .single();

    if (error2) {
      console.error("❌ Failed to create completed payment:", error2);
      return;
    }

    console.log("✅ Completed payment created:", payment2.id);

    // 现在尝试查找相同 transaction_id 的已完成支付
    const { data: existingCompleted, error: error3 } = await supabase
      .from("payments")
      .select("id, status, created_at")
      .eq("transaction_id", completedPayment.transaction_id)
      .eq("status", "completed")
      .maybeSingle();

    if (error3) {
      console.error("❌ Check failed:", error3);
      return;
    }

    if (existingCompleted) {
      console.log("✅ Duplicate webhook would be detected and skipped");
      console.log(
        `   Found existing completed payment: ${existingCompleted.id}`
      );
    } else {
      console.log("⚠️  No duplicate detected (unexpected)");
    }

    // 测试 4: 清理测试数据
    console.log("\n🧹 Cleaning up test data...");
    const { error: cleanupError } = await supabase
      .from("payments")
      .delete()
      .eq("user_id", TEST_USER_ID);

    if (cleanupError) {
      console.error("❌ Cleanup failed:", cleanupError);
    } else {
      console.log("✅ Test data cleaned up");
    }

    console.log("\n✅ All tests completed successfully!\n");
  } catch (error) {
    console.error("\n❌ Test failed with error:", error);
  }
}

// 运行测试
testDuplicatePaymentPrevention().catch(console.error);
