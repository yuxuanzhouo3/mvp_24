# PayPal 支付问题调试指南

## 当前状态

- ✅ PayPal Provider 已启用
- ✅ 环境变量已配置
- ✅ API 路由已修改为直接使用选择的支付方式
- ✅ 添加了详细的错误日志

## 可能的问题

### 1. PayPal 计划 ID 不存在

如果您看到类似 "PayPal subscription creation failed" 的错误，可能是因为计划 ID 不正确。

**检查方法**:

1. 打开浏览器开发者工具 (F12)
2. 切换到 Console 标签
3. 尝试选择 PayPal 支付
4. 查看是否有 "PayPal provider error" 或其他错误信息

**解决方法**:

```bash
# 检查 .env.local 中的 PayPal 计划 ID
PAYPAL_PRO_MONTHLY_PLAN_ID=P-7BH50182C51534933ND6HU5I
PAYPAL_PRO_ANNUAL_PLAN_ID=P-21561872X94841840ND6HWBQ
# ...等等
```

确保这些计划 ID 在 PayPal Dashboard 中存在。

### 2. PayPal 环境设置错误

**检查**:

```bash
# 确认环境设置
PAYPAL_ENVIRONMENT=sandbox  # 测试环境
# 或
PAYPAL_ENVIRONMENT=production  # 生产环境
```

如果您使用的是 sandbox 计划 ID，但环境设置为 production，支付会失败。

### 3. PayPal OAuth 凭据错误

**测试 PayPal 连接**:

打开浏览器控制台，查找类似以下的日志：

- `Initializing PayPal provider...`
- `PayPal provider initialized, creating payment...`
- `PayPal payment result:` ...

如果看到 "PayPal client ID is required" 或 "PayPal client secret is required"，说明凭据配置有问题。

### 4. 网络问题

PayPal API 调用需要访问 PayPal 服务器。如果网络有问题，可能导致超时。

## 调试步骤

### 步骤 1: 检查浏览器控制台

1. 打开 http://localhost:3000/payment
2. 按 F12 打开开发者工具
3. 选择 PayPal 支付方式
4. 点击"立即支付"
5. 查看 Console 标签的输出

**期望看到的日志**:

```
Creating payment with method: paypal
Initializing PayPal provider...
PayPal configuration validated successfully
PayPal provider initialized, creating payment...
PayPal payment result: { success: true, paymentId: "...", paymentUrl: "..." }
```

**如果失败，可能看到**:

```
PayPal provider error: PayPal client ID is required
// 或
PayPal provider error: Failed to get PayPal access token
// 或
PayPal payment result: { success: false, error: "..." }
```

### 步骤 2: 检查 Network 标签

1. 在开发者工具中切换到 Network 标签
2. 点击"立即支付"
3. 查找 `api/payment/create` 请求
4. 点击该请求查看:
   - **Request**: 发送的数据
   - **Response**: 返回的结果

**成功的响应**:

```json
{
  "success": true,
  "paymentId": "I-...",
  "paymentUrl": "https://www.sandbox.paypal.com/..."
}
```

**失败的响应**:

```json
{
  "success": false,
  "error": "具体的错误信息"
}
```

### 步骤 3: 检查服务器日志

查看终端输出，寻找相关日志：

```bash
# 成功的日志
Creating payment with method: paypal
Initializing PayPal provider...
PayPal configuration validated successfully
PayPal provider initialized, creating payment...
POST /api/payment/create 200 in 1742ms

# 失败的日志
Creating payment with method: paypal
Initializing PayPal provider...
PayPal provider error: [错误信息]
POST /api/payment/create 500 in 100ms
```

## 常见错误及解决方案

### 错误 1: "Payment method 'paypal' not available in your region"

**原因**: 当前区域不支持 PayPal

**解决**:

- 确认您在美国或国际地区（不是中国或欧洲）
- 或者使用 debug 模式: `http://localhost:3000/payment?debug=usa`

### 错误 2: "PayPal client ID is required"

**原因**: 环境变量未设置

**解决**:

```bash
# 检查 .env.local
PAYPAL_CLIENT_ID=你的客户端ID
PAYPAL_CLIENT_SECRET=你的客户端密钥
```

然后重启开发服务器:

```bash
# Ctrl+C 停止
npm run dev
```

### 错误 3: "Failed to get PayPal access token"

**原因**: Client ID 或 Secret 不正确，或网络问题

**解决**:

1. 验证凭据在 [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/) 中正确
2. 确认使用的是 sandbox 凭据（如果环境是 sandbox）
3. 检查网络连接

### 错误 4: "PayPal subscription creation failed: ..."

**原因**: 计划 ID 不存在或不正确

**解决**:

1. 登录 [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/)
2. 前往 Apps & Credentials
3. 选择您的应用
4. 查看 Products 部分，确认计划 ID 存在
5. 将正确的计划 ID 填入 `.env.local`

### 错误 5: "Payment request already in progress"

**原因**: 重复提交相同的支付请求

**解决**: 等待几秒钟后重试，或取消之前的支付

## 手动测试 PayPal 配置

您可以使用以下 Node.js 脚本测试 PayPal 配置:

```javascript
// test-paypal.js
require("dotenv").config({ path: ".env.local" });

async function testPayPal() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const environment = process.env.PAYPAL_ENVIRONMENT || "sandbox";

  console.log("Testing PayPal configuration...");
  console.log("Environment:", environment);
  console.log("Client ID:", clientId ? "✅ Set" : "❌ Missing");
  console.log("Client Secret:", clientSecret ? "✅ Set" : "❌ Missing");

  if (!clientId || !clientSecret) {
    console.error("❌ PayPal credentials are missing!");
    return;
  }

  const baseUrl =
    environment === "production"
      ? "https://api.paypal.com"
      : "https://api.sandbox.paypal.com";

  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (response.ok) {
      console.log("✅ PayPal authentication successful!");
      const data = await response.json();
      console.log(
        "Access token obtained:",
        data.access_token.substring(0, 20) + "..."
      );
    } else {
      console.error("❌ PayPal authentication failed!");
      const error = await response.text();
      console.error("Error:", error);
    }
  } catch (error) {
    console.error("❌ Error testing PayPal:", error.message);
  }
}

testPayPal();
```

运行测试:

```bash
node test-paypal.js
```

## 当前已添加的调试功能

在代码中已添加以下日志:

1. **API 路由** (`app/api/payment/create/route.ts`):

   - `Creating payment with method: ${method}`
   - `Initializing PayPal provider...`
   - `PayPal provider initialized, creating payment...`
   - `PayPal payment result:` + 结果

2. **PayPal Provider** (`lib/...paypal-provider.ts`):
   - `PayPal configuration validated successfully`
   - `PayPal client ID is missing` (警告)
   - `PayPal client secret is missing` (警告)

## 下一步

如果问题仍然存在，请:

1. 截图浏览器控制台的完整错误信息
2. 复制服务器终端的相关日志
3. 确认环境变量配置正确

这样我可以提供更具体的解决方案。

---

**最后更新**: 2025-10-29
**状态**: 待测试
