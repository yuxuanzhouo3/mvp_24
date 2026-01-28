# 🔔 Stripe Webhook 配置指南

## 📍 一次性支付系统需要配置的 Webhook 事件

### 🎯 在 Stripe Dashboard 配置步骤

#### 1. 登录 Stripe Dashboard

- 测试环境：https://dashboard.stripe.com/test/webhooks
- 生产环境：https://dashboard.stripe.com/webhooks

#### 2. 点击 "Add endpoint"（添加端点）

#### 3. 填写 Endpoint URL（端点地址）

```
https://mvp-24-main.vercel.app/api/payment/onetime/webhook
```

#### 4. **只选择以下 1 个事件** ⚠️

```
✅ checkout.session.completed
```

**说明**：

- `checkout.session.completed`: 当用户完成支付（一次性支付或订阅）时触发
- 我们的代码会检查 `session.mode === "payment"` 来确保只处理一次性支付

---

## ❌ **不需要**选择的订阅相关事件

因为我们现在使用一次性支付，以下事件**不要选择**：

```
❌ customer.subscription.created
❌ customer.subscription.updated
❌ customer.subscription.deleted
❌ invoice.paid
❌ invoice.payment_failed
❌ invoice.payment_succeeded
```

---

## 🔐 配置完成后的操作

### 5. 获取 Webhook Signing Secret

配置完成后，Stripe 会显示一个 **Signing Secret**（签名密钥），格式类似：

```
whsec_1234567890abcdefghijklmnopqrstuvwxyz
```

### 6. 更新 .env.local 文件

将这个密钥复制到你的 `.env.local` 文件：

```bash
# 替换这行
STRIPE_WEBHOOK_SECRET=whsec_example

# 改为你的真实密钥
STRIPE_WEBHOOK_SECRET=whsec_1234567890abcdefghijklmnopqrstuvwxyz
```

---

## 🧪 测试 Webhook

### 在本地测试（使用 Stripe CLI）

1. 安装 Stripe CLI:

```powershell
# Windows (需要 Chocolatey)
choco install stripe-cli
```

2. 登录并转发 webhook:

```powershell
stripe login
stripe listen --forward-to localhost:3000/api/payment/onetime/webhook
```

3. 触发测试事件:

```powershell
stripe trigger checkout.session.completed
```

### 在生产环境测试

1. 在 Stripe Dashboard 的 Webhook 页面，点击你配置的 endpoint
2. 点击 "Send test webhook"
3. 选择 `checkout.session.completed` 事件
4. 点击 "Send test webhook" 发送

---

## 📋 快速检查清单

配置完成后检查：

- [ ] Webhook URL 是 `https://mvp-24-main.vercel.app/api/payment/onetime/webhook`
- [ ] 只选择了 `checkout.session.completed` 事件
- [ ] 获取了 Signing Secret（whsec\_开头）
- [ ] 更新了 `.env.local` 中的 `STRIPE_WEBHOOK_SECRET`
- [ ] 重新部署了应用（如果在生产环境）或重启了本地开发服务器

---

## 🔍 Webhook 工作流程

```
用户支付 Stripe Checkout
     ↓
Stripe 触发 checkout.session.completed
     ↓
Stripe 发送 POST 请求到你的 webhook URL
     ↓
你的代码验证签名 ✅
     ↓
检查 session.mode === "payment" （一次性支付）
     ↓
从 metadata 获取 userId 和 days
     ↓
更新 user_profiles.membership_expires_at
     ↓
标记 webhook_events 为已处理
```

---

## ⚠️ 注意事项

1. **测试环境和生产环境需要分别配置**

   - 测试环境的 webhook secret 只能用于测试
   - 生产环境需要重新配置并获取新的 secret

2. **Webhook 签名验证**

   - 生产环境必须启用签名验证（不要用 `whsec_example`）
   - 这可以防止恶意请求伪造支付成功事件

3. **幂等性保证**
   - 代码已实现重复检查（`webhook_events` 表）
   - 同一个事件多次到达只会处理一次

---

## 📞 遇到问题？

### Webhook 未收到

1. 检查 URL 是否正确（必须是 HTTPS）
2. 检查 Vercel 部署是否成功
3. 在 Stripe Dashboard > Webhooks > 你的 endpoint > Events 查看发送记录

### Webhook 报错

1. 查看 Stripe Dashboard 中的错误详情
2. 检查 `.env.local` 中的 `STRIPE_WEBHOOK_SECRET` 是否正确
3. 查看应用日志（Vercel Logs 或本地终端输出）

---

## 🎉 完成

配置完成后，当用户完成支付，系统会自动：

- ✅ 接收 Stripe webhook 通知
- ✅ 验证支付状态
- ✅ 延长用户会员时间
- ✅ 更新数据库记录

无需用户手动刷新页面！
