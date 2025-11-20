// lib/payment/init.ts - 支付系统初始化
import { paymentRouter } from "@/lib/architecture-modules/layers/third-party/payment/router";
import { StripeProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/stripe-provider";
import { PayPalProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/paypal-provider";
// import { WeChatProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/wechat-provider";
// import { AlipayProvider } from "@/lib/architecture-modules/layers/third-party/payment/providers/alipay-provider";

// 初始化支付提供商
export function initializePaymentProviders() {
  try {
    // 注册Stripe提供商
    const stripeProvider = new StripeProvider(process.env);
    paymentRouter.registerProvider("stripe", stripeProvider);

    // 注册PayPal提供商
    const paypalProvider = new PayPalProvider(process.env);
    paymentRouter.registerProvider("paypal", paypalProvider);

    // 暂时注释掉其他提供商以解决构建问题
    // // 注册微信支付提供商
    // const wechatProvider = new WeChatProvider(process.env);
    // paymentRouter.registerProvider("wechat", wechatProvider);

    // // 注册支付宝提供商
    // const alipayProvider = new AlipayProvider(process.env);
    // paymentRouter.registerProvider("alipay", alipayProvider);

    console.log("Payment providers initialized successfully");
  } catch (error) {
    console.error("Failed to initialize payment providers:", error);
  }
}

// 导出支付路由器供应用使用
export { paymentRouter };
