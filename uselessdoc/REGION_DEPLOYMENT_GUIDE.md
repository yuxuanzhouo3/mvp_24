# 🌍 区域化部署指南

本指南说明如何通过 `DEPLOY_REGION` 环境变量实现国内外双版本部署。

---

## 📊 方案概述

### 核心理念

**一套代码 + 环境变量控制 + 两地部署**

```
┌─────────────────────────────────────────┐
│         同一套代码仓库                     │
├─────────────────────────────────────────┤
│                                         │
│  读取 DEPLOY_REGION 环境变量              │
│         ↓                    ↓          │
│    DEPLOY_REGION=CN    DEPLOY_REGION=INTL│
│         ↓                    ↓          │
│   使用中国服务         使用国际服务        │
│   - CloudBase         - Supabase       │
│   - 支付宝             - PayPal         │
│   - 微信登录           - OAuth          │
│   - DeepSeek          - Vercel AI      │
│         ↓                    ↓          │
│   部署到腾讯云         部署到 Vercel      │
│   multigpt.cn       multigpt.com       │
└─────────────────────────────────────────┘
```

### 两层机制

**1. IP 检测 = 重定向（门卫）**

- 作用：检测用户 IP，重定向到对应域名
- 位置：`middleware.ts`
- 逻辑：
  - 中国 IP → 重定向到 `multigpt.cn`
  - 国外 IP → 重定向到 `multigpt.com`

**2. 环境变量 = 系统切换（大脑）**

- 作用：决定使用哪套服务
- 位置：部署时设置在服务器环境变量
- 逻辑：
  - `DEPLOY_REGION=CN` → 使用 CloudBase + 支付宝 + 微信 + DeepSeek
  - `DEPLOY_REGION=INTL` → 使用 Supabase + PayPal + OAuth + Vercel AI

---

## 🚀 部署步骤

### 阶段一：国际版部署（Vercel）

#### 1. 配置 Vercel 环境变量

登录 [Vercel Dashboard](https://vercel.com/dashboard) → 选择项目 → Settings → Environment Variables

添加以下环境变量：

```bash
# ========== 🌍 区域配置 ==========
DEPLOY_REGION=INTL

# ========== 重定向 URL ==========
DOMESTIC_SYSTEM_URL=https://multigpt.cn
INTERNATIONAL_SYSTEM_URL=https://multigpt.com

# ========== Supabase 配置 ==========
NEXT_PUBLIC_SUPABASE_URL=你的Supabase项目URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的Supabase匿名密钥
SUPABASE_SERVICE_ROLE_KEY=你的Supabase服务密钥

# ========== PayPal 配置 ==========
PAYPAL_CLIENT_ID=你的PayPal客户端ID
PAYPAL_CLIENT_SECRET=你的PayPal密钥
PAYPAL_ENVIRONMENT=production  # 生产环境用 production
PAYPAL_WEBHOOK_ID=你的Webhook ID

# ========== Vercel AI Gateway ==========
AI_GATEWAY_API_KEY=你的Vercel AI Gateway密钥

# ========== 其他配置 ==========
APP_URL=https://multigpt.com
NEXT_PUBLIC_APP_URL=https://multigpt.com
NODE_ENV=production
```

#### 2. 部署到 Vercel

```bash
# 方式一：通过 Vercel CLI
npm install -g vercel
vercel --prod

# 方式二：通过 GitHub 集成
# 推送代码到 GitHub，Vercel 会自动部署
git push origin main
```

#### 3. 配置域名

在 Vercel Dashboard → Domains 添加自定义域名：

- `multigpt.com`
- `www.multigpt.com`

---

### 阶段二：国内版部署（腾讯云 CloudBase）

#### 1. 开通腾讯云服务

**a. 开通 CloudBase**

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com/)
2. 进入云开发 CloudBase
3. 创建新环境（记录环境 ID）

**b. 开通数据库**

1. 在 CloudBase 环境中开通数据库
2. 创建所需的集合（对应 Supabase 的表）

**c. 配置微信登录**

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. 获取 AppID 和 AppSecret
3. 在 CloudBase 中配置微信登录

**d. 配置支付宝**

