# 支付宝支付 - userId 传递缺陷修复方案

## 🔴 发现的问题

支付宝支付成功后，**webhook 无法获取到 userId**，导致订阅状态无法更新。

### 问题根源：

1. **创建支付时**：userId 被传递到了`order.userId`，但**没有传递给支付宝 API**
2. **支付宝回调时**：Webhook 中尝试从`data.passback_params?.userId`获取，但这个字段**从未被设置**

```typescript
// ❌ 问题代码（webhook-handler.ts 第365行）
const userId = data.passback_params?.userId || ""; // 这总是空的！
```

---

## ✅ 修复方案

### 方案 A：使用支付宝的 passback_params 参数（推荐）

支付宝 API 支持`passback_params`参数来传递自定义数据。

#### 步骤 1：修改 Alipay Provider

**文件**：`lib/architecture-modules/layers/third-party/payment/providers/alipay-provider.ts`

```typescript
// 在 buildAlipayOrder 方法中添加 passback_params
protected async buildAlipayOrder(order: any): Promise<any> {
  const outTradeNo = this.generatePaymentId();

  const productMode = (
    process.env.ALIPAY_PRODUCT_MODE || "page"
  ).toLowerCase();
  const isWap = productMode === "wap";

  const bizContent = {
    out_trade_no: outTradeNo,
    total_amount: order.amount.toFixed(2),
    subject: order.description,
    product_code: isWap ? "QUICK_WAP_WAY" : "FAST_INSTANT_TRADE_PAY",
    // ✅ 新增：传递userId作为passback_params
    passback_params: order.userId || "",
  };

  return {
    method: isWap ? "alipay.trade.wap.pay" : "alipay.trade.page.pay",
    bizContent,
    returnUrl: this.alipayConfig.returnUrl,
    notifyUrl: this.alipayConfig.notifyUrl,
  };
}
```

#### 步骤 2：修改 Webhook 处理

**文件**：`lib/payment/webhook-handler.ts`（第 365 行左右）

```typescript
case "alipay":
  subscriptionId = data.out_trade_no;
  // ✅ 修改：从 passback_params 正确获取 userId
  userId = data.passback_params || ""; // passback_params会作为字符串返回
  amount = parseFloat(data.total_amount || "0");
  currency = "CNY";
  break;
```

---

### 方案 B：通过 out_trade_no 反查用户 ID（备选）

如果 passback_params 方案不可行，可以从 payments 表反查用户。

#### 修改 Webhook 处理

```typescript
case "alipay":
  subscriptionId = data.out_trade_no;

  // 先尝试从passback_params获取
  userId = data.passback_params || "";

  // 如果没有，从payments表查询
  if (!userId && isChinaRegion()) {
    const db = getDatabase();
    const result = await db
      .collection("payments")
      .where({
        transaction_id: subscriptionId,
      })
      .limit(1)
      .get();

    if (result.data && result.data.length > 0) {
      userId = result.data[0].user_id;
    }
  } else if (!userId) {
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("user_id")
      .eq("transaction_id", subscriptionId)
      .limit(1)
      .maybeSingle();

    if (payment) {
      userId = payment.user_id;
    }
  }

  amount = parseFloat(data.total_amount || "0");
  currency = "CNY";
  break;
```

---

## 🔧 完整的修复步骤

### 步骤 1：更新支付宝 Provider

```bash
编辑文件：lib/architecture-modules/layers/third-party/payment/providers/alipay-provider.ts
```

查找这一行（约第 129 行）：

```typescript
const bizContent = {
  out_trade_no: outTradeNo, // 必需：商户订单号
  total_amount: order.amount.toFixed(2), // 必需：订单总金额，单位元，精确到小数点后两位
  subject: order.description, // 必需：订单标题，最长256字符
  product_code: isWap
    ? "QUICK_WAP_WAY" // 手机网站支付
    : "FAST_INSTANT_TRADE_PAY", // 电脑网站支付
};
```

替换为：

```typescript
const bizContent = {
  out_trade_no: outTradeNo, // 必需：商户订单号
  total_amount: order.amount.toFixed(2), // 必需：订单总金额，单位元，精确到小数点后两位
  subject: order.description, // 必需：订单标题，最长256字符
  product_code: isWap
    ? "QUICK_WAP_WAY" // 手机网站支付
    : "FAST_INSTANT_TRADE_PAY", // 电脑网站支付
  // ✅ 新增：传递用户ID作为passback_params，支付宝会原样返回
  passback_params: order.userId || "",
};
```

### 步骤 2：更新 Webhook 处理器

```bash
编辑文件：lib/payment/webhook-handler.ts
```

