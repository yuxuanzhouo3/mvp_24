// scripts/test-alipay-provider.ts - 测试支付宝提供商
import { AlipayProvider } from "../lib/architecture-modules/layers/third-party/payment/providers/alipay-provider";

async function testAlipayProvider() {
  console.log("Testing Alipay Provider...");

  // 从.env.local加载环境变量
  const fs = require("fs");
  const path = require("path");
  const envPath = path.join(process.cwd(), ".env.local");
  const envContent = fs.readFileSync(envPath, "utf-8");

  const mockEnv: Record<string, string> = {};
  const lines = envContent.split("\n");

  for (const line of lines) {
    if (line.trim() && !line.startsWith("#")) {
      const equalIndex = line.indexOf("=");
      if (equalIndex > 0) {
        const key = line.substring(0, equalIndex);
        const value = line.substring(equalIndex + 1);
        mockEnv[key] = value;
        // 也设置到process.env
        process.env[key] = value;
      }
    }
  }

  console.log("Loaded env - APP_ID:", mockEnv.ALIPAY_APP_ID);
  console.log(
    "Loaded env - PRIVATE_KEY length:",
    mockEnv.ALIPAY_PRIVATE_KEY?.length
  );

  try {
    // 初始化提供商
    const provider = new AlipayProvider(mockEnv);
    console.log("✅ AlipayProvider initialized successfully");

    // 测试订单创建
    const testOrder = {
      amount: 9.99,
      currency: "CNY",
      description: "Test Premium Membership",
      userId: "test_user_123",
      planType: "pro",
      billingCycle: "monthly" as const,
    };

    console.log("Testing createPayment...");
    const result = await provider.createPayment(testOrder);

    if (result.success) {
      console.log("✅ Payment created successfully");
      console.log("Payment ID:", result.paymentId);
      console.log("Payment URL:", result.paymentUrl?.substring(0, 100) + "...");
    } else {
      console.log("❌ Payment creation failed:", result.error);
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// 只有在直接运行此脚本时才执行测试
if (require.main === module) {
  testAlipayProvider();
}

export { testAlipayProvider };
