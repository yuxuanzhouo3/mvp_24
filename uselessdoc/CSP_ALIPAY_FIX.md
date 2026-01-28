# CSP 配置修复 - 支付宝表单提交被阻止

## 🐛 问题

浏览器控制台错误：

```
Refused to send form data to 'https://openapi-sandbox.dl.alipaydev.com/...'
because it violates the following Content Security Policy directive:
"form-action 'self' https://www.paypal.com"
```

## 🔍 原因

Content Security Policy (CSP) 的 `form-action` 指令限制了可以提交表单的目标域名。原配置只允许：

- `'self'` - 同源地址
- `https://www.paypal.com` - PayPal

但**不包括支付宝的域名**，所以浏览器阻止了表单提交。

## ✅ 解决方案

修改 `next.config.mjs` 中的 CSP 配置，添加支付宝域名：

```javascript
form-action 'self' https://www.paypal.com https://openapi.alipay.com https://openapi-sandbox.dl.alipaydev.com;
```

### 添加的域名：

- `https://openapi.alipay.com` - 支付宝正式环境网关
- `https://openapi-sandbox.dl.alipaydev.com` - 支付宝沙箱环境网关

## 🚀 应用修复

**重要**: 修改 `next.config.mjs` 后必须重启开发服务器！

### 步骤：

1. **停止开发服务器**:

   ```bash
   # 在运行 npm run dev 的终端按 Ctrl+C
   ```

2. **重新启动**:

   ```bash
   npm run dev
   ```

3. **清除浏览器缓存**:

   - 打开开发者工具 (F12)
   - 右键点击刷新按钮
   - 选择 "清空缓存并硬性重新加载"

4. **重新测试**:
   - 访问: `http://localhost:3000/payment?debug=china`
   - 选择支付宝支付
   - 点击"立即支付"
   - ✅ **现在应该能成功跳转了！**

## 🔍 验证修复

### 测试前检查：

1. **确认服务器已重启**:

   ```bash
   # 终端应该显示
   ○ Compiling /payment ...
   ✓ Compiled /payment in XXXms
   ```

2. **检查 CSP Header**:
   - 打开浏览器开发者工具 (F12)
   - Network 标签
   - 刷新页面
   - 点击页面请求 (通常是第一个)
   - 查看 Response Headers
   - 找到 `Content-Security-Policy`
   - 应该包含: `form-action 'self' https://www.paypal.com https://openapi.alipay.com https://openapi-sandbox.dl.alipaydev.com`

### 测试支付：

1. **创建支付订单**
2. **检查控制台日志**:
   ```
   Rendering Alipay payment form...
   Submitting Alipay form to: https://openapi-sandbox.dl.alipaydev.com/...
   ```
3. **不应该再有 CSP 错误！**
4. **页面应该自动跳转到支付宝收银台**

## 📋 完整的 CSP 配置

修复后的 `form-action` 指令：

```javascript
form-action
  'self'                                      // 允许提交到同源
  https://www.paypal.com                      // PayPal 支付
  https://openapi.alipay.com                  // 支付宝正式环境
  https://openapi-sandbox.dl.alipaydev.com;   // 支付宝沙箱环境
```

## ⚠️ 安全说明

### 为什么需要这些域名？

1. **`'self'`**: 允许表单提交到自己的服务器 (必需)
2. **PayPal**: 允许提交到 PayPal 支付网关 (PayPal 支付必需)
3. **支付宝正式环境**: 生产环境使用 (生产部署后必需)
4. **支付宝沙箱环境**: 开发测试使用 (开发阶段必需)

### 这样安全吗？

✅ **是的**，这是标准的支付集成做法：

- 只允许提交到**已知的、受信任的**支付网关
- 不允许提交到任意域名
- 限制在支付宝的官方域名
- CSP 仍然有效保护用户安全

### 生产环境建议

如果只在生产环境使用，可以移除沙箱域名：

```javascript
// 生产环境配置
form-action 'self' https://www.paypal.com https://openapi.alipay.com;
```

## 🎯 预期结果

修复后的完整流程：

```
用户点击支付
    ↓
创建支付订单成功
    ↓
渲染支付宝表单
    ↓
提交表单到支付宝网关
    ↓
✅ CSP 检查通过 (域名在白名单中)
    ↓
浏览器发起 POST 请求
    ↓
跳转到支付宝收银台
    ↓
用户完成支付
```

## 💡 调试技巧

### 如果还有 CSP 错误：

1. **检查服务器是否重启**: 必须重启才能应用配置
2. **清除浏览器缓存**: 旧的 CSP 可能被缓存
3. **检查域名拼写**: 确保域名完全匹配
4. **查看 Response Headers**: 验证新的 CSP 已应用

### 常见 CSP 错误：

```javascript
// ❌ 错误：域名拼写错误
form-action 'self' https://openapi.alipay.cn  // 应该是 .com

// ❌ 错误：缺少协议
form-action 'self' openapi.alipay.com  // 应该加 https://

// ✅ 正确
form-action 'self' https://openapi.alipay.com
```

## 🔗 相关资源

- [MDN - CSP: form-action](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/form-action)
- [支付宝开放平台](https://opendocs.alipay.com/)
- [支付宝沙箱环境](https://openhome.alipay.com/develop/sandbox/app)

---

**修复状态**: ✅ 已完成  
**需要重启**: ✅ 是的，必须重启开发服务器  
**最后更新**: 2025-11-05 15:35
