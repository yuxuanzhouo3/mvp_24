/**
 * 验证脚本：检查 INTL 模式下支付后用户数据是否正确更新
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

async function verifyPaymentUpdate() {
  try {
    console.log("🔍 正在验证 INTL 模式下的支付数据更新...\n");

    // 获取最近的完成支付
    const { data: recentPayments, error: paymentError } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(5);

    if (paymentError) {
      console.error("❌ 获取支付记录失败:", paymentError);
      return;
    }

    if (!recentPayments || recentPayments.length === 0) {
      console.log("ℹ️  没有找到完成的支付记录");
      return;
    }

    console.log(`✅ 找到 ${recentPayments.length} 条完成的支付记录\n`);

    // 检查每个支付对应的用户信息
    for (const payment of recentPayments) {
      console.log(`📋 支付 ID: ${payment.id}`);
      console.log(`   用户 ID: ${payment.user_id}`);
      console.log(`   金额: ${payment.amount} ${payment.currency}`);
      console.log(`   交易 ID: ${payment.transaction_id}`);
      console.log(`   创建时间: ${payment.created_at}\n`);

      // 从 Supabase Auth 获取用户信息
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(
        payment.user_id
      );

      if (error || !data.user) {
        console.error(`   ❌ 获取用户信息失败:`, error);
        continue;
      }

      const user = data.user;
      const metadata = user.user_metadata || {};

      console.log(`   👤 用户邮箱: ${user.email}`);
      console.log(
        `   💳 subscription_plan: ${metadata.subscription_plan || "未设置"}`
      );
      console.log(
        `   📅 membership_expires_at: ${
          metadata.membership_expires_at || "未设置"
        }`
      );
      console.log(`   ✨ pro: ${metadata.pro ? "是" : "否"}`);

      // 验证会员是否已激活
      const expiresAt = metadata.membership_expires_at
        ? new Date(metadata.membership_expires_at)
        : null;
      const now = new Date();

      if (expiresAt && expiresAt > now) {
        console.log(`   ✅ 会员已激活，有效期至: ${expiresAt.toISOString()}`);
      } else if (expiresAt) {
        console.log(`   ⚠️  会员已过期，过期时间: ${expiresAt.toISOString()}`);
      } else {
        console.log(`   ⚠️  会员信息未找到`);
      }

      console.log("");
    }
  } catch (error) {
    console.error("❌ 脚本执行失败:", error);
  }
}

verifyPaymentUpdate().catch(console.error);