- 使用你现有的支付宝配置（已在 .env.local 中配置好）

#### 2. 创建 CloudBase 部署配置

在项目根目录创建 `cloudbaserc.json`:

```json
{
  "version": "2.0",
  "envId": "你的CloudBase环境ID",
  "framework": {
    "name": "next-app",
    "plugins": {
      "node": {
        "use": "@cloudbase/framework-plugin-node",
        "inputs": {
          "entry": "npm run start",
          "path": "/",
          "name": "multigpt-cn",
          "buildCommand": "npm run build",
          "runtime": "Nodejs16"
        }
      }
    }
  }
}
```

#### 3. 配置 CloudBase 环境变量

在腾讯云控制台 → CloudBase → 你的环境 → 环境变量，添加：

```bash
# ========== 🌍 区域配置 ==========
DEPLOY_REGION=CN

# ========== 重定向 URL ==========
DOMESTIC_SYSTEM_URL=https://multigpt.cn
INTERNATIONAL_SYSTEM_URL=https://multigpt.com

# ========== CloudBase 配置 ==========
NEXT_PUBLIC_WECHAT_CLOUDBASE_ID=你的CloudBase环境ID
WECHAT_APP_SECRET=你的微信AppSecret

# ========== 支付宝配置 ==========
ALIPAY_APP_ID=9021000157643313  # 你已有的配置
ALIPAY_GATEWAY_URL=你的支付宝网关URL
ALIPAY_SANDBOX=false  # 生产环境设为 false
ALIPAY_PRIVATE_KEY=你的支付宝私钥
ALIPAY_PUBLIC_KEY=你的支付宝公钥
ALIPAY_ALIPAY_PUBLIC_KEY=支付宝公钥

# ========== DeepSeek AI ==========
DEEPSEEK_API_KEY=sk-b75e8a577cb7489b870a551dde712967  # 你已有的配置
DEEPSEEK_BASE_URL=https://api.deepseek.com

# ========== 其他配置 ==========
APP_URL=https://multigpt.cn
NEXT_PUBLIC_APP_URL=https://multigpt.cn
NODE_ENV=production
```

#### 4. 部署到腾讯云

```bash
# 安装 CloudBase CLI
npm install -g @cloudbase/cli

# 登录
tcb login

# 部署
tcb framework deploy --env 你的环境ID
```

#### 5. 配置域名和 ICP 备案

**a. 域名解析**

- 在你的域名服务商处添加 CNAME 记录
- 指向 CloudBase 提供的域名

**b. ICP 备案（必须）**

1. 在腾讯云控制台申请 ICP 备案
2. 准备资料：营业执照、身份证、域名证书
3. 等待审核（约 1-2 周）
4. 备案通过后才能使用自定义域名

---

## 📝 本地开发测试

### 测试国际版

```bash
# .env.local
DEPLOY_REGION=INTL

# 启动开发服务器
npm run dev

# 访问 http://localhost:3000
# 系统会使用 Supabase + PayPal + Vercel AI
```

### 测试国内版

```bash
# .env.local
DEPLOY_REGION=CN

# 启动开发服务器
npm run dev

# 访问 http://localhost:3000
# 系统会使用 CloudBase + 支付宝 + DeepSeek
```

---

## 🔍 验证部署

### 验证国际版（multigpt.com）

```bash
# 1. 检查环境变量
curl https://multigpt.com/api/health
# 应返回：{ "region": "INTL", "services": { "auth": "supabase", "payment": "paypal", "ai": "vercel-ai-gateway" }}

# 2. 测试 IP 重定向
# 从中国 IP 访问 multigpt.com
# 应自动重定向到 multigpt.cn
```

### 验证国内版（multigpt.cn）

```bash
# 1. 检查环境变量
curl https://multigpt.cn/api/health
# 应返回：{ "region": "CN", "services": { "auth": "cloudbase", "payment": "alipay", "ai": "deepseek" }}

# 2. 测试 IP 重定向
# 从国外 IP 访问 multigpt.cn
# 应自动重定向到 multigpt.com
```

---

## 🐛 常见问题

### Q1: 部署后环境变量不生效？

**A:** 检查环境变量是否在正确的环境中设置：