查找 alipay 的数据提取部分（约第 365 行）：

```typescript
case "alipay":
  subscriptionId = data.out_trade_no;
  userId = data.passback_params?.userId || ""; // ❌ 错误
  amount = parseFloat(data.total_amount || "0");
  currency = "CNY";
  break;
```

替换为：

```typescript
case "alipay":
  subscriptionId = data.out_trade_no;
  // ✅ 修复：passback_params 直接返回字符串，不是对象
  userId = data.passback_params || "";
  amount = parseFloat(data.total_amount || "0");
  currency = "CNY";
  break;
```

---

## 📝 支付宝参数说明

### passback_params 参数

| 属性              | 说明                                               |
| ----------------- | -------------------------------------------------- |
| **说明**          | 公用回传参数，如果请求时传递了该参数，则返回给商户 |
| **长度**          | 512 字符以内                                       |
| **格式**          | 字符串                                             |
| **在 webhook 中** | 会作为 `passback_params` 字段返回（字符串形式）    |

**支付宝官方文档**：
https://opendocs.alipay.com/open/59da99d0_alipay.trade.page.pay

### 回调参数示例

支付宝 Webhook 中会返回：

```
POST /api/payment/webhook/alipay?
  out_trade_no=xxx
  trade_no=xxx
  trade_status=TRADE_SUCCESS
  total_amount=30.00
  passback_params=user_12345  // ✅ userId会在这里返回
  sign=xxx
  sign_type=RSA2
```

---

## ✅ 验证修复

修复后，你可以通过以下方式验证：

### 1. 查看 webhook 日志

支付宝支付成功后，在服务器日志中检查：

```
[INFO] Webhook data:
{
  out_trade_no: "2024xxx",
  trade_no: "2024xxx",
  passback_params: "user_abc123",  // ✅ 应该能看到userId
  trade_status: "TRADE_SUCCESS",
  total_amount: "30.00"
}
```

### 2. 检查用户数据库

支付成功后，验证用户状态是否更新：

**CloudBase：**

```javascript
// 应该看到 pro: true
db.collection("web_users").where({ _id: "user_abc123" }).get();
```

**Supabase：**

```sql
-- 应该看到 subscription_plan: "pro", subscription_status: "active"
SELECT * FROM user_profiles WHERE id = 'user_abc123'
```

### 3. 检查支付记录

```sql
-- status 应该从 pending 变为 completed
SELECT * FROM payments WHERE user_id = 'user_abc123' ORDER BY created_at DESC LIMIT 1
```

---

## 🚨 可能的问题

### Q: passback_params 超过 512 字符怎么办？

**A:** 不要直接传递整个 userId 对象。只传递 userId 字符串：

```typescript
// ✅ 正确
passback_params: order.userId, // "user_abc123"

// ❌ 错误
passback_params: JSON.stringify({userId: order.userId}) // 可能超长
```

### Q: 沙箱环境不支持 passback_params？

**A:** 支付宝沙箱环境完全支持 passback_params。如果不工作，检查：

1. 是否正确在 bizContent 中设置
2. 是否正确 URL 编码（如果需要的话）
3. 是否是 SDK 版本问题

---

## 📊 完整数据流向图

```
用户选择套餐
    ↓
请求 /api/payment/onetime/create
    ↓
order = {
  userId: "user_123",
  amount: 30,
  ...
}
    ↓
AlipayProvider.createPayment(order)
    ↓
buildAlipayOrder() {
  bizContent: {
    out_trade_no: "xxx",
    total_amount: "30.00",
    passback_params: "user_123"  // ✅ 关键：在这里传递
  }
}
    ↓
支付宝API处理支付
    ↓
用户支付成功
    ↓
支付宝回调 /api/payment/webhook/alipay
    ↓
webhook接收的params:
{
  out_trade_no: "xxx",
  passback_params: "user_123",  // ✅ 支付宝原样返回
  trade_status: "TRADE_SUCCESS"
}
    ↓
handleAlipayEvent()
    ↓
userId = data.passback_params // ✅ 成功提取userId
    ↓
updateSubscriptionStatus(userId, ...)
    ↓
用户subscription_plan更新为"pro"
用户subscription_status更新为"active"
```

---

## 🎯 总结

| 阶段     | 文件               | 修改点            | 修改内容                            |
| -------- | ------------------ | ----------------- | ----------------------------------- |
| 支付创建 | alipay-provider.ts | buildAlipayOrder  | 添加`passback_params: order.userId` |
| 回调处理 | webhook-handler.ts | handleAlipayEvent | 改为`userId = data.passback_params` |

这样支付宝就能正确地传递并返回 userId，Webhook 就能成功更新用户的订阅状态！
