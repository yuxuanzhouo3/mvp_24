// scripts/test-webhook-endpoint.ts - 测试webhook端点
console.log("🧪 PayPal Webhook测试指南\n");

console.log("📋 要测试PayPal webhook是否工作，请按以下步骤：\n");

console.log("1️⃣ 检查Vercel函数日志：");
console.log("   - 去 https://vercel.com/dashboard");
console.log("   - 找到你的项目 mvp-24-main");
console.log("   - 点击 'Functions' 标签");
console.log("   - 查找 /api/payment/webhook/paypal 函数");
console.log("   - 查看最近的请求日志\n");

console.log("2️⃣ 手动测试webhook端点：");
console.log("   打开浏览器或使用curl测试：\n");

const testPayload = {
  id: "WH-TEST123",
  event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
  resource: {
    id: "I-TEST123",
    status: "ACTIVE",
    subscriber: {
      email_address: "test@example.com",
    },
  },
};

console.log("   curl命令：");
console.log(
  `   curl -X POST https://mvp-24-main.vercel.app/api/payment/webhook/paypal \\`
);
console.log(`     -H "Content-Type: application/json" \\`);
console.log(`     -d '${JSON.stringify(testPayload)}'`);
console.log("");

console.log("3️⃣ PayPal开发者控制台测试：");
console.log("   - 去 https://developer.paypal.com/dashboard");
console.log("   - 进入 'Webhooks' 部分");
console.log("   - 找到你的webhook (ID: 9D4557397T6944835)");
console.log("   - 点击 'Test' 或 'Send Test Notification'");
console.log("   - 选择 'BILLING.SUBSCRIPTION.ACTIVATED' 事件");
console.log("   - 发送测试通知\n");

console.log("4️⃣ 检查数据库：");
console.log("   运行以下命令检查是否收到webhook：");
console.log(
  "   npx tsx --env-file=.env.local scripts/check-paypal-webhooks.ts\n"
);

console.log("5️⃣ 如果仍然不工作：");
console.log("   - 检查PayPal webhook URL是否正确");
console.log("   - 确认PAYPAL_WEBHOOK_ID环境变量已设置");
console.log("   - 查看Vercel环境变量配置");
console.log("   - 检查PayPal应用是否在sandbox模式\n");

console.log("🎯 预期结果：");
console.log("   - Vercel日志中应该看到POST请求");
console.log("   - 数据库中应该有新的webhook_events记录");
console.log("   - 即使验证失败，也应该看到请求到达\n");

console.log("✅ 测试完成！");
