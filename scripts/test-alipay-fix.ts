// scripts/test-alipay-fix.ts
import { AlipayProvider } from "../lib/architecture-modules/layers/third-party/payment/providers/alipay-provider";

async function testAlipayProvider() {
  console.log("🧪 Testing Alipay Provider Fix...\n");

  try {
    // 使用沙箱配置 - 直接设置测试值
    const config = {
      ALIPAY_APP_ID: "9021000157643313",
      ALIPAY_PRIVATE_KEY:
        "MIIEowIBAAKCAQEApWWfQPeC9rUP+GueZZD25zK9LYXI7Gc/vDIXAaTJPjh6fc1o2ku7CoDUsqxsNQiQU3c8vWJxMdVdq8Osr4SKhYd6kgLnRBbK2qQaRYTvphLweNBwLQrEp3oHndNcP9rf5XqlebQ/XUbX2i0hRtRl7Q5UXopxNxpdOn3oNYS2NOwfPRHIuvyW9sRscdinf6jmik/YIkXbtAtUUfDjcHb2Y1AFZavLL+h+AjIQP/IauIf0d3PrLbXZyKbuB+/yKQzjgT2X5QKUrJuE4bNoFu5ITrZlef7jEG74qfpUMuqi2asERMBRodTwKQS5+HQmviDxqf6V3FMd8PLPM28wXhsWqwIDAQABAoIBADdNYE9fswl8hweALGk3bGbnnzuOZR0udLAfa3PgPm2wgrx3pxx+f97GLthDMLcW0vMlhkiolsKb3gMlnSLexVZac1BI6jzpBhDPF/2wslSsNn2e7DMTS6fX9J3/4vNy4rQfKx8jdqBgpKHNvzeoox/9T5aA4dQT26JIIRFr+2R8F7re+GTE0JtXxLt2RSewTIjwpB+QYgCBzZsCXkoQVmhoHw1BD9zo1J08KoHMv+duGDsFR1l/pNUEpTp1Hsp02ravkGYnKRsix+j+ftFJmByocM6H2GzRjtQRbsQdllKxXQr5SaIiWYoxD3xFpTn6LnyqSPFw0u2tekpXjrZov0kCgYEA8HGa0HtY2ROVEqcGKU7ZtAU45ZdpfAAhk0zEZ97MVmom+rQER4nVfKvocMDZpB8TH82sAERuU2NH5XdKqxOUGNZdyK0pBeEFoOGEqkR1UMhx6V3UELts3QBfyClG/D34404ajRyld945dX8n+mYlBDjrzR2AUMTlICgPvrAqTFcCgYEAsBkKWpVyEyUa874NnHXuBmda/2QOoCgiLfBeD1wtKQw7VNDAg3lMbjq+H+NjKkB1aDlsfE2n8vFPogmjSep+70k3an6RzOtu+biiQsiwfUxusD/ohgmEBbQjaQHF1DC158L+vCaOjt5EhkocMuPsvBipk1j9QGcslaMPndEKk80CgYBnr0WoY5hzu5sMORRSGduNYrcfYoStYU0ZPQBxHkWVeh8m+xvhUZHLOkJ45OC1gmT30PQ8BUZiFSz6yc9cKIwzjbVRhUJsc5W+w6E232CLnnRowvpg4MHYJ4ImSY5/1aWPN64Bbfn4z86NWXD+7K9Hu9gLUo5zxgRcMopfm44R7wKBgQCawqbyzPwgDzAMni5gHtQ9FIBIiqq/3gWL0f8YCK43sORDueI2qVeeWEnWxIPWEigcnLrW03iSbbjKcyXqRAeiS/pDwVBpg09YcAdKIg3ZUF7GzqOPiLVaPeIQ2tn9jYGQWTJ+MHSA4p3eVytJHj5jYFlHgaGwA/yO1WtYCur80QKBgBPAFTOUzhDvyyo6qHVoy7zPauU9VJMa8v89aJPC6BxebWp6q+kNOvrDvZtgs0SrrO2NQBbeVFzmnQFLvbjQzyexZbvoxAtdH7TFDSxzySkNujEfMXGiUNKJt4UOowmIHp4Fw0cC1Qv6kN2eSuvNbPtGGsYICD8od4mlEk8z78iW",
      ALIPAY_PUBLIC_KEY:
        "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApWWfQPeC9rUP+GueZZD25zK9LYXI7Gc/vDIXAaTJPjh6fc1o2ku7CoDUsqxsNQiQU3c8vWJxMdVdq8Osr4SKhYd6kgLnRBbK2qQaRYTvphLweNBwLQrEp3oHndNcP9rf5XqlebQ/XUbX2i0hRtRl7Q5UXopxNxpdOn3oNYS2NOwfPRHIuvyW9sRscdinf6jmik/YIkXbtAtUUfDjcHb2Y1AFZavLL+h+AjIQP/IauIf0d3PrLbXZyKbuB+/yKQzjgT2X5QKUrJuE4bNoFu5ITrZlef7jEG74qfpUMuqi2asERMBRodTwKQS5+HQmviDxqf6V3FMd8PLPM28wXhsWqwIDAQAB",
      ALIPAY_ALIPAY_PUBLIC_KEY:
        "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAgeQ4urYRu9P+974YRwvMh8avnjY7DRIApy9617GNpLn36VTRxEbqc3x58I1LCKujMF7mIJtjhPEhtB39XczlHRYMEO7gkHZU6foZlfnX9U/1whCXnLwGbi5WUjbZn0W0YtrU2HzPCr6LtGgZT5ppfmTcGA7ESR6o1bgkBBBmF34b6nKfct6kurlfmxKYLVUYgJ0ML16XMQN1XW/s7d8fMiwYb5vSU1CbAPOny4v1/vMCzPjwhpYUPKocWDOG0/1N+uPkSsc+1FMxrL1W4x8igyYvRKj3GNBdarvWYTzmpkmNuQhDgyy5yq1kw4EJfwXhr8qaX3ANhSCUQHJ4/m4ePQIDAQAB",
      ALIPAY_GATEWAY_URL: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
    };

    const provider = new AlipayProvider(config);
    console.log("✅ AlipayProvider initialized successfully");

    // 创建测试订单 - 使用正确的 PaymentOrder 接口
    const testOrder = {
      userId: "test_user_123",
      amount: 0.01,
      currency: "CNY",
      description: "Test Payment",
      planType: "premium" as const,
      billingCycle: "monthly" as const,
    };

    const payment = await provider.createPayment(testOrder);
    console.log("✅ Payment created successfully");
    console.log("Payment ID:", payment.paymentId);
    console.log("Payment URL length:", payment.paymentUrl?.length || 0);

    // 检查 paymentUrl 是否包含 product_code
    console.log("\n🔍 Checking payment parameters...");
    if (
      payment.paymentUrl &&
      payment.paymentUrl.includes("product_code=FAST_INSTANT_TRADE_PAY")
    ) {
      console.log("✅ product_code parameter found in payment URL");
    } else if (
      payment.paymentUrl &&
      payment.paymentUrl.includes("FAST_INSTANT_TRADE_PAY")
    ) {
      console.log("✅ product_code value found in payment URL");
    } else {
      console.log("❌ product_code parameter missing");
      // 显示部分 paymentUrl 内容用于调试
      console.log(
        "Payment URL preview:",
        payment.paymentUrl?.substring(0, 200) + "..."
      );
    }

    console.log("\n🎉 Test completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

testAlipayProvider();