- Vercel: Dashboard → Settings → Environment Variables
- CloudBase: 控制台 → 环境 → 环境变量

### Q2: IP 重定向不工作？

**A:** 检查以下几点：

1. `DOMESTIC_SYSTEM_URL` 和 `INTERNATIONAL_SYSTEM_URL` 是否配置
2. 域名是否正确解析
3. 查看 `middleware.ts` 中的日志输出

### Q3: 国内版微信登录失败？

**A:** 检查：

1. CloudBase 环境 ID 是否正确
2. 微信 AppID 和 AppSecret 是否配置
3. 微信公众平台后台是否配置了回调域名

### Q4: 支付宝沙盒环境切换到生产环境？

**A:** 修改环境变量：

```bash
# 沙盒环境
ALIPAY_SANDBOX=true
ALIPAY_GATEWAY_URL=https://openapi-sandbox.dl.alipaydev.com/gateway.do

# 生产环境
ALIPAY_SANDBOX=false
ALIPAY_GATEWAY_URL=https://openapi.alipay.com/gateway.do
```

### Q5: 如何同时在两个环境测试？

**A:** 使用浏览器隐身模式 + VPN：

- 普通窗口：访问国内版（multigpt.cn）
- 隐身窗口 + VPN：访问国际版（multigpt.com）

---

## 📊 服务对比

| 功能模块     | 国际版（INTL）                              | 国内版（CN）     |
| ------------ | ------------------------------------------- | ---------------- |
| **部署平台** | Vercel                                      | 腾讯云 CloudBase |
| **域名**     | multigpt.com                                | multigpt.cn      |
| **认证**     | Supabase Auth                               | CloudBase Auth   |
| **登录方式** | 邮箱 + Google + GitHub                      | 微信扫码         |
| **数据库**   | Supabase PostgreSQL                         | CloudBase NoSQL  |
| **支付**     | PayPal                                      | 支付宝           |
| **AI**       | Vercel AI Gateway<br>(OpenAI/Claude/Gemini) | DeepSeek         |
| **货币**     | USD ($)                                     | CNY (¥)          |
| **ICP 备案** | 不需要                                      | 必须             |

---

## ✅ 部署检查清单

### 国际版（Vercel）

- [ ] Vercel 项目已创建
- [ ] 环境变量 `DEPLOY_REGION=INTL` 已设置
- [ ] Supabase 项目已配置
- [ ] PayPal 商户账号已配置
- [ ] Vercel AI Gateway 密钥已配置
- [ ] 域名 `multigpt.com` 已绑定
- [ ] DNS 解析已生效
- [ ] HTTPS 证书已自动配置

### 国内版（腾讯云）

- [ ] CloudBase 环境已创建
- [ ] 环境变量 `DEPLOY_REGION=CN` 已设置
- [ ] CloudBase 数据库已开通
- [ ] 微信公众平台已配置
- [ ] 支付宝商户已配置（沙盒/生产）
- [ ] DeepSeek API 密钥已配置
- [ ] 域名 `multigpt.cn` 已绑定
- [ ] ICP 备案已完成
- [ ] DNS 解析已生效

---

## 🎯 下一步

部署完成后：

1. **测试双向重定向**

   - 从中国访问 .com → 应跳转到 .cn
   - 从国外访问 .cn → 应跳转到 .com

2. **测试完整流程**

   - 国际版：注册 → 登录 → 支付 → AI 对话
   - 国内版：微信登录 → 支付宝支付 → DeepSeek 对话

3. **监控和日志**

   - Vercel: Dashboard → Logs
   - CloudBase: 控制台 → 云函数 → 日志

4. **性能优化**
   - 配置 CDN
   - 启用缓存
   - 优化图片加载

---

## 📞 获取帮助

遇到问题？查看：

- [Vercel 文档](https://vercel.com/docs)
- [腾讯云 CloudBase 文档](https://cloud.tencent.com/document/product/876)
- [支付宝开放平台](https://open.alipay.com/docs)
- [微信开放平台](https://developers.weixin.qq.com/doc/)

---

**部署完成后，你将拥有两个独立运行的系统，服务于全球不同地区的用户！** 🎉
