// 测试支付宝金额计算
const method = "alipay";
const billingCycle = "monthly";

const currency = method === "alipay" ? "CNY" : "USD";
let amount;

if (currency === "CNY") {
  // 人民币定价：约 7:1 汇率
  amount = billingCycle === "monthly" ? 30 : 300;
} else {
  // 美元定价
  amount = billingCycle === "monthly" ? 9.99 : 99.99;
}

console.log("支付方式:", method);
console.log("计费周期:", billingCycle);
console.log("货币:", currency);
console.log("金额:", amount);
console.log("格式化金额:", amount.toFixed(2));

// 测试支付宝订单参数
const bizContent = {
  out_trade_no: "test_order_123",
  product_code: "FAST_INSTANT_TRADE_PAY",
  total_amount: amount.toFixed(2),
  subject: "Premium Membership",
};

console.log("\n支付宝订单参数:");
console.log(JSON.stringify(bizContent, null, 2));
