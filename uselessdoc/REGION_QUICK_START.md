# 🚀 环境变量区域切换方案 - 快速开始

## 📋 方案总结

**核心思路：一套代码 + 一个环境变量 + 两地部署**

```
相同代码 → 读取 DEPLOY_REGION → 选择服务 → 部署到对应云平台
                                  ↓
                    CN: CloudBase + 支付宝 + 微信 + DeepSeek → 腾讯云
                    INTL: Supabase + PayPal + OAuth + Vercel AI → Vercel
```

---

## ✅ 已完成的工作

### 1. **环境变量配置** ✅

- 已在 `.env.local` 添加 `DEPLOY_REGION=CN`
- 已配置国内外系统重定向 URL

### 2. **核心配置文件** ✅

- `lib/config/region.ts` - 区域判断和服务选择逻辑
- 自动根据 `DEPLOY_REGION` 切换服务提供商

### 3. **IP 检测中间件** ✅

- 更新 `middleware.ts` 支持基于 IP 的重定向
- 中国 IP → 重定向到 multigpt.cn
- 国外 IP → 重定向到 multigpt.com

### 4. **服务适配器** ✅

所有模块都已实现适配器模式：

| 模块   | 文件路径                  | 中国版               | 国际版              |
| ------ | ------------------------- | -------------------- | ------------------- |
| 认证   | `lib/auth/adapter.ts`     | CloudBase + 微信登录 | Supabase + OAuth    |
| 支付   | `lib/payment/adapter.ts`  | 支付宝               | PayPal              |
| 数据库 | `lib/database/adapter.ts` | CloudBase NoSQL      | Supabase PostgreSQL |
| AI     | `lib/ai/adapter.ts`       | DeepSeek             | Vercel AI Gateway   |

### 5. **文档** ✅

- `REGION_DEPLOYMENT_GUIDE.md` - 详细部署指南
- `lib/examples/adapter-usage.ts` - 代码使用示例

---

## 🎯 如何使用

### 本地开发

**测试国内版：**

```bash
# .env.local
DEPLOY_REGION=CN

npm run dev
# 访问 http://localhost:3000
# 使用：CloudBase + 支付宝 + DeepSeek
```

**测试国际版：**

```bash
# .env.local
DEPLOY_REGION=INTL

npm run dev
# 访问 http://localhost:3000
# 使用：Supabase + PayPal + Vercel AI
```

### 在代码中使用

**1. 认证模块**

```typescript
import { getAuth } from "@/lib/auth/adapter";

const auth = getAuth(); // 自动选择 CloudBase 或 Supabase

// 国际版：邮箱登录
if (auth.signInWithEmail) {
  await auth.signInWithEmail("user@example.com", "password");
}

// 国内版：微信登录
if (auth.signInWithWechat) {
  await auth.signInWithWechat(wechatCode);
}
```

**2. 支付模块**

```typescript
import { getPayment, formatAmount } from "@/lib/payment/adapter";

const payment = getPayment(); // 自动选择支付宝或 PayPal

const order = await payment.createOrder(9.99, userId);
console.log("金额:", formatAmount(9.99)); // ¥9.99 或 $9.99
```

**3. 数据库模块**

```typescript
import { getDatabase } from "@/lib/database/adapter";

const db = getDatabase(); // 自动选择 CloudBase 或 Supabase

const users = await db.query("users", { email: "user@example.com" });
```

**4. AI 模块**

```typescript
import { getAI, getDefaultAIModel } from "@/lib/ai/adapter";

const ai = getAI(); // 自动选择 DeepSeek 或 Vercel AI
const model = getDefaultAIModel(); // deepseek-chat 或 gpt-4o-mini

const response = await ai.chat(messages, model);
```

---

## 🚀 部署步骤

### 国际版部署（Vercel）

1. **配置环境变量**

```bash
DEPLOY_REGION=INTL
DOMESTIC_SYSTEM_URL=https://multigpt.cn
INTERNATIONAL_SYSTEM_URL=https://multigpt.com
# ... 其他 Supabase、PayPal 配置
```

2. **部署**

```bash
vercel --prod
```

### 国内版部署（腾讯云）

1. **配置环境变量**

```bash
DEPLOY_REGION=CN
DOMESTIC_SYSTEM_URL=https://multigpt.cn
INTERNATIONAL_SYSTEM_URL=https://multigpt.com
# ... 其他 CloudBase、支付宝配置
```

2. **部署**

```bash
tcb framework deploy
```

详细步骤请查看 [`REGION_DEPLOYMENT_GUIDE.md`](./REGION_DEPLOYMENT_GUIDE.md)

---

## 📊 系统对比

| 特性         | 国内版（CN）       | 国际版（INTL）         |
| ------------ | ------------------ | ---------------------- |
| **环境变量** | `DEPLOY_REGION=CN` | `DEPLOY_REGION=INTL`   |
| **部署平台** | 腾讯云 CloudBase   | Vercel                 |
| **域名**     | multigpt.cn        | multigpt.com           |
| **认证**     | 微信登录           | 邮箱 + Google + GitHub |
| **数据库**   | CloudBase NoSQL    | Supabase PostgreSQL    |
| **支付**     | 支付宝（¥）        | PayPal（$）            |
| **AI**       | DeepSeek           | OpenAI/Claude/Gemini   |
| **ICP 备案** | 必须               | 不需要                 |

