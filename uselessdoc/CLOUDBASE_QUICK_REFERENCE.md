# CloudBase 国内版 - 快速参考

## 📁 创建的文件

```
lib/database/
├── cloudbase-schema.ts      # ⭐ 数据库架构定义（8个集合的 TypeScript 类型）
├── cloudbase-init.ts        # 集合初始化脚本（自动创建集合）
└── cloudbase-db.ts          # ⭐ 数据库操作工具类（CRUD 封装）

app/api/auth/route.ts     # CloudBase 认证 API 端点

lib/auth/
├── cloudbase-auth.ts        # CloudBase 认证函数（服务器端）
└── adapter.ts               # 认证适配器（客户端/服务器端路由）

CLOUDBASE_SETUP_GUIDE.md      # 详细的设置指南
CLOUDBASE_QUICK_REFERENCE.md  # 本文件
```

## 🚀 快速开始

### 1️⃣ 初始化数据库集合

```bash
npm run init-db
```

这会自动创建 8 个集合：

- web_users
- user_profiles
- ai_conversations
- payments
- tokens
- subscriptions
- wechat_logins
- security_logs

### 2️⃣ 在 CloudBase 控制台创建索引

访问 [CloudBase 控制台](https://console.cloud.tencent.com/tcb) 并为各集合创建索引（详见 CLOUDBASE_SETUP_GUIDE.md）

### 3️⃣ 验证集合

```bash
npm run verify-db
```

## 💻 代码使用示例

### 添加用户

```typescript
import {
  getCloudBaseDB,
  CLOUDBASE_COLLECTIONS,
} from "@/lib/database/cloudbase-db";

const db = getCloudBaseDB();

const result = await db.insert(CLOUDBASE_COLLECTIONS.WEB_USERS, {
  email: "user@example.com",
  password: "hashed_password",
  name: "User Name",
  pro: false,
  region: "china",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

if (result.success) {
  console.log("用户已添加，ID:", result.id);
}
```

### 查询用户

```typescript
// 查询单个用户
const result = await db.findOne(CLOUDBASE_COLLECTIONS.WEB_USERS, {
  email: "user@example.com",
});

if (result.success) {
  console.log("用户信息:", result.data);
}

// 查询多个用户（带分页）
const results = await db.query(
  CLOUDBASE_COLLECTIONS.WEB_USERS,
  { pro: true },
  {
    limit: 10,
    skip: 0,
    orderBy: "createdAt",
    orderDirection: "desc",
  }
);

console.log("Pro 用户列表:", results.data);
```

### 更新用户

```typescript
const result = await db.update(CLOUDBASE_COLLECTIONS.WEB_USERS, userId, {
  pro: true,
  updatedAt: new Date().toISOString(),
});

if (result.success) {
  console.log("用户已更新");
}
```

### 删除用户

```typescript
const result = await db.delete(CLOUDBASE_COLLECTIONS.WEB_USERS, userId);

if (result.success) {
  console.log("用户已删除");
}
```

### 存储 AI 对话

```typescript
const convResult = await db.insert(CLOUDBASE_COLLECTIONS.AI_CONVERSATIONS, {
  userId: userId,
  title: "我的第一次对话",
  model: "gpt-4",
  provider: "openai",
  messages: [
    {
      role: "user",
      content: "你好",
      timestamp: new Date().toISOString(),
    },
    {
      role: "assistant",
      content: "你好！很高兴认识你",
      timestamp: new Date().toISOString(),
    },
  ],
  tokens: {
    input: 10,
    output: 15,
    total: 25,
  },
  cost: 0.001,
  region: "china",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

console.log("对话已保存，ID:", convResult.id);
```

### 记录支付

```typescript
const paymentResult = await db.insert(CLOUDBASE_COLLECTIONS.PAYMENTS, {
  userId: userId,
  email: "user@example.com",
  amount: 99.99,
  currency: "CNY",
  method: "wechat",
  status: "completed",
  orderId: "ORDER_" + Date.now(),
  transactionId: "WECHAT_TXN_123",
  productType: "pro",
  productName: "Pro 年度订阅",
  quantity: 1,
  region: "china",
  createdAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
});

console.log("支付记录已保存，ID:", paymentResult.id);
```

### 记录安全日志

```typescript
await db.insert(CLOUDBASE_COLLECTIONS.SECURITY_LOGS, {
  userId: userId,
  email: "user@example.com",
  event: "login_successful",
  ipAddress: "192.168.1.1",
  userAgent: "Mozilla/5.0...",
  status: "success",
  message: "登录成功",
  region: "china",
  createdAt: new Date().toISOString(),
});
```

## 🔐 身份认证

### 用户登录

```typescript
// 前端请求
const response = await fetch("/api/auth", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "login",
    email: "user@example.com",
    password: "password123",
  }),
});

const data = await response.json();

if (data.success) {
  // 保存 token 到 localStorage 或 cookies
  localStorage.setItem("auth_token", data.token);
  console.log("登录成功！", data.user);
}
```

### 用户注册

```typescript
const response = await fetch("/api/auth", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "signup",
    email: "newuser@example.com",
    password: "password123",
  }),
});

const data = await response.json();

if (data.success) {
  console.log("注册成功！", data.user);
}
```

### 刷新 Token

```typescript
const response = await fetch("/api/auth", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "refresh",
    userId: userId,
  }),
});

const data = await response.json();

if (data.success) {
  localStorage.setItem("auth_token", data.token);
  console.log("Token 已刷新");
}
```

## 📊 数据库工具方法

| 方法                                  | 说明         | 返回值                       |
| ------------------------------------- | ------------ | ---------------------------- |
| `insert(collection, data)`            | 添加单个文档 | `{ success, id }`            |
| `insertMany(collection, dataArray)`   | 批量添加     | `{ success, results[] }`     |
| `getById(collection, docId)`          | 按 ID 获取   | `{ success, data }`          |
| `findOne(collection, where)`          | 查询单条     | `{ success, data }`          |
| `query(collection, where, options)`   | 查询多条     | `{ success, data[], count }` |
| `update(collection, docId, data)`     | 更新单条     | `{ success }`                |
| `updateMany(collection, where, data)` | 批量更新     | `{ success }`                |
| `delete(collection, docId)`           | 删除单条     | `{ success }`                |
| `deleteMany(collection, where)`       | 批量删除     | `{ success }`                |
| `count(collection, where)`            | 统计文档     | `{ success, count }`         |
| `transaction(operations)`             | 事务操作     | `{ success, results[] }`     |

## 🔗 环境变量

确保 `.env.local` 中包含：

```bash
NEXT_PUBLIC_DEPLOY_REGION=CN
NEXT_PUBLIC_WECHAT_CLOUDBASE_ID=your_env_id
CLOUDBASE_SECRET_ID=your_secret_id
CLOUDBASE_SECRET_KEY=your_secret_key
JWT_SECRET=your_jwt_secret
```

## ⚠️ 常见问题

**Q: 集合创建后怎样才能快速查询？**
A: 必须在 CloudBase 控制台创建索引。特别是 `email` 和 `orderId` 字段必须是唯一索引。

**Q: 密码应该怎样存储？**
A: 使用 `bcryptjs` 加密后存储在 `web_users.password` 字段。

**Q: 如何在服务器和客户端之间切换？**
A: 代码会自动检测 `typeof window === "undefined"` 来判断环境。

**Q: 能否在客户端直接操作 CloudBase？**
A: 不建议。应该通过服务器 API 端点（如 `/api/auth`）来操作数据库。

## 📚 相关文件

- [CLOUDBASE_SETUP_GUIDE.md](./CLOUDBASE_SETUP_GUIDE.md) - 详细设置步骤
- [lib/database/cloudbase-schema.ts](./lib/database/cloudbase-schema.ts) - 数据模型定义
- [lib/database/cloudbase-db.ts](./lib/database/cloudbase-db.ts) - 数据库工具类
- [lib/auth/cloudbase-auth.ts](./lib/auth/cloudbase-auth.ts) - 认证函数
- [app/api/auth/route.ts](./app/api/auth/route.ts) - 认证 API 端点

## 🎯 下一步

1. ✅ 运行 `npm run init-db` 创建集合
2. ✅ 在 CloudBase 控制台创建索引
3. ✅ 开始使用 API 端点进行登录和注册
4. ✅ 存储用户数据、对话和支付信息

所有的数据库操作都已完全集成在应用中，可以开箱即用！
