// scripts/test-payment-deduplication.ts - 测试支付记录去重逻辑
import { supabaseAdmin } from "../lib/supabase-admin";
import { WebhookHandler } from "../lib/payment/webhook-handler";
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

async function testPaymentDeduplication() {
  console.log("🔍 测试支付记录去重逻辑...\n");

  // 加载环境变量
  loadEnv();

  // 创建测试用户ID和订阅ID
  const testUserId = `test_user_${Date.now()}`;
  const testTransactionId = `test_txn_${Date.now()}`;
  const testSubscriptionId = `test_sub_${Date.now()}`;

  try {
    console.log("1. 创建测试用户...");
    const { data: user, error: userError } = await supabaseAdmin
      .from("user_profiles")
      .insert({
        id: testUserId,
        email: `test${Date.now()}@example.com`,
        subscription_plan: "free",
        subscription_status: "inactive",
      })
      .select()
      .single();

    if (userError) {
      console.error("❌ 创建测试用户失败:", userError);
      return;
    }
    console.log("✅ 测试用户创建成功:", testUserId);

    console.log("\n2. 创建pending支付记录...");
    const { data: pendingPayment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .insert({
        user_id: testUserId,
        amount: 9.99,
        currency: "USD",
        status: "pending",
        payment_method: "paypal",
        transaction_id: testTransactionId,
      })
      .select()
      .single();

    if (paymentError) {
      console.error("❌ 创建pending支付记录失败:", paymentError);
      return;
    }
    console.log("✅ Pending支付记录创建成功:", pendingPayment.id);

    console.log("\n3. 模拟PayPal webhook处理...");

    // 创建webhook处理器实例
    const webhookHandler = new WebhookHandler();

    // 模拟PAYMENT.SALE.COMPLETED事件
    const mockPayPalEvent = {
      event_type: "PAYMENT.SALE.COMPLETED",
      resource: {
        billing_agreement_id: testTransactionId, // 使用与pending记录相同的transaction_id
        amount: {
          total: "9.99",
          currency: "USD",
        },
        id: "PAY-1234567890",
      },
    };

    // 处理webhook事件
    const success = await webhookHandler.processWebhook(
      "paypal",
      "PAYMENT.SALE.COMPLETED",
      mockPayPalEvent
    );

    if (!success) {
      console.error("❌ Webhook处理失败");
      return;
    }
    console.log("✅ Webhook处理成功");

    console.log("\n4. 验证支付记录状态...");

    // 检查支付记录
    const { data: payments, error: checkError } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("user_id", testUserId)
      .eq("transaction_id", testTransactionId)
      .order("created_at", { ascending: false });

    if (checkError) {
      console.error("❌ 查询支付记录失败:", checkError);
      return;
    }

    console.log(`找到 ${payments.length} 条支付记录:`);
    payments.forEach((payment, index) => {
      console.log(`   ${index + 1}. ID: ${payment.id}`);
      console.log(`      状态: ${payment.status}`);
      console.log(`      金额: ${payment.amount} ${payment.currency}`);
      console.log(`      创建时间: ${payment.created_at}`);
      console.log("");
    });

    // 验证结果
    if (payments.length === 1 && payments[0].status === "completed") {
      console.log("✅ 成功！支付记录已正确更新为completed状态");
      console.log("✅ 没有创建重复的支付记录");
    } else if (payments.length > 1) {
      console.log("❌ 失败！创建了重复的支付记录");
      console.log(`   期望: 1条记录，实际: ${payments.length}条记录`);
    } else {
      console.log("❌ 失败！支付记录状态未正确更新");
      console.log(`   期望状态: completed，实际状态: ${payments[0]?.status}`);
    }

    console.log("\n5. 检查订阅状态...");
    const { data: subscription, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", testUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError) {
      console.error("❌ 查询订阅失败:", subError);
    } else if (subscription) {
      console.log("✅ 订阅创建成功:");
      console.log(`   订阅ID: ${subscription.id}`);
      console.log(`   状态: ${subscription.status}`);
      console.log(`   计划: ${subscription.plan_id}`);
    } else {
      console.log("⚠️  未找到订阅记录");
    }

    console.log("\n6. 清理测试数据...");
    // 删除测试数据
    await supabaseAdmin.from("payments").delete().eq("user_id", testUserId);
    await supabaseAdmin
      .from("subscriptions")
      .delete()
      .eq("user_id", testUserId);
    await supabaseAdmin.from("user_profiles").delete().eq("id", testUserId);

    console.log("✅ 测试数据清理完成");
  } catch (error) {
    console.error("❌ 测试过程中发生错误:", error);
  }

  console.log("\n🎉 支付记录去重测试完成!");
}

// 如果直接运行此脚本
if (require.main === module) {
  testPaymentDeduplication().catch(console.error);
}

export { testPaymentDeduplication };
