# 🚀 MultiGPT Platform 上线部署教程

## 📋 概述

本教程将指导你将 MultiGPT Platform 完整部署到生产环境。项目包含支付系统、AI 集成、地理分流等核心功能。

## 🎯 前置要求

### 系统要求

- Node.js 18.0+
- Git
- Vercel 账户
- 域名（可选）

### 第三方服务账户

- [Supabase](https://supabase.com/) - 数据库和认证
- [Stripe](https://stripe.com/) - 国际支付
- [PayPal](https://developer.paypal.com/) - 支付
- [OpenAI](https://platform.openai.com/) - AI 服务
- [Anthropic](https://console.anthropic.com/) - Claude AI

---

## 📦 第一步：代码部署

### 1.1 克隆项目

```bash
git clone https://github.com/your-username/mvp24.git
cd mvp24
```

### 1.2 安装依赖

```bash
npm install
# 或
pnpm install
```

### 1.3 推送到你的仓库

```bash
# 添加你的远程仓库
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# 推送代码
git push -u origin main
```

---

## 🔧 第二步：环境配置

### 2.1 创建环境变量文件

```bash
cp .env.example .env.local
```

### 2.2 配置基础环境变量

编辑 `.env.local` 文件：

```env
# ========== 基础配置 ==========
APP_NAME=MultiGPT Platform
APP_URL=https://yourdomain.com
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NODE_ENV=production
```

---

## 🗄️ 第三步：数据库设置 (Supabase)

### 3.1 创建 Supabase 项目

1. 访问 [Supabase Dashboard](https://supabase.com/dashboard)
2. 点击 "New Project"
3. 填写项目信息并创建

### 3.2 获取连接信息

在项目设置中找到：

- **Project URL**
- **anon/public key**

### 3.3 配置数据库连接

在 `.env.local` 中添加：

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3.4 初始化数据库结构

1. 在 Supabase Dashboard 中进入 "SQL Editor"
2. 复制 `supabase/migrations/20241201000000_initial_schema.sql` 的内容
3. 执行 SQL 创建表结构

### 3.5 验证数据库连接

```bash
npm run db:test
```

---

## 💳 第四步：支付系统配置

### 4.1 Stripe 配置

#### 4.1.1 创建 Stripe 账户

1. 访问 [Stripe Dashboard](https://dashboard.stripe.com/)
2. 注册/登录账户

#### 4.1.2 获取 API 密钥

在 "Developers" → "API keys" 中找到：

- **Publishable key** (pk*live*...)
- **Secret key** (sk*live*...)

#### 4.1.3 配置 Webhook

1. 在 Stripe Dashboard 中进入 "Developers" → "Webhooks"
2. 点击 "Add endpoint"
3. 设置 URL: `https://yourdomain.com/api/payment/webhook/stripe`
4. 选择事件：
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. 保存后获取 **Webhook Secret**

#### 4.1.4 创建价格计划

在 "Products" 中创建订阅价格：

- Pro Monthly: $9.99/month
- Pro Annual: $99/year
- Team Monthly: $29.99/month
- Team Annual: $299/year

#### 4.1.5 配置环境变量

```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key
STRIPE_SECRET_KEY=sk_live_your_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

STRIPE_PRO_MONTHLY_PRICE_ID=price_your_pro_monthly_id
STRIPE_PRO_ANNUAL_PRICE_ID=price_your_pro_annual_id
STRIPE_TEAM_MONTHLY_PRICE_ID=price_your_team_monthly_id
STRIPE_TEAM_ANNUAL_PRICE_ID=price_your_team_annual_id
```

### 4.2 PayPal 配置

#### 4.2.1 创建 PayPal 开发者账户

1. 访问 [PayPal Developer](https://developer.paypal.com/)
2. 创建/登录账户

#### 4.2.2 创建应用

1. 在 "My Apps & Credentials" 中创建应用
2. 选择 "Merchant" 类型
3. 获取：
   - **Client ID**
   - **Secret**

#### 4.2.3 配置 Webhook

1. 在 PayPal Developer Dashboard 中进入 "Webhooks"
2. 创建 webhook:
   - URL: `https://yourdomain.com/api/payment/webhook/paypal`
   - 事件类型：
     - `PAYMENT.CAPTURE.COMPLETED`
     - `CHECKOUT.ORDER.APPROVED`
     - `BILLING.SUBSCRIPTION.ACTIVATED`
     - `BILLING.SUBSCRIPTION.CANCELLED`
     - `BILLING.SUBSCRIPTION.SUSPENDED`
3. 获取 **Webhook ID**

#### 4.2.4 创建订阅计划

在 PayPal 中创建订阅计划（或使用现有的）

#### 4.2.5 配置环境变量

```env
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_WEBHOOK_ID=your_paypal_webhook_id
PAYPAL_MODE=live

PAYPAL_PRO_MONTHLY_PLAN_ID=your_paypal_pro_monthly_plan_id
PAYPAL_PRO_ANNUAL_PLAN_ID=your_paypal_pro_annual_plan_id
PAYPAL_TEAM_MONTHLY_PLAN_ID=your_paypal_team_monthly_plan_id
PAYPAL_TEAM_ANNUAL_PLAN_ID=your_paypal_team_annual_plan_id
```

---

## 🤖 第五步：AI 服务配置

### 5.1 OpenAI 配置

```env
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_ORG_ID=your-org-id  # 可选
```

### 5.2 Anthropic 配置

```env
ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key
```

### 5.3 DeepSeek 配置（可选，用于国内用户）

```env
DEEPSEEK_API_KEY=your-deepseek-api-key
```

---

## 🌐 第六步：Vercel 部署

### 6.1 连接 Vercel

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录 Vercel
vercel login
```

### 6.2 部署项目

```bash
# 链接项目
vercel link

# 添加环境变量（或在 Vercel Dashboard 中设置）
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
# ... 添加所有环境变量

# 部署到生产环境
vercel --prod
```

### 6.3 配置域名（可选）

在 Vercel Dashboard 中：

1. 进入项目设置
2. 添加你的域名
3. 配置 DNS 解析

---

## ✅ 第七步：部署验证

### 7.1 基础功能测试

```bash
# 测试数据库连接
npm run db:test

# 测试地理路由
npm run geo:test
```

### 7.2 支付功能测试

#### 7.2.1 Stripe 测试

1. 访问你的网站
2. 尝试订阅 Pro 计划
3. 使用 Stripe 测试卡：
   - 卡号: `4242 4242 4242 4242`
   - 过期日期: 任意未来日期
   - CVC: 任意 3 位数字
   - 姓名: 任意

#### 7.2.2 PayPal 测试

1. 使用 PayPal 沙箱账户
2. 完成支付流程
3. 检查 webhook 日志

### 7.3 AI 功能测试

1. 登录账户
2. 尝试使用不同的 AI 模型
3. 验证响应正常

---

## 🔍 第八步：监控和维护

### 8.1 日志监控

- Vercel Dashboard 中的函数日志
- Supabase 中的数据库日志
- Stripe/PayPal 的 webhook 交付日志

### 8.2 性能监控

- Vercel Analytics
- 响应时间监控
- 错误率监控

### 8.3 备份策略

```bash
# 运行数据库备份
npm run db:backup
```

### 8.4 定期维护

- 每周检查 webhook 交付状态
- 每月更新依赖包
- 定期清理测试数据

---

## 🚨 故障排除

### 常见问题

#### 支付失败

1. 检查 Stripe/PayPal API 密钥是否正确
2. 验证 webhook URL 是否可访问
3. 检查防火墙设置

#### 数据库连接失败

1. 验证 Supabase URL 和密钥
2. 检查网络连接
3. 确认数据库表结构正确

#### AI 服务不可用

1. 检查 API 密钥是否有效
2. 验证账户余额
3. 确认服务状态

### 调试命令

```bash
# 测试支付 webhook
npm run test:webhook

# 检查环境变量
npm run env:check

# 验证构建
npm run build
```

---

## 📞 支持

如果遇到问题，请：

1. 检查 [GitHub Issues](https://github.com/your-repo/issues)
2. 查看项目文档
3. 联系开发团队

---

## 🎉 部署完成！

恭喜！你已经成功将 MultiGPT Platform 部署到生产环境。

### 下一步

- 配置监控告警
- 设置自动备份
- 优化性能
- 添加更多功能

**享受你的 AI 协作平台！🚀**</content>
<parameter name="filePath">c:\Users\8086K\Downloads\mvp_24-main\DEPLOYMENT_GUIDE.md
