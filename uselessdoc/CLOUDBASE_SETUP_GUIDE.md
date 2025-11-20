# CloudBase 国内版数据库设置指南

本指南帮助你完成腾讯云 CloudBase 数据库的集合创建和初始化。

## 目录结构

国内版数据库相关的文件已创建在以下位置：

```
lib/database/
├── cloudbase-schema.ts      # 数据库架构定义（8个集合）
└── cloudbase-init.ts        # 初始化脚本
```

## 数据库架构概览

国内版（中国）使用以下 8 个集合来存储数据：

### 1. **web_users** - 用户账户表

- 存储用户登录凭证和基本信息
- 字段：email, password, name, avatar, phone, pro, region, createdAt, updatedAt
- **关键索引**：email (唯一索引)

### 2. **user_profiles** - 用户详细信息表

- 扩展用户信息和登录统计
- 字段：userId, email, fullName, avatar, bio, lastLoginAt, loginCount, preferences
- **关键索引**：userId (唯一索引)

### 3. **ai_conversations** - AI 对话记录

- 存储用户与 AI 的对话历史
- 字段：userId, title, model, provider, messages, tokens, cost
- **关键索引**：userId + createdAt (复合索引)

### 4. **payments** - 支付记录

- 微信支付和支付宝支付记录
- 字段：userId, email, amount, method, status, orderId, transactionId
- **关键索引**：orderId (唯一索引)

### 5. **tokens** - Token 使用统计

- 记录每次 AI 调用的 token 消耗
- 字段：userId, conversationId, model, inputTokens, outputTokens, totalTokens, cost
- **关键索引**：userId + createdAt (复合索引)

### 6. **subscriptions** - 订阅信息

- 用户订阅计划和续费信息
- 字段：userId, plan, status, startDate, endDate, renewalDate, monthlyTokens
- **关键索引**：userId, status, endDate

### 7. **wechat_logins** - 微信登录记录

- 微信登录授权和绑定信息
- 字段：userId, openId, nickname, avatar, unionId, status, lastLoginAt
- **关键索引**：openId (唯一索引)

### 8. **security_logs** - 安全日志

- 登录失败、账户锁定等安全事件记录
- 字段：userId, email, event, ipAddress, userAgent, status, createdAt
- **关键索引**：userId + createdAt, email + createdAt, event

---

## 设置步骤

### 步骤 1: 运行初始化脚本

在项目根目录运行以下命令：

```bash
npm run init-db
```

或者直接用 Node.js 运行：

```bash
node -r dotenv/config lib/database/cloudbase-init.ts
```

此脚本会：

1. 自动创建所有 8 个集合
2. 移除临时测试文档
3. 输出初始化状态日志

**输出示例：**

```
开始初始化 CloudBase 集合...

📝 创建 web_users 集合...
  ✅ web_users 集合创建成功
  ✅ 临时文档已删除
📝 创建 user_profiles 集合...
  ✅ user_profiles 集合创建成功
  ✅ 临时文档已删除
...
✅ 所有集合初始化完成！
```

### 步骤 2: 在 CloudBase 控制台创建索引

集合创建后，需要在 CloudBase 控制台手动创建索引以优化查询性能。

#### 访问 CloudBase 控制台：

