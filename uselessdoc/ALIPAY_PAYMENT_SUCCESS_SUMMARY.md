# 支付宝支付 - 订阅状态更新完整指南 ✅

## 🎯 问题解决总结

### 问题描述

用户通过支付宝支付成功后，系统无法获取到用户 ID，导致无法更新用户的订阅状态。

### 根本原因

1. 支付创建时，userId 没有传递给支付宝 API
2. 支付宝回调时，Webhook 无法获取到 userId

### 解决方案

已为你的代码应用了**两处关键修复**：

---

## ✅ 已应用的修复

### 修复 1️⃣：支付宝 Provider - 传递 userId

**文件**: `lib/architecture-modules/layers/third-party/payment/providers/alipay-provider.ts`

**修改内容**：在 `buildAlipayOrder` 方法中添加 `passback_params` 参数

```typescript
const bizContent = {
  out_trade_no: outTradeNo, // 订单号
  total_amount: order.amount.toFixed(2), // 金额
  subject: order.description, // 标题
  product_code: isWap ? "QUICK_WAP_WAY" : "FAST_INSTANT_TRADE_PAY",
  // ✅ 新增：通过 passback_params 传递 userId
  passback_params: order.userId || "", // 支付宝会原样返回
};
```

**作用**: 支付宝会在回调时原样返回 `passback_params`，这样我们就能获取到 userId

---

### 修复 2️⃣：Webhook 处理器 - 提取 userId

**文件**: `lib/payment/webhook-handler.ts`

**修改内容**：在 `handlePaymentSuccess` 方法中正确提取 userId

```typescript
case "alipay":
  subscriptionId = data.out_trade_no;
  // ✅ 修复：passback_params 是字符串，不是对象
  // 支付宝会原样返回我们在创建支付时设置的值
  userId = data.passback_params || "";
  amount = parseFloat(data.total_amount || "0");
  currency = "CNY";
  break;
```

**作用**: 正确从支付宝回调参数中提取 userId

---

## 🔄 完整工作流程

```
1️⃣ 用户点击支付
   ↓
2️⃣ 调用 /api/payment/onetime/create
   order = { userId: "user_123", amount: 30, ... }
   ↓
3️⃣ AlipayProvider.createPayment(order)
   ↓
4️⃣ buildAlipayOrder()
   bizContent = {
     out_trade_no: "xxx",
     total_amount: "30.00",
     passback_params: "user_123"  ✅ userId传入
   }
   ↓
5️⃣ 调用支付宝API生成支付表单
   ↓
6️⃣ 返回HTML表单给前端
   ↓
7️⃣ 用户在支付宝中完成支付
   ↓
8️⃣ 支付宝回调 /api/payment/webhook/alipay
   params = {
     out_trade_no: "xxx",
     passback_params: "user_123",  ✅ userId返回
     trade_status: "TRADE_SUCCESS",
     total_amount: "30.00"
   }
   ↓
9️⃣ Webhook验证签名
   ↓
🔟 handleAlipayEvent()
   userId = data.passback_params  ✅ 成功提取
   ↓
1️⃣1️⃣ updateSubscriptionStatus()
   ↓
1️⃣2️⃣ 更新用户数据：
   ✅ subscription_status = "active"
   ✅ subscription_plan = "pro"
   ✅ pro = true (CloudBase)
   ↓
1️⃣3️⃣ 记录支付记录：
   ✅ payment.status = "completed"
   ↓
1️⃣4️⃣ 用户可使用专业版功能
```

---

## 📊 数据库状态变化

### 支付前

```
payments表:
  (无记录)

user_profiles表 (Supabase):
  id: "user_123"
  subscription_plan: "free"
  subscription_status: "free"

web_users表 (CloudBase):
  _id: "user_123"
  pro: false

subscriptions表:
  (无记录)
```

### 支付后（成功）

```
payments表:
  user_id: "user_123"
  subscription_id: "sub_xxx"
  amount: 30
  currency: "CNY"
  status: "completed"  ✅ 从 pending 变为 completed
  payment_method: "alipay"
  transaction_id: "xxx"

user_profiles表 (Supabase):
  id: "user_123"
  subscription_plan: "pro"  ✅ 升级
  subscription_status: "active"  ✅ 激活

web_users表 (CloudBase):
  _id: "user_123"
  pro: true  ✅ 激活
  subscription_id: "xxx"
  subscription_provider: "alipay"

subscriptions表:
  user_id: "user_123"
  plan_id: "pro"
  status: "active"  ✅ 激活
  provider_subscription_id: "xxx"
```

