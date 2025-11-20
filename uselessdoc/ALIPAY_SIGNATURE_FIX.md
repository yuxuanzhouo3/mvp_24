# 支付宝签名验证失败解决方案

## 错误信息

```
invalid-signature
验签出错，建议检查签名字符串或签名私钥与应用公钥是否匹配
```

## 问题诊断

### 待验签字符串

```
app_id=9021000157643313&charset=utf-8&method=alipay.trade.page.pay&notify_url=http://localhost:3000/api/payment/alipay/notify&return_url=http://localhost:3000/payment/success&sign_type=RSA2&timestamp=2025-11-05 15:59:21&version=1.0
```

### 可能原因

#### ⭐ 原因 1：应用公钥未上传到支付宝沙箱（最可能）

您需要在支付宝沙箱控制台上传应用公钥。

**操作步骤：**

1. 访问：https://openhome.alipay.com/develop/sandbox/app
2. 找到应用：9021000157643313
3. 点击"接口加签方式" → "公钥模式" → "设置/查看"
4. 上传以下公钥：

```
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApWWfQPeC9rUP+GueZZD25zK9LYXI7Gc/vDIXAaTJPjh6fc1o2ku7CoDUsqxsNQiQU3c8vWJxMdVdq8Osr4SKhYd6kgLnRBbK2qQaRYTvphLweNBwLQrEp3oHndNcP9rf5XqlebQ/XUbX2i0hRtRl7Q5UXopxNxpdOn3oNYS2NOwfPRHIuvyW9sRscdinf6jmik/YIkXbtAtUUfDjcHb2Y1AFZavLL+h+AjIQP/IauIf0d3PrLbXZyKbuB+/yKQzjgT2X5QKUrJuE4bNoFu5ITrZlef7jEG74qfpUMuqi2asERMBRodTwKQS5+HQmviDxqf6V3FMd8PLPM28wXhsWqwIDAQAB
```

**注意：只上传公钥内容，不要包含 `-----BEGIN PUBLIC KEY-----` 和 `-----END PUBLIC KEY-----`**

#### 原因 2：私钥与公钥不匹配

检查 .env.local 中的私钥和公钥是否是一对。

**验证方法：**
运行以下测试脚本验证密钥对：

```bash
node scripts/verify-key-pair.js
```

#### 原因 3：沙箱环境使用了系统生成的密钥

支付宝沙箱可能默认使用"系统默认密钥"，需要切换到"自定义密钥"模式。

## 解决方案

### 方案 1：上传应用公钥到沙箱（推荐）

1. **复制应用公钥**（来自 .env.local 的 ALIPAY_PUBLIC_KEY）：

```
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApWWfQPeC9rUP+GueZZD25zK9LYXI7Gc/vDIXAaTJPjh6fc1o2ku7CoDUsqxsNQiQU3c8vWJxMdVdq8Osr4SKhYd6kgLnRBbK2qQaRYTvphLweNBwLQrEp3oHndNcP9rf5XqlebQ/XUbX2i0hRtRl7Q5UXopxNxpdOn3oNYS2NOwfPRHIuvyW9sRscdinf6jmik/YIkXbtAtUUfDjcHb2Y1AFZavLL+h+AjIQP/IauIf0d3PrLbXZyKbuB+/yKQzjgT2X5QKUrJuE4bNoFu5ITrZlef7jEG74qfpUMuqi2asERMBRodTwKQS5+HQmviDxqf6V3FMd8PLPM28wXhsWqwIDAQAB
```

2. **登录沙箱控制台**：https://openhome.alipay.com/develop/sandbox/app

3. **上传公钥**：

   - 应用信息 → 开发信息 → 接口加签方式
   - 点击"公钥模式"旁边的"查看/设置"
   - 选择"自定义密钥"
   - 粘贴上述公钥（不含 BEGIN/END 行）
   - 点击"保存"

4. **重新测试**

### 方案 2：使用沙箱系统默认密钥

如果不想自定义密钥，可以使用沙箱提供的系统默认密钥。

**操作步骤：**

1. 在沙箱控制台选择"系统默认密钥"
2. 获取系统提供的私钥和支付宝公钥
3. 更新 .env.local 文件

## 立即操作

**请执行以下步骤：**

1. 访问 https://openhome.alipay.com/develop/sandbox/app
2. 找到"接口加签方式"部分
3. 检查当前是"系统默认密钥"还是"自定义密钥"
4. 如果是系统默认：获取系统提供的密钥并更新代码
5. 如果是自定义：上传上述应用公钥

**请告诉我：**

- 当前使用的是"系统默认密钥"还是"自定义密钥"？
- 是否成功上传了应用公钥？
