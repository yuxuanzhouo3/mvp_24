// test-payment-pages.ts - 测试支付页面
async function testPaymentPages() {
  console.log("🔍 测试支付页面...");

  const baseUrl = "http://localhost:3000";

  // 测试成功页面
  try {
    console.log("测试 /payment/success 页面...");
    const successResponse = await fetch(
      `${baseUrl}/payment/success?subscription_id=test123&ba_token=test&token=test`
    );
    console.log("成功页面响应状态:", successResponse.status);

    if (successResponse.status === 200) {
      console.log("✅ 成功页面可访问");
    } else {
      console.log("❌ 成功页面不可访问");
    }
  } catch (error) {
    console.log(
      "❌ 成功页面测试失败:",
      error instanceof Error ? error.message : String(error)
    );
  }

  // 测试取消页面
  try {
    console.log("测试 /payment/cancel 页面...");
    const cancelResponse = await fetch(`${baseUrl}/payment/cancel`);
    console.log("取消页面响应状态:", cancelResponse.status);

    if (cancelResponse.status === 200) {
      console.log("✅ 取消页面可访问");
    } else {
      console.log("❌ 取消页面不可访问");
    }
  } catch (error) {
    console.log(
      "❌ 取消页面测试失败:",
      error instanceof Error ? error.message : String(error)
    );
  }

  // 测试确认API
  try {
    console.log("测试 /api/payment/confirm API...");
    const confirmResponse = await fetch(`${baseUrl}/api/payment/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subscriptionId: "test123",
        baToken: "test",
        token: "test",
      }),
    });
    console.log("确认API响应状态:", confirmResponse.status);

    const confirmResult = await confirmResponse.json();
    console.log("确认API响应:", confirmResult);
  } catch (error) {
    console.log(
      "❌ 确认API测试失败:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

testPaymentPages();