---

## 🧪 验证修复

### 方式 1️⃣：查看服务器日志

支付成功后，检查日志中应该看到：

```
[INFO] Processing webhook: alipay TRADE_SUCCESS
[INFO] Alipay payment success data
[INFO] Extracted data:
  subscriptionId: "xxx"
  userId: "user_123"  ✅ 不再为空
  amount: 30
  currency: "CNY"

[BUSINESS] payment_success_processed
  userId: "user_123"  ✅ 用户ID被成功记录
  provider: "alipay"
  subscriptionId: "xxx"
```

### 方式 2️⃣：查询数据库

**Supabase（国际地区）**:

```sql
SELECT
  subscription_plan,
  subscription_status,
  updated_at
FROM user_profiles
WHERE id = 'user_123';
-- 应该看到：
-- pro | active | 2024-11-08T10:30:00Z
```

**CloudBase（中国地区）**:

```javascript
db.collection("web_users")
  .where({ _id: "user_123" })
  .get()
  .then((res) => {
    console.log(res.data[0].pro); // 应该是 true
    console.log(res.data[0].subscription_provider); // 应该是 "alipay"
  });
```

### 方式 3️⃣：检查支付记录

```sql
SELECT
  id,
  status,
  created_at
FROM payments
WHERE user_id = 'user_123'
ORDER BY created_at DESC
LIMIT 1;
-- 应该看到：
-- pay_xxx | completed | 2024-11-08T...
```

---

## 🚀 后续操作

### 重新部署应用

```bash
# 部署修改后的代码
npm run build
npm run deploy

# 或者如果使用PM2
pm2 restart app

# 或者如果使用Docker
docker-compose up --build
```

### 测试支付流程

1. ✅ 登录用户账号
2. ✅ 进入支付页面
3. ✅ 选择套餐（建议选择月付较便宜）
4. ✅ 选择支付宝支付方式
5. ✅ 完成支付（使用沙箱账号或真实账号）
6. ✅ 支付成功后检查用户状态
7. ✅ 验证用户可以访问专业版功能

---

## 📋 故障排查

### ❌ 如果支付后用户状态仍未更新

**检查清单**（按顺序检查）：

- [ ] 1. 日志中是否有 `[INFO] Processing webhook: alipay` 的日志？
  - 如果没有：说明 Webhook 没有被调用，检查支付宝的回调地址配置
- [ ] 2. 日志中 userId 是否为空？

  - 如果为空：说明 passback_params 没有被正确传递或返回
  - 检查 AlipayProvider 中 buildAlipayOrder 是否添加了 passback_params
  - 检查 Webhook 中是否正确读取了 data.passback_params

- [ ] 3. 是否有错误日志？
  - 搜索 `[ERROR]` 日志
  - 检查数据库连接是否正常
- [ ] 4. 数据库表是否存在？

  - 确保有 `payments`, `subscriptions`, `user_profiles` 表
  - 确保用户表有 `subscription_plan`, `subscription_status` 字段

- [ ] 5. 环境配置是否正确？
  - 检查 `ALIPAY_ALIPAY_PUBLIC_KEY` 是否正确设置
  - 检查 `ALIPAY_GATEWAY_URL` 是否指向正确的环境（沙箱或生产）

### ✅ 检查命令

```bash
# 查看最近的日志
tail -f /path/to/app.log | grep "alipay\|webhook"

# 查看数据库中的支付记录
sqlite3 ./database.db "SELECT * FROM payments ORDER BY created_at DESC LIMIT 5;"

# 查看用户信息
sqlite3 ./database.db "SELECT id, subscription_plan, subscription_status FROM user_profiles WHERE id='user_123';"
```

---

## 📚 相关文档

- **详细指南**：`PAYMENT_SUCCESS_UPDATE_GUIDE.md`
- **验证步骤**：`PAYMENT_VERIFICATION_GUIDE.md`
- **修复详情**：`ALIPAY_USERID_FIX.md`

---

## 🎉 总结

| 项目     | 状态 | 说明                   |
| -------- | ---- | ---------------------- |
| 问题识别 | ✅   | 发现 userId 传递缺陷   |
| 代码修复 | ✅   | 已应用 2 处关键修改    |
| 文档完善 | ✅   | 提供详细指南和验证步骤 |
| 测试准备 | ✅   | 可以开始测试支付流程   |

**现在支付宝支付成功后，用户的订阅状态应该能被正确更新了！** 🚀
