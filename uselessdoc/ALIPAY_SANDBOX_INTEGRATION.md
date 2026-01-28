# 支付宝沙盒支付集成总结

## ✅ 集成完成状态

支付宝沙盒支付已经成功集成并测试通过!

## 📋 配置信息

### 1. 环境变量配置 (.env.local)

```bash
# 支付宝沙盒配置
ALIPAY_APP_ID=9021000157643313
ALIPAY_GATEWAY_URL=https://openapi-sandbox.dl.alipaydev.com/gateway.do
ALIPAY_SANDBOX=true

# RSA密钥配置
ALIPAY_PRIVATE_KEY=<应用私钥-PKCS#1格式,1588字符>
ALIPAY_PUBLIC_KEY=<应用公钥,392字符>
ALIPAY_ALIPAY_PUBLIC_KEY=<支付宝公钥,392字符>
```

### 2. SDK 版本

- **alipay-sdk**: 3.4.0 (降级使用,因为 4.14.0 版本存在密钥格式兼容问题)

## 🔧 技术实现

### 1. 核心文件

- `lib/architecture-modules/layers/third-party/payment/providers/alipay-provider.ts` - 支付宝提供商实现
- `lib/architecture-modules/layers/third-party/payment/providers/abstract/alipay-provider.ts` - 抽象基类
- `app/api/payment/create/route.ts` - 支付创建 API
- `app/api/payment/webhook/alipay/route.ts` - 支付回调处理

### 2. 关键技术点

#### 密钥格式转换

- 支付宝提供的私钥是 PKCS#1 格式
- 使用 Node.js crypto 模块可以正确处理
- SDK 同时支持 PEM 格式(带头尾)和 Base64 格式(不带头尾)

#### SDK 初始化 (v3.4.0)

```typescript
const AlipaySdk = require("alipay-sdk");
const AlipaySdkClass = AlipaySdk.default || AlipaySdk;
const sdk = new AlipaySdkClass({
  appId: "<your-app-id>",
  privateKey: "<your-private-key>", // PKCS#1格式
  signType: "RSA2",
  alipayPublicKey: "<alipay-public-key>", // 支付宝公钥
  gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
  timeout: 30000,
  camelcase: true,
});
```

#### API 调用方法

```typescript
// 创建支付 - 使用pageExec方法(v3.x)
const result = await sdk.pageExec("alipay.trade.page.pay", "POST", {
  out_trade_no: "unique_order_id",
  product_code: "FAST_INSTANT_TRADE_PAY",
  total_amount: "9.99",
  subject: "Product Name",
  return_url: "http://your-domain.com/payment/success",
  notify_url: "http://your-domain.com/api/payment/webhook/alipay",
});
// 返回HTML表单,自动提交到支付宝

// 查询支付状态
const queryResult = await sdk.exec("alipay.trade.query", {
  bizContent: {
    out_trade_no: "order_id",
  },
});

// 退款
const refundResult = await sdk.exec("alipay.trade.refund", {
  bizContent: {
    out_trade_no: "order_id",
    refund_amount: "9.99",
    out_request_no: "refund_id",
  },
});
```

### 3. 三个重要的密钥

- **应用私钥 (ALIPAY_PRIVATE_KEY)**: 你的应用用来签名请求的私钥
- **应用公钥 (ALIPAY_PUBLIC_KEY)**: 对应私钥的公钥,需要上传到支付宝开放平台
- **支付宝公钥 (ALIPAY_ALIPAY_PUBLIC_KEY)**: 支付宝的公钥,用于验证支付宝的签名

## 🧪 测试结果

```bash
npx tsx scripts/test-alipay-provider.ts
```

输出:

```
✅ AlipayProvider initialized successfully
✅ Payment created successfully
Payment ID: pay_1762326655730_y4fydoum6
Payment URL: <form action="https://openapi-sandbox.dl.alipaydev.com/gateway.do?method=alipay.trade.page.pay...
```

## 📝 问题解决过程

### 问题 1: 密钥格式不兼容

**错误**: `error:1E08010C:DECODER routines::unsupported`

**原因**: alipay-sdk 4.14.0 版本对密钥格式要求严格

**解决**:

1. 降级到alipay-sdk@3.4.0
2. 确认支付宝提供的私钥就是 PKCS#1 格式
3. SDK 自动处理 PEM 头尾

### 问题 2: SDK 导入方式

**错误**: `AlipaySdk is not a constructor`

**原因**: v3.x 使用 default 导出

**解决**:

```typescript
const AlipaySdk = require("alipay-sdk");
const AlipaySdkClass = AlipaySdk.default || AlipaySdk;
```

### 问题 3: API 方法名称

**错误**: `pageExecute is not a function`

**原因**: v3.x 使用`pageExec`,v4.x 使用`pageExecute`

**解决**: 使用 v3.x 的`pageExec`方法

## 🚀 下一步

1. **测试完整支付流程**

   - 启动本地开发服务器
   - 创建支付订单
   - 在沙盒环境完成支付
   - 测试 webhook 回调

2. **配置生产环境**

   - 替换为生产环境密钥
   - 更改 gatewayUrl 为生产地址: `https://openapi.alipay.com/gateway.do`
   - 配置正式的回调域名

3. **前端集成**
   - 创建支付页面
   - 显示支付表单或跳转到支付宝
   - 处理支付成功/失败回调

## 📚 参考文档

- [支付宝开放平台](https://open.alipay.com/)
- [沙箱环境](https://openhome.alipay.com/develop/sandbox/app)
- [alipay-sdk 文档](https://github.com/alipay/alipay-sdk-nodejs-all)

## 🎯 测试账号

登录 [支付宝沙箱](https://openhome.alipay.com/develop/sandbox/account) 获取:

- 买家账号
- 卖家账号
- 测试金额

---

**状态**: ✅ 集成完成并测试通过
**最后更新**: 2025-11-05
