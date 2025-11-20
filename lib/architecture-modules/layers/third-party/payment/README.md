# 支付模块使用指南

## 概述

支付模块提供了完整的多地区支付解决方案，支持支付宝、微信支付和 Stripe。通过抽象设计，各系统可以轻松集成和扩展支付功能。

## 架构

```
layers/third-party/payment/
├── router.ts              # 支付路由器 - 根据地区选择支付方式
├── providers/
│   ├── abstract/          # 抽象提供商实现
│   │   ├── base-provider.ts
│   │   ├── alipay-provider.ts
│   │   ├── wechat-provider.ts
│   │   └── stripe-provider.ts
│   └── config-templates.ts # 配置模板
└── services/
    └── payment-service.ts  # 业务服务抽象
```

## 快速开始

### 1. 安装依赖

```bash
npm install alipay-sdk wechatpay-axios-plugin stripe
```

### 2. 配置支付提供商

```typescript
import {
  paymentRouter,
  AbstractAlipayProvider,
  AbstractWechatProvider,
  AbstractStripeProvider,
  alipayConfigExample,
  validateAlipayConfig,
} from "@architecture-modules";

// 验证并创建支付宝提供商
validateAlipayConfig(alipayConfigExample);
const alipayProvider = new ConcreteAlipayProvider(alipayConfigExample);

// 注册到路由器
paymentRouter.registerProvider("alipay", alipayProvider);
```

### 3. 创建支付订单

```typescript
import { geoRouter } from "@architecture-modules";

const userIP = "192.168.1.1";
const geo = await geoRouter.detect(userIP);

const paymentResult = await paymentRouter.createPayment(geo.region, {
  amount: 168,
  currency: geo.currency,
  description: "Pro Plan Yearly",
  userId: "user-123",
  planType: "pro",
  billingCycle: "yearly",
});

if (paymentResult.success) {
  // 重定向到支付页面或显示二维码
  window.location.href = paymentResult.paymentUrl;
}
```

## 实现具体提供商

### 支付宝实现示例

```typescript
import {
  AbstractAlipayProvider,
  AlipayConfigTemplate,
} from "@architecture-modules";
import AlipaySdk from "alipay-sdk";

export class ConcreteAlipayProvider extends AbstractAlipayProvider {
  private sdk: AlipaySdk;

  constructor(config: AlipayConfigTemplate) {
    super(config);
    this.sdk = new AlipaySdk({
      appId: config.appId,
      privateKey: config.privateKey,
      signType: config.signType || "RSA2",
      alipayPublicKey: config.publicKey,
      gateway: config.gatewayUrl,
    });
  }

  protected async buildAlipayOrder(order: PaymentOrder) {
    return {
      outTradeNo: this.generatePaymentId(),
      totalAmount: order.amount.toString(),
      subject: order.description,
      body: `User: ${order.userId}, Plan: ${order.planType}`,
    };
  }

  protected async callAlipayAPI(orderData: any) {
    const result = await this.sdk.exec(
      "alipay.trade.page.pay",
      {
        bizContent: orderData,
      },
      {
        method: "GET",
      }
    );
    return result;
  }

  // 实现其他抽象方法...
}
```

### 微信支付实现示例

```typescript
import {
  AbstractWechatProvider,
  WechatConfigTemplate,
} from "@architecture-modules";
import { WechatPay } from "wechatpay-axios-plugin";

export class ConcreteWechatProvider extends AbstractWechatProvider {
  private wxpay: WechatPay;

  constructor(config: WechatConfigTemplate) {
    super(config);
    this.wxpay = new WechatPay({
      appid: config.appId,
      mchid: config.mchId,
      private_key: config.privateKey,
      serial_no: config.serialNo,
      apiv3_private_key: config.apiv3PrivateKey,
    });
  }

  protected async buildWechatOrder(order: PaymentOrder) {
    return {
      out_trade_no: this.generatePaymentId(),
      total_fee: this.formatAmount(order.amount, order.currency),
      body: order.description,
      trade_type: "NATIVE", // 二维码支付
    };
  }

  protected async callWechatAPI(orderData: any) {
    const result = await this.wxpay.transactions_native(orderData);
    return result;
  }

  // 实现其他抽象方法...
}
```

### Stripe 实现示例

