/**
 * 诊断脚本：检查支付后的数据库状态
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

async function diagnosisDatabase() {
  try {
    console.log("🔍 数据库诊断报告\n");
    console.log("=".repeat(60));

    // 1. 检查 webhook_events 表
    console.log("\n1️⃣  检查 Webhook 事件处理状态:");
    const { data: webhookEvents, error: webhookError } = await supabaseAdmin
      .from("webhook_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);

    if (webhookError) {
      console.error("❌ 查询 webhook_events 失败:", webhookError);
    } else {
      console.log(`   找到 ${webhookEvents?.length || 0} 条事件`);
      webhookEvents?.forEach((event, i) => {
        console.log(`   ${i + 1}. [${event.provider}] ${event.event_type}`);
        console.log(`      ID: ${event.id}`);
        console.log(`      已处理: ${event.processed ? "✅ 是" : "⏳ 否"}`);
        console.log(`      创建于: ${event.created_at}`);
      });
    }

    // 2. 检查 payments 表
    console.log("\n2️⃣  检查支付记录:");
    const { data: payments, error: paymentError } = await supabaseAdmin
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);

    if (paymentError) {
      console.error("❌ 查询 payments 失败:", paymentError);
    } else {
      console.log(`   找到 ${payments?.length || 0} 条支付记录`);
      payments?.forEach((payment, i) => {
        console.log(`   ${i + 1}. 用户: ${payment.user_id}`);
        console.log(`      金额: ${payment.amount} ${payment.currency}`);
        console.log(`      状态: ${payment.status}`);
        console.log(`      交易ID: ${payment.transaction_id}`);
        console.log(`      订阅ID: ${payment.subscription_id || "空"}`);
        console.log(`      创建于: ${payment.created_at}`);
      });
    }

    // 3. 检查 subscriptions 表
    console.log("\n3️⃣  检查订阅记录:");
    const { data: subscriptions, error: subscriptionError } =
      await supabaseAdmin
        .from("subscriptions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);

    if (subscriptionError) {
      console.error("❌ 查询 subscriptions 失败:", subscriptionError);
    } else {
      console.log(`   找到 ${subscriptions?.length || 0} 条订阅记录`);
      subscriptions?.forEach((sub, i) => {
        console.log(`   ${i + 1}. 用户: ${sub.user_id}`);
        console.log(`      计划: ${sub.plan_id}`);
        console.log(`      状态: ${sub.status}`);
        console.log(
          `      周期: ${sub.current_period_start} 至 ${sub.current_period_end}`
        );
        console.log(`      创建于: ${sub.created_at}`);
      });
    }

    // 4. 检查最近支付用户的数据关系
    console.log("\n4️⃣  数据关系检查:");
    if (payments && payments.length > 0) {
      const lastPayment = payments[0];
      console.log(`   最新支付用户: ${lastPayment.user_id}`);

      // 检查该用户的订阅
      const userSubs =
        subscriptions?.filter((s) => s.user_id === lastPayment.user_id) || [];
      console.log(`   该用户的订阅数: ${userSubs.length}`);

      // 检查支付是否关联到订阅
      if (lastPayment.subscription_id) {
        console.log(`   ✅ 支付已关联到订阅: ${lastPayment.subscription_id}`);
      } else {
        console.log(`   ⚠️  支付未关联到任何订阅（subscription_id 为空）`);
      }

      // 检查用户的 auth metadata
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(
        lastPayment.user_id
      );

      if (!error && data.user) {
        const metadata = data.user.user_metadata || {};
        console.log(`\n5️⃣  用户 Auth Metadata 检查:`);
        console.log(
          `   membership_expires_at: ${
            metadata.membership_expires_at || "未设置"
          }`
        );
        console.log(
          `   subscription_plan: ${metadata.subscription_plan || "未设置"}`
        );
        console.log(
          `   subscription_status: ${metadata.subscription_status || "未设置"}`
        );
        console.log(`   pro: ${metadata.pro ? "是" : "否"}`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("诊断完成\n");
  } catch (error) {
    console.error("❌ 诊断失败:", error);
  }
}

diagnosisDatabase().catch(console.error);
