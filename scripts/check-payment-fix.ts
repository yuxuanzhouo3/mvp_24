/**
 * 快速检查脚本：验证支付数据库修复
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

async function checkPaymentFix() {
  try {
    console.log("\n🔍 支付数据库修复验证\n");
    console.log("=".repeat(70));

    // 1. 检查最新支付
    console.log("\n1️⃣  检查最新支付记录...\n");
    const { data: payments, error: paymentError } = await supabaseAdmin
      .from("payments")
      .select("id, user_id, amount, currency, status, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(1);

    if (paymentError) {
      console.error("❌ 查询支付失败:", paymentError.message);
    } else if (payments && payments.length > 0) {
      const payment = payments[0];
      console.log("✅ 找到支付记录");
      console.log(`   ID: ${payment.id}`);
      console.log(`   用户: ${payment.user_id}`);
      console.log(`   金额: ${payment.amount} ${payment.currency}`);
      console.log(`   状态: ${payment.status}`);
      console.log(`   元数据: ${JSON.stringify(payment.metadata)}`);
      console.log(`   创建于: ${payment.created_at}`);
    } else {
      console.log("⚠️  没有支付记录");
    }

    // 2. 检查最新订阅
    console.log("\n2️⃣  检查最新订阅记录...\n");
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("id, user_id, plan_id, status, current_period_end, created_at")
      .order("created_at", { ascending: false })
      .limit(1);

    if (subError) {
      console.error("❌ 查询订阅失败:", subError.message);
    } else if (subscriptions && subscriptions.length > 0) {
      const sub = subscriptions[0];
      console.log("✅ 找到订阅记录");
      console.log(`   ID: ${sub.id}`);
      console.log(`   用户: ${sub.user_id}`);
      console.log(`   计划: ${sub.plan_id}`);
      console.log(`   状态: ${sub.status}`);
      console.log(`   到期: ${sub.current_period_end}`);
      console.log(`   创建于: ${sub.created_at}`);
    } else {
      console.log("⚠️  没有订阅记录");
    }

    // 3. 检查外键约束
    console.log("\n3️⃣  检查外键约束...\n");
    try {
      const { data: constraints, error: constraintError } = await supabaseAdmin
        .rpc("get_table_constraints", { table_name: "payments" })
        .catch(() => ({ data: null, error: new Error("RPC not available") }));

      if (constraintError || !constraints) {
        console.log(
          "⚠️  无法通过 RPC 检查约束，请在 Supabase 控制台手动验证："
        );
        console.log(
          "   SQL: SELECT constraint_name, table_name FROM information_schema.table_constraints WHERE table_name IN ('payments', 'subscriptions');"
        );
      }
    } catch (e) {
      console.log("ℹ️  约束检查需要在 Supabase SQL Editor 中手动运行");
    }

    // 4. 对比关系
    console.log("\n4️⃣  数据关系检查...\n");
    if (
      payments &&
      payments.length > 0 &&
      subscriptions &&
      subscriptions.length > 0
    ) {
      const latestPayment = payments[0];
      const latestSub = subscriptions[0];

      if (latestPayment.user_id === latestSub.user_id) {
        console.log("✅ 支付和订阅属于同一用户");
      } else {
        console.log("⚠️  支付和订阅属于不同用户");
      }

      // 检查用户 auth metadata
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(
        latestPayment.user_id
      );

      if (!error && data.user) {
        const metadata = data.user.user_metadata || {};
        console.log("✅ 用户 Auth Metadata:");
        console.log(`   pro: ${metadata.pro ? "✅ 是" : "❌ 否"}`);
        console.log(
          `   subscription_status: ${
            metadata.subscription_status || "❌ 未设置"
          }`
        );
        console.log(
          `   membership_expires_at: ${
            metadata.membership_expires_at || "❌ 未设置"
          }`
        );
      }
    }

    console.log("\n" + "=".repeat(70));
    console.log("\n📊 修复状态总结：\n");

    const status = {
      payments: payments && payments.length > 0,
      subscriptions: subscriptions && subscriptions.length > 0,
      hasMetadata: payments && payments[0]?.metadata,
      relatedRecords:
        payments &&
        subscriptions &&
        payments[0]?.user_id === subscriptions[0]?.user_id,
    };

    console.log(`支付记录创建: ${status.payments ? "✅" : "❌"}`);
    console.log(`订阅记录创建: ${status.subscriptions ? "✅" : "❌"}`);
    console.log(`支付元数据: ${status.hasMetadata ? "✅" : "❌"}`);
    console.log(`数据关联正确: ${status.relatedRecords ? "✅" : "❌"}`);

    if (status.payments && status.subscriptions && status.relatedRecords) {
      console.log("\n🎉 修复成功！所有表都正确更新了\n");
    } else {
      console.log("\n⚠️  部分数据缺失，请检查上面的错误\n");
    }
  } catch (error) {
    console.error("❌ 检查失败:", error);
  }
}

console.log("\n🚀 支付数据库修复验证工具\n");
checkPaymentFix().catch(console.error);
