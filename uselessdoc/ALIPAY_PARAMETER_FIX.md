# 支付宝参数错误修复

## 🐛 问题

跳转到支付宝成功，但显示错误：

```
订单信息无法识别，建议联系卖家。
错误码：INVALID_PARAMETER
```

## 🔍 根本原因

两个问题：

### 1. 金额货币不匹配

- 后端设置货币为 CNY（人民币）
- 但金额仍然是 9.99（美元价格）
- **不合理**: 9.99 元人民币太便宜

### 2. 多余参数

- `passback_params` - 沙箱环境可能不支持
- `body` - 可能不是必需参数

## ✅ 修复方案

### 修复 1: 调整人民币定价

**文件**: `app/api/payment/onetime/create/route.ts`

```typescript
// 修复前
const amount = billingCycle === "monthly" ? 9.99 : 99.99;
const currency = method === "alipay" ? "CNY" : "USD";

// 修复后
const currency = method === "alipay" ? "CNY" : "USD";
let amount: number;

if (currency === "CNY") {
  // 人民币定价：约 7:1 汇率
  amount = billingCycle === "monthly" ? 30 : 300;
} else {
  // 美元定价
  amount = billingCycle === "monthly" ? 9.99 : 99.99;
}
```

**新的定价**:

- 支付宝月付: ¥30 CNY
- 支付宝年付: ¥300 CNY
- Stripe/PayPal 月付: $9.99 USD
- Stripe/PayPal 年付: $99.99 USD

### 修复 2: 简化支付宝参数

**文件**: `lib/architecture-modules/layers/third-party/payment/providers/alipay-provider.ts`

```typescript
// 修复前
const bizContent = {
  out_trade_no: outTradeNo,
  product_code: "FAST_INSTANT_TRADE_PAY",
  total_amount: order.amount.toFixed(2),
  subject: order.description || "Premium Membership",
  body: order.description || "Premium Membership",  // 移除
  passback_params: JSON.stringify({...}),           // 移除
};

// 修复后
const bizContent = {
  out_trade_no: outTradeNo,
  product_code: "FAST_INSTANT_TRADE_PAY",
  total_amount: order.amount.toFixed(2),
  subject: order.description || "Premium Membership",
  // 只保留必需参数
};
```

## 🧪 测试步骤

### 1. 重启服务器（应用修改）

```bash
# Ctrl+C 停止服务器
npm run dev
```

### 2. 重新测试支付

1. 访问 `http://localhost:3000/payment?debug=china`
2. 选择支付宝支付
3. 点击"立即支付"
4. ✅ 应该看到金额变为 ¥30.00 CNY
5. ✅ 跳转到支付宝沙箱
6. ✅ 不再显示参数错误

### 3. 验证金额

在支付宝收银台应该看到：

- 商品名称: "1 Month Premium Membership (One-time Payment)"
- 支付金额: ¥30.00（月付）或 ¥300.00（年付）
- 收款方: 沙箱商户

## 📊 价格对比

| 支付方式     | 月付  | 年付   |
| ------------ | ----- | ------ |
| 支付宝 (CNY) | ¥30   | ¥300   |
| Stripe (USD) | $9.99 | $99.99 |
| PayPal (USD) | $9.99 | $99.99 |

汇率: 约 1 USD = 7 CNY (实际汇率可能略有不同)

## ⚠️ 沙箱测试限制

### 支付宝沙箱环境限制

1. **最大金额**: 单笔不超过 10000 元
2. **账户余额**: 沙箱买家账户有 99999.99 元
3. **支付密码**: 统一为 111111
4. **登录密码**: 统一为 111111

### 建议测试金额

- ✅ ¥30 - 合理的测试金额
- ✅ ¥300 - 也在合理范围内
- ❌ ¥9.99 - 可能太小导致错误
- ❌ 超过 10000 - 超出沙箱限制

## 🔍 其他可能的参数问题

如果修复后仍有错误，检查这些参数：

### 1. product_code

```typescript
product_code: "FAST_INSTANT_TRADE_PAY"; // ✅ 电脑网站支付
// 其他选项:
// "QUICK_MSECURITY_PAY" - 手机网站支付
// "QUICK_WAP_WAY" - 手机网站支付(老版本)
```

### 2. subject (商品名称)

- ✅ 长度: 1-256 个字符
- ✅ 不能包含特殊符号
- ✅ 当前: "1 Month Premium Membership (One-time Payment)"

### 3. total_amount (金额)

- ✅ 格式: 数字字符串，小数点后最多 2 位
- ✅ 当前: "30.00" 或 "300.00"
- ❌ 避免: "9.99" (对人民币来说太小)

## 📝 调试日志

修复后，后端日志应该显示：

```javascript
Creating Alipay one-time payment
Calling Alipay API with order data: {
  method: 'alipay.trade.page.pay',
  bizContent: {
    out_trade_no: 'pay_xxx',
    product_code: 'FAST_INSTANT_TRADE_PAY',
    total_amount: '30.00',  // ✅ 人民币金额
    subject: '1 Month Premium Membership (One-time Payment)'
    // ✅ 没有 body 和 passback_params
  },
  returnUrl: 'http://localhost:3000/payment/success',
  notifyUrl: 'http://localhost:3000/api/payment/alipay/notify'
}
```

## 🎯 预期结果

修复后：

1. ✅ 跳转到支付宝成功
2. ✅ 显示正确的人民币金额（¥30.00）
3. ✅ 不再显示 "INVALID_PARAMETER" 错误
4. ✅ 可以使用沙箱账号登录
5. ✅ 可以完成支付流程

---

**状态**: ✅ 已修复  
**需要重启**: ✅ 是  
**最后更新**: 2025-11-05 15:45
