import { supabaseAdmin } from "../lib/supabase-admin";

async function debugPaypalWebhookProcessing() {
  console.log("🔍 调试PayPal Webhook处理逻辑...");

  // 模拟PayPal PAYMENT.SALE.COMPLETED事件数据
  const mockEventData = {
    billing_agreement_id: "I-79K09JF324V6",
    amount: {
      total: "99.99",
      currency: "USD",
      details: {
        subtotal: "99.99",
      },
    },
    payment_mode: "INSTANT_TRANSFER",
    update_time: "2025-11-01T04:46:21Z",
    create_time: "2025-11-01T04:46:21Z",
    protection_eligibility_type:
      "ITEM_NOT_RECEIVED_ELIGIBLE,UNAUTHORIZED_PAYMENT_ELIGIBLE",
    transaction_fee: {
      currency: "USD",
      value: "3.70",
    },
    protection_eligibility: "ELIGIBLE",
    links: [
      {
        method: "GET",
        rel: "self",
        href: "https://api.sandbox.paypal.com/v1/payments/sale/4BC60962D7060631E",
      },
    ],
    id: "4BC60962D7060631E",
    state: "completed",
    invoice_number: "",
  };

  console.log("1. 模拟webhook数据:");
  console.log("   billing_agreement_id:", mockEventData.billing_agreement_id);
  console.log(
    "   amount:",
    mockEventData.amount.total,
    mockEventData.amount.currency
  );

  // 模拟handlePaymentSuccess中的PayPal逻辑
  const subscriptionId = mockEventData.billing_agreement_id;
  console.log("\n2. 提取subscriptionId:", subscriptionId);

  // 模拟findUserBySubscriptionId方法
  console.log("\n3. 查找用户...");

  // 首先从payments表查找（通过transaction_id）
  console.log("   步骤3.1: 从payments表查找 transaction_id =", subscriptionId);
  const { data: payment, error } = await supabaseAdmin
    .from("payments")
    .select("user_id, id, transaction_id, status")
    .eq("transaction_id", subscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("❌ 查询payments表出错:", error);
    return;
  }

  if (payment) {
    console.log("✅ 找到payment记录:");
    console.log("   payment.id:", payment.id);
    console.log("   payment.user_id:", payment.user_id);
    console.log("   payment.transaction_id:", payment.transaction_id);
    console.log("   payment.status:", payment.status);

    const userId = payment.user_id;
    const amount = parseFloat(mockEventData.amount.total || "0");
    const currency = mockEventData.amount.currency || "USD";

    console.log("\n4. 准备更新订阅状态:");
    console.log("   userId:", userId);
    console.log("   subscriptionId:", subscriptionId);
    console.log("   amount:", amount);
    console.log("   currency:", currency);

    return { userId, subscriptionId, amount, currency };
  } else {
    console.log("❌ 未在payments表找到记录，transaction_id =", subscriptionId);
  }

  // 如果没找到，从subscriptions表查找（通过provider_subscription_id）
  console.log(
    "\n   步骤3.2: 从subscriptions表查找 provider_subscription_id =",
    subscriptionId
  );
  const { data: subscription, error: subError } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id, id, provider_subscription_id, status")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();

  if (subError) {
    console.error("❌ 查询subscriptions表出错:", subError);
    return;
  }

  if (subscription) {
    console.log("✅ 找到subscription记录:");
    console.log("   subscription.id:", subscription.id);
    console.log("   subscription.user_id:", subscription.user_id);
    console.log(
      "   subscription.provider_subscription_id:",
      subscription.provider_subscription_id
    );
    console.log("   subscription.status:", subscription.status);

    return {
      userId: subscription.user_id,
      subscriptionId: subscription.id,
      amount: parseFloat(mockEventData.amount.total || "0"),
      currency: mockEventData.amount.currency || "USD",
    };
  } else {
    console.log(
      "❌ 未在subscriptions表找到记录，provider_subscription_id =",
      subscriptionId
    );
  }

  console.log("\n❌ 无法找到用户 - 这就是问题所在！");
  return null;
}

debugPaypalWebhookProcessing().catch(console.error);