1. 打开 [腾讯云 CloudBase 控制台](https://console.cloud.tencent.com/tcb)
2. 选择你的环境：`multigpt-6g9pqxiz52974a7c`
3. 左侧菜单 → 数据库 → 集合管理

#### 为每个集合创建索引：

**web_users 集合：**

- 创建唯一索引：`email` (升序)
- 创建普通索引：`createdAt` (降序)

**user_profiles 集合：**

- 创建唯一索引：`userId` (升序)
- 创建普通索引：`email` (升序)
- 创建普通索引：`createdAt` (降序)

**ai_conversations 集合：**

- 创建复合索引：`userId` (升序) + `createdAt` (降序)
- 创建普通索引：`model` (升序)

**payments 集合：**

- 创建唯一索引：`orderId` (升序)
- 创建复合索引：`userId` (升序) + `createdAt` (降序)
- 创建普通索引：`status` (升序)

**tokens 集合：**

- 创建复合索引：`userId` (升序) + `createdAt` (降序)
- 创建普通索引：`model` (升序)

**subscriptions 集合：**

- 创建普通索引：`userId` (升序)
- 创建普通索引：`status` (升序)
- 创建普通索引：`endDate` (升序)

**wechat_logins 集合：**

- 创建唯一索引：`openId` (升序)
- 创建普通索引：`userId` (升序)

**security_logs 集合：**

- 创建复合索引：`userId` (升序) + `createdAt` (降序)
- 创建复合索引：`email` (升序) + `createdAt` (降序)
- 创建普通索引：`event` (升序)

### 步骤 3: 验证集合

运行验证脚本确保所有集合都已正确创建：

```bash
npm run verify-db
```

**预期输出：**

```
正在验证集合...

✅ web_users - 存在
✅ user_profiles - 存在
✅ ai_conversations - 存在
✅ payments - 存在
✅ tokens - 存在
✅ subscriptions - 存在
✅ wechat_logins - 存在
✅ security_logs - 存在
```

---

## package.json 脚本配置

在 `package.json` 中添加以下脚本（如果还未添加）：

```json
{
  "scripts": {
    "init-db": "node -r dotenv/config lib/database/cloudbase-init.ts",
    "verify-db": "node -r dotenv/config lib/database/cloudbase-init.ts verify"
  }
}
```

---

## 使用示例

### 添加新用户

```typescript
import cloudbase from "@cloudbase/node-sdk";

const app = cloudbase.init({
  env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
  secretId: process.env.CLOUDBASE_SECRET_ID,
  secretKey: process.env.CLOUDBASE_SECRET_KEY,
});

const db = app.database();
const usersCollection = db.collection("web_users");

// 添加新用户
const result = await usersCollection.add({
  email: "user@example.com",
  password: "hashed_password_here",
  name: "User Name",
  pro: false,
  region: "china",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

console.log("新用户 ID:", result.id);
```

### 查询用户

```typescript
const userResult = await usersCollection
  .where({ email: "user@example.com" })
  .get();

if (userResult.data && userResult.data.length > 0) {
  const user = userResult.data[0];
  console.log("用户信息:", user);
}
```

### 更新用户

```typescript
const updateResult = await usersCollection.doc(userId).update({
  pro: true,
  updatedAt: new Date().toISOString(),
});

console.log("更新成功:", updateResult.id);
```

### 删除用户

```typescript
await usersCollection.doc(userId).remove();
console.log("用户已删除");
```

---

## 安全注意事项

1. **密码加密**

   - 使用 `bcryptjs` 加密所有密码
   - 永远不要以明文存储密码

2. **数据权限**

   - 在 CloudBase 控制台配置集合的读写权限
   - 建议使用安全规则限制数据访问

3. **敏感数据**

   - 不要在客户端代码中暴露 `CLOUDBASE_SECRET_ID` 和 `CLOUDBASE_SECRET_KEY`
   - 这些凭证只应在服务器端使用

4. **备份**
   - 定期备份 CloudBase 数据库
   - 在 CloudBase 控制台启用自动备份

---

## 故障排查

### 集合无法创建

**问题**：初始化脚本报错 "Cannot create collection"

**解决方案**：

1. 检查环境变量是否正确配置
2. 确保 `CLOUDBASE_SECRET_ID` 和 `CLOUDBASE_SECRET_KEY` 有效
3. 检查 CloudBase 账户是否有权限创建集合

### 查询速度慢

**问题**：web_users 查询很慢

**解决方案**：

1. 确保在 `email` 字段上创建了唯一索引
2. 优化复合查询条件
3. 使用分页限制返回数据量

### 索引冲突

**问题**：添加唯一索引失败

**解决方案**：

1. 检查集合中是否已有重复的字段值
2. 清空集合后重试创建索引
3. 使用非唯一索引作为替代

---

## 参考资源

- [CloudBase 官方文档](https://cloudbase.net/)
- [CloudBase 数据库操作指南](https://cloudbase.net/docs/database)
- [Node.js SDK 文档](https://cloudbase.net/docs/sdk/node)

---

## 下一步

集合创建完成后，你可以：

1. ✅ 开始使用 `/api/auth` 端点进行用户注册和登录
2. ✅ 在 `ai_conversations` 中存储用户的 AI 对话
3. ✅ 在 `payments` 中记录微信和支付宝的支付信息
4. ✅ 在 `security_logs` 中记录安全相关事件

所有的数据库操作都已在相应的 TypeScript 类型定义中完整定义，可以开箱即用！
