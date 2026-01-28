// scripts/debug-paypal-webhook.ts - 调试PayPal webhook问题
import { supabaseAdmin } from "../lib/supabase-admin";

async function debugPayPalWebhook() {
  console.log("🔍 调试PayPal Webhook问题...\n");

  try {
    // 1. 检查最近的PayPal支付
    console.log("1. 检查最近1小时内的PayPal支付:");
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: recentPayments, error: paymentsError } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("payment_method", "paypal")
      .gte("created_at", oneHourAgo)
      .order("created_at", { ascending: false });

    if (paymentsError) {
      console.error("❌ 查询支付失败:", paymentsError);
      return;
    }

    console.log(`✅ 找到 ${recentPayments.length} 个最近的PayPal支付:`);

    for (const payment of recentPayments) {
      console.log(`\n📋 支付详情:`);
      console.log(`   ID: ${payment.id}`);
      console.log(`   用户: ${payment.user_id}`);
      console.log(`   交易ID: ${payment.transaction_id}`);
      console.log(`   状态: ${payment.status}`);
      console.log(`   创建时间: ${payment.created_at}`);

      // 2. 检查是否有对应的webhook事件
      const { data: webhookEvents, error: webhookError } = await supabaseAdmin
        .from("webhook_events")
        .select("*")
        .eq("provider", "paypal")
        .or(
          `payload.ilike.%${payment.transaction_id}%,payload.ilike.%${payment.id}%`
        )
        .order("created_at", { ascending: false });

      if (webhookError) {
        console.error(`❌ 查询webhook事件失败: ${webhookError}`);
      } else {
        console.log(`   🔗 相关webhook事件: ${webhookEvents.length} 个`);
        webhookEvents.forEach((event) => {
          console.log(`      - 事件类型: ${event.event_type}`);
          console.log(
            `      - 处理状态: ${event.processed ? "✅ 已处理" : "⏳ 未处理"}`
          );
          console.log(`      - 时间: ${event.created_at}`);
          if (event.error_message) {
            console.log(`      - 错误: ${event.error_message}`);
          }
        });
      }
    }

    // 3. 检查所有PayPal webhook事件
    console.log("\n2. 检查所有PayPal webhook事件:");
    const { data: allPayPalEvents, error: allEventsError } = await supabaseAdmin
      .from("webhook_events")
      .select("*")
      .eq("provider", "paypal")
      .order("created_at", { ascending: false })
      .limit(10);

    if (allEventsError) {
      console.error("❌ 查询所有PayPal事件失败:", allEventsError);
    } else {
      console.log(`✅ 找到 ${allPayPalEvents.length} 个PayPal webhook事件:`);
      allPayPalEvents.forEach((event, index) => {
        console.log(`   ${index + 1}. ${event.event_type}`);
        console.log(`      ID: ${event.id}`);
        console.log(
          `      处理状态: ${event.processed ? "✅ 已处理" : "⏳ 未处理"}`
        );
        console.log(`      创建时间: ${event.created_at}`);
        if (event.error_message) {
          console.log(`      错误: ${event.error_message}`);
        }
        console.log("");
      });
    }

    // 4. 检查webhook处理日志
    console.log("3. 检查webhook处理统计:");
    const { data: processedStats, error: statsError } = await supabaseAdmin
      .from("webhook_events")
      .select("provider, processed, count")
      .eq("provider", "paypal");

    if (statsError) {
      console.error("❌ 查询统计失败:", statsError);
    } else {
      const total = processedStats.length;
      const processed = processedStats.filter((e) => e.processed).length;
      const unprocessed = total - processed;

      console.log(`   总事件数: ${total}`);
      console.log(`   已处理: ${processed}`);
      console.log(`   未处理: ${unprocessed}`);
    }

    console.log("\n🎉 PayPal Webhook调试完成!");

    // 5. 给出建议
    console.log("\n💡 问题诊断:");
    if (
      recentPayments &&
      recentPayments.length > 0 &&
      (!allPayPalEvents || allPayPalEvents.length === 0)
    ) {
      console.log("❌ 问题: 有PayPal支付但没有收到webhook事件");
      console.log("   可能原因:");
      console.log("   1. PayPal webhook配置不正确");
      console.log("   2. webhook URL无法访问");
      console.log("   3. PayPal sandbox延迟");
      console.log("   4. 网络或防火墙问题");
      console.log("   建议: 检查Vercel函数日志，看是否有webhook请求到达");
    } else if (allPayPalEvents && allPayPalEvents.length > 0) {
      const unprocessed = allPayPalEvents.filter((e) => !e.processed).length;
      if (unprocessed > 0) {
        console.log("⚠️  问题: 有webhook事件但未处理");
        console.log("   建议: 检查webhook处理逻辑和数据库权限");
      } else {
        console.log("✅ PayPal webhook工作正常");
      }
    }
  } catch (error) {
    console.error("❌ 调试过程中发生错误:", error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  debugPayPalWebhook().catch(console.error);
}

export { debugPayPalWebhook };
