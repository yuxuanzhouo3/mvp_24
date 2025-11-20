import { supabaseAdmin } from "../lib/supabase-admin";

async function checkPaypalPayments() {
  console.log("🔍 检查PayPal支付记录...");

  try {
    // 查询所有PayPal支付记录
    const { data: payments, error } = await supabaseAdmin
      .from("payments")
      .select("id, user_id, transaction_id, status, payment_method, created_at")
      .eq("payment_method", "paypal")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("❌ 查询payments表出错:", error);
      return;
    }

    console.log(`✅ 找到 ${payments.length} 个PayPal支付记录:`);

    payments.forEach((payment, i) => {
      console.log(`${i + 1}. 支付详情:`);
      console.log(`   ID: ${payment.id}`);
      console.log(`   用户: ${payment.user_id}`);
      console.log(`   交易ID: '${payment.transaction_id}'`);
      console.log(`   状态: ${payment.status}`);
      console.log(`   创建时间: ${payment.created_at}`);
      console.log("");
    });

    // 特别检查 I-79K09JF324V6
    console.log("🔍 特别检查交易ID 'I-79K09JF324V6':");
    const { data: specificPayment, error: specificError } = await supabaseAdmin
      .from("payments")
      .select("id, user_id, transaction_id, status")
      .eq("transaction_id", "I-79K09JF324V6")
      .maybeSingle();

    if (specificError) {
      console.error("❌ 查询特定交易出错:", specificError);
    } else if (specificPayment) {
      console.log("✅ 找到记录:");
      console.log(`   ID: ${specificPayment.id}`);
      console.log(`   用户: ${specificPayment.user_id}`);
      console.log(`   交易ID: '${specificPayment.transaction_id}'`);
      console.log(`   状态: ${specificPayment.status}`);
    } else {
      console.log("❌ 未找到交易ID 'I-79K09JF324V6' 的记录");
    }
  } catch (error) {
    console.error("❌ 执行过程中出错:", error);
  }
}

checkPaypalPayments().catch(console.error);