```typescript
import {
  AbstractStripeProvider,
  StripeConfigTemplate,
} from "@architecture-modules";
import Stripe from "stripe";

export class ConcreteStripeProvider extends AbstractStripeProvider {
  private stripe: Stripe;

  constructor(config: StripeConfigTemplate) {
    super(config);
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: "2023-10-16",
    });
  }

  protected async createStripeSession(order: PaymentOrder) {
    const sessionParams = this.buildSessionParams(order);
    const session = await this.stripe.checkout.sessions.create(sessionParams);
    return session;
  }

  protected async retrievePaymentSession(sessionId: string) {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    return session;
  }

  // 实现其他抽象方法...
}
```

## 业务服务集成

```typescript
import {
  AbstractPaymentService,
  PaymentRepository,
} from "@architecture-modules";

export class ConcretePaymentService extends AbstractPaymentService {
  protected async doProcessPayment(
    order: PaymentOrder,
    payment: PaymentRecord
  ) {
    // 调用支付路由器
    return paymentRouter.createPayment(
      await geoRouter.detect(order.userId),
      order
    );
  }

  protected async onPaymentSuccess(payment: PaymentRecord) {
    // 激活用户订阅
    await this.activateSubscription(payment.userId, payment.planType);

    // 发送通知
    await this.sendPaymentSuccessEmail(payment.userId);
  }

  // 实现其他抽象方法...
}
```

## 配置模板

模块提供了完整的配置模板和验证函数：

```typescript
import {
  alipayConfigExample,
  wechatConfigExample,
  stripeConfigExample,
  validateAlipayConfig,
  validateWechatConfig,
  validateStripeConfig,
} from "@architecture-modules";

// 复制配置模板并修改
const myAlipayConfig = { ...alipayConfigExample };
myAlipayConfig.appId = "your_actual_app_id";

// 验证配置
validateAlipayConfig(myAlipayConfig);
```

## 地区支持

- **中国大陆**: 支付宝、微信支付
- **欧洲**: 禁用支付（GDPR 合规）
- **其他地区**: Stripe、PayPal

## 最佳实践

1. **环境分离**: 生产和测试环境使用不同的配置
2. **密钥安全**: 敏感信息通过环境变量配置
3. **错误处理**: 实现完整的错误处理和重试机制
4. **日志记录**: 记录所有支付操作用于审计
5. **回调验证**: 始终验证第三方回调的签名

## 汇率处理机制

支付模块内置了汇率处理功能，确保不同地区用户使用合适的货币进行支付。

### 汇率配置

模块使用固定汇率确保价格稳定性：

```typescript
// 固定汇率：1 USD = 7.2 CNY
const EXCHANGE_RATE = 7.2;
```

### 自动货币转换

支付提供商会根据类型自动进行货币转换：

- **支付宝/微信支付**: 自动将 USD 转换为 CNY
- **Stripe**: 保持 USD 或其他配置的货币

```typescript
// 示例：USD 价格自动转换为人民币
const usdAmount = 168; // $168
const cnyAmount = usdAmount * 7.2; // ¥1209.6
```

### 业务服务中的汇率处理

```typescript
import { AbstractPaymentService } from "@architecture-modules";

export class ConcretePaymentService extends AbstractPaymentService {
  async processPayment(order: PaymentOrder, paymentMethod: string) {
    // 自动处理货币转换
    const processedOrder = this.processOrderCurrency(order, paymentMethod);

    // processedOrder.amount 和 processedOrder.currency 已根据支付方式转换
    console.log(
      `Converted: ${order.amount} ${order.currency} -> ${processedOrder.amount} ${processedOrder.currency}`
    );

    // 继续支付流程...
  }
}
```

### 数据库记录

支付记录同时保存原始金额和转换后的金额：

```typescript
interface PaymentRecord {
  amount: number; // 实际支付金额
  currency: string; // 实际支付货币
  originalAmount?: number; // 原始金额
  originalCurrency?: string; // 原始货币
  // ...
}
```

### 汇率转换规则

| 支付方式 | 输入货币 | 输出货币 | 转换逻辑      |
| -------- | -------- | -------- | ------------- |
| 支付宝   | USD      | CNY      | amount \* 7.2 |
| 微信支付 | USD      | CNY      | amount \* 7.2 |
| Stripe   | USD      | USD      | 无转换        |
| Stripe   | CNY      | CNY      | 无转换        |

### 汇率稳定性保证

- 使用固定汇率避免波动影响
- 所有转换都有日志记录
- 支持未来扩展为动态汇率
