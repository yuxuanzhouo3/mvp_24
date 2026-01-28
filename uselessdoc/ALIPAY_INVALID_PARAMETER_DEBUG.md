# 支付宝 INVALID_PARAMETER 错误排查

## 🔍 可能的原因

### 1. 沙箱应用配置问题

请检查支付宝开放平台沙箱应用配置：

1. **登录支付宝开放平台**: https://openhome.alipay.com/
2. **进入沙箱环境**: 开发者中心 → 沙箱
3. **检查应用配置**:
   - 应用 ID: `9021000157643313` (确认是否正确)
   - 应用状态: 应该显示为"已上线"或"正常"
   - 产品功能: 需要开通"手机网站支付"或"电脑网站支付"

### 2. 常见配置缺失

#### ❌ 问题: 未开通支付功能

- 沙箱应用默认可能没有开通支付功能
- 需要手动添加"手机网站支付"或"电脑网站支付"产品

#### ❌ 问题: 应用网关未配置

- 某些情况下需要配置应用网关地址
- 沙箱环境: `http://localhost:3000/api/payment/alipay/notify`

#### ❌ 问题: 密钥配置错误

- 确认使用的是 RSA2 (SHA256) 密钥
- 确认私钥和公钥匹配

### 3. 临时解决方案

#### 方案 A: 使用更小的测试金额

修改代码使用 0.01 元测试:

```typescript
// alipay-provider.ts
const bizContent = {
  out_trade_no: outTradeNo,
  product_code: "FAST_INSTANT_TRADE_PAY",
  total_amount: "0.01", // 最小金额测试
  subject: "Test",
};
```

#### 方案 B: 简化商品名称

```typescript
const bizContent = {
  out_trade_no: outTradeNo,
  product_code: "FAST_INSTANT_TRADE_PAY",
  total_amount: order.amount.toFixed(2),
  subject: "test", // 最简单的名称
};
```

#### 方案 C: 尝试不同的 product_code

```typescript
// 电脑网站支付
product_code: "FAST_INSTANT_TRADE_PAY";

// 或者手机网站支付
product_code: "QUICK_WAP_WAY";
```

## 🛠️ 排查步骤

### 步骤 1: 检查沙箱配置

访问: https://openhome.alipay.com/develop/sandbox/app

检查项:

- [ ] APP_ID 是否为 `9021000157643313`
- [ ] 应用类型是否为"网页/移动应用"
- [ ] 是否已添加"电脑网站支付"功能
- [ ] RSA2 公钥是否已上传

### 步骤 2: 验证密钥

在沙箱应用页面:

1. 点击"接口加签方式"
2. 选择"公钥"模式
3. 上传你的公钥 (ALIPAY_PUBLIC_KEY)
4. 获取支付宝公钥 (ALIPAY_ALIPAY_PUBLIC_KEY)

### 步骤 3: 测试最简单的订单

使用沙箱提供的示例代码测试是否能创建订单

### 步骤 4: 查看详细错误

支付宝返回的错误通常包含 `sub_code` 和 `sub_msg`，可以提供更详细的信息

## 💡 快速修复建议

如果上述都检查过了，尝试以下修改:

### 修改 1: 使用最简参数

```javascript
const bizContent = {
  out_trade_no: outTradeNo,
  total_amount: "0.01",
  subject: "test",
  product_code: "FAST_INSTANT_TRADE_PAY",
};
```

### 修改 2: 移除 notify_url 和 return_url

```javascript
// 临时测试，只传必需参数
const result = await sdk.pageExec(
  "alipay.trade.page.pay",
  {}, // 不传URL
  { bizContent }
);
```

### 修改 3: 检查 SDK 版本

确认使用 `alipay-sdk@3.4.0`:

```bash
npm list alipay-sdk
```

## 📞 需要提供的信息

如果问题仍然存在，请提供:

1. 支付宝开放平台截图:

   - 沙箱应用详情页
   - 已开通的产品功能列表

2. 完整的错误信息:

   - 浏览器控制台的完整错误
   - 后端日志的完整输出

3. 沙箱账号信息:
   - 是否能登录沙箱买家账号
   - 沙箱卖家账号是否正常

## 🔗 参考文档

- [支付宝沙箱环境](https://openhome.alipay.com/develop/sandbox/app)
- [电脑网站支付产品介绍](https://opendocs.alipay.com/open/270)
- [手机网站支付产品介绍](https://opendocs.alipay.com/open/203)
- [常见错误码](https://opendocs.alipay.com/open/common/105806)

---

**下一步**: 请检查支付宝开放平台的沙箱应用配置，特别是是否已开通支付产品功能