---

## 🔍 验证部署

### 检查环境变量

```bash
# 国际版
curl https://multigpt.com/api/health
# 返回: { "region": "INTL", ... }

# 国内版
curl https://multigpt.cn/api/health
# 返回: { "region": "CN", ... }
```

### 测试 IP 重定向

1. 从中国访问 `multigpt.com` → 自动跳转到 `multigpt.cn`
2. 从国外访问 `multigpt.cn` → 自动跳转到 `multigpt.com`

---

## 📁 项目结构

```
mvp24-master/
├── .env.local                        # ✅ 已添加 DEPLOY_REGION
├── middleware.ts                     # ✅ 已更新支持 IP 重定向
├── lib/
│   ├── config/
│   │   └── region.ts                # ✅ 新建：区域配置
│   ├── auth/
│   │   └── adapter.ts               # ✅ 新建：认证适配器
│   ├── payment/
│   │   └── adapter.ts               # ✅ 新建：支付适配器
│   ├── database/
│   │   └── adapter.ts               # ✅ 新建：数据库适配器
│   ├── ai/
│   │   └── adapter.ts               # ✅ 新建：AI 适配器
│   └── examples/
│       └── adapter-usage.ts         # ✅ 新建：使用示例
└── REGION_DEPLOYMENT_GUIDE.md        # ✅ 新建：部署指南
```

---

## 🎁 方案优势

### ✅ 开发效率高

- 一套代码，不用维护两个分支
- 修改 bug 一次，两边都生效
- 统一的接口，容易理解和使用

### ✅ 部署灵活

- 通过环境变量轻松切换
- 可以同时部署两个环境
- 本地开发可以随时切换测试

### ✅ 易于维护

- 所有区域逻辑集中在 `region.ts`
- 适配器模式，扩展性好
- 代码结构清晰

### ✅ 符合法规

- 国内数据存储在腾讯云（中国境内）
- 满足网络安全法和数据主权要求

---

## 📝 下一步任务

### 立即可做：

1. ✅ 环境变量配置 - **已完成**
2. ✅ 适配器实现 - **已完成**
3. ✅ IP 重定向 - **已完成**
4. ✅ 文档编写 - **已完成**

### 需要补充：

5. ⏳ **安装依赖**

   ```bash
   npm install @cloudbase/js-sdk @cloudbase/node-sdk
   ```

6. ⏳ **腾讯云服务开通**

   - 开通 CloudBase 环境
   - 配置微信登录
   - 确认支付宝密钥

7. ⏳ **API 路由适配**

   - 创建 `/api/ai/chat` 使用 AI 适配器
   - 创建 `/api/payment/*` 使用支付适配器
   - 创建 `/api/auth/*` 使用认证适配器

8. ⏳ **前端组件更新**

   - 登录页面使用认证适配器
   - 支付页面使用支付适配器
   - 聊天页面使用 AI 适配器

9. ⏳ **测试**

   - 本地测试两个区域
   - 部署后测试 IP 重定向
   - 测试完整用户流程

10. ⏳ **ICP 备案**（国内版必须）
    - 准备备案资料
    - 提交备案申请
    - 等待审核通过

---

## 🐛 常见问题

**Q: 如何切换测试不同区域？**
A: 修改 `.env.local` 中的 `DEPLOY_REGION` 值，重启开发服务器。

**Q: 部署后环境变量不生效？**
A: 检查是否在正确的平台环境变量中设置（Vercel Dashboard 或腾讯云控制台）。

**Q: IP 重定向不工作？**
A: 确保 `DOMESTIC_SYSTEM_URL` 和 `INTERNATIONAL_SYSTEM_URL` 都已配置。

**Q: CloudBase SDK 报错？**
A: 先安装依赖：`npm install @cloudbase/js-sdk @cloudbase/node-sdk`

---

## 📞 获取帮助

- 📖 详细部署指南：[REGION_DEPLOYMENT_GUIDE.md](./REGION_DEPLOYMENT_GUIDE.md)
- 💻 代码使用示例：[lib/examples/adapter-usage.ts](./lib/examples/adapter-usage.ts)
- 🔧 区域配置文件：[lib/config/region.ts](./lib/config/region.ts)

---

## 🎉 总结

**✅ 所有核心代码已完成！**

你现在拥有一个完整的环境变量区域切换方案：

1. 通过 `DEPLOY_REGION` 控制服务选择
2. 通过 IP 检测实现自动重定向
3. 所有模块（认证/支付/数据库/AI）都支持自动切换
4. 一套代码，可以分别部署到腾讯云和 Vercel

**下一步：安装 CloudBase 依赖，开通腾讯云服务，然后就可以部署了！** 🚀
