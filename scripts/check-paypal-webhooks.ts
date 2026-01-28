// scripts/check-paypal-webhooks.ts - 检查PayPal webhook事件
import { supabaseAdmin } from "../lib/supabase-admin";

async function checkPayPalWebhooks() {
  console.log("🔍 检查PayPal Webhook事件...\n");

  try {
    // 检查PayPal webhook事件
    console.log("1. 检查PayPal webhook_events:");
    const { data: paypalEvents, error: paypalError } = await supabaseAdmin
      .from("webhook_events")
      .select("*")
      .eq("provider", "paypal")
      .order("created_at", { ascending: false })
      .limit(10);

    if (paypalError) {
      console.error("❌ 查询PayPal事件失败:", paypalError);
    } else {
      console.log(`✅ 找到 ${paypalEvents.length} 个PayPal webhook事件:`);
      paypalEvents.forEach((event, index) => {
        console.log(`   ${index + 1}. ${event.event_type}`);
        console.log(`      ID: ${event.id}`);
        console.log(
          `      处理状态: ${event.processed ? "✅ 已处理" : "⏳ 未处理"}`
        );
        console.log(`      创建时间: ${event.created_at}`);
        if (event.processed_at) {
          console.log(`      处理时间: ${event.processed_at}`);
        }
        console.log("");
      });
    }

    // 检查最近的PayPal支付
    console.log("2. 检查最近的PayPal支付:");
    const { data: paypalPayments, error: paymentsError } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("payment_method", "paypal")
      .order("created_at", { ascending: false })
      .limit(5);

    if (paymentsError) {
      console.error("❌ 查询PayPal支付失败:", paymentsError);
    } else {
      console.log(`✅ 找到 ${paypalPayments.length} 个PayPal支付记录:`);
      paypalPayments.forEach((payment, index) => {
        console.log(`   ${index + 1}. 用户: ${payment.user_id}`);
        console.log(`      金额: ${payment.amount} ${payment.currency}`);
        console.log(`      状态: ${payment.status}`);
        console.log(`      交易ID: ${payment.transaction_id}`);
        console.log(`      创建时间: ${payment.created_at}`);
        console.log("");
      });
    }

    console.log("🎉 PayPal Webhook检查完成!");
  } catch (error) {
    console.error("❌ 检查过程中发生错误:", error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  checkPayPalWebhooks().catch(console.error);
}

export { checkPayPalWebhooks };
