# Plan B 快速参考指南

快速查阅方案 B 的关键信息。

---

## 📋 核心概念

### Token 生命周期

```
用户登录
  ↓
accessToken (1h) + refreshToken (7d) + CloudBase 记录
  ↓
使用 accessToken 调用 API
  ↓
[1h 后] accessToken 过期
  ↓
使用 refreshToken 刷新 → 新 accessToken + 新 refreshToken
  ↓
[继续使用] 或 [登出]
  ↓
登出 → 撤销所有 refreshTokens → 所有旧 tokens 失效
```

### 关键术语

| 术语             | 含义                                              |
| ---------------- | ------------------------------------------------- |
| **accessToken**  | 短期 token (1h), JWT 格式, 用于 API 认证          |
| **refreshToken** | 长期 token (7d), JWT 格式, 用于获取新 accessToken |
| **tokenId**      | 唯一标识, UUID v4, 存储在 CloudBase               |
| **token 轮转**   | 每次刷新生成新的 refreshToken                     |
| **token 撤销**   | 标记 token 为已使用，登出时撤销所有               |
| **设备追踪**     | 记录每个 token 的 IP/User-Agent 信息              |

---

## 🔑 关键文件

### 核心逻辑

```
lib/refresh-token-manager.ts       (token 生命周期)
  ├── createRefreshToken()         生成 refresh token
  ├── verifyRefreshToken()         验证 refresh token
  ├── revokeRefreshToken()         撤销单个 token
  ├── revokeAllUserTokens()        登出时撤销所有
  ├── cleanupExpiredTokens()       清理过期记录
  ├── getUserActiveTokens()        查询活跃 tokens
  └── detectAnomalousLogin()       异常登录检测
```

### API 端点

```
app/api/auth/

/api/auth/login           POST   登录 → accessToken + refreshToken
/api/auth/logout          POST   登出 → 撤销所有 tokens
/api/auth/refresh         POST   刷新 → 新 tokens

/api/auth                 POST   兼容端点 (login/signup)
/api/profile              GET    需要 accessToken
```

### 数据库

```
CloudBase:

  refresh_tokens collection:
    - tokenId (索引, 唯一)
    - userId
    - email
    - isRevoked (重要)
    - createdAt, expiresAt
    - ipAddress, userAgent, deviceInfo
    - lastUsedAt, usageCount
```

---

## 💻 API 使用示例

### 1. 登录

```bash
POST /api/auth
Content-Type: application/json

{
  "action": "login",
  "email": "user@example.com",
  "password": "password123"
}
```

**响应**:

```json
{
  "success": true,
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "tokenMeta": {
    "accessTokenExpiresIn": 3600,
    "refreshTokenExpiresIn": 604800
  }
}
```

### 2. 调用 API

```bash
GET /api/profile
Authorization: Bearer {accessToken}
```

### 3. 刷新 Token

```bash
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "{refreshToken}"
}
```

**响应** (新 tokens):

```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

### 4. 登出

```bash
POST /api/auth/logout
Authorization: Bearer {accessToken}
```

**响应**:

```json
{
  "success": true,
  "tokensRevoked": 3
}
```

---

## 🔐 验证流程

### 验证 accessToken

```typescript
verifyAuthToken(token)
  ├── jwt.verify()           ✓ 检查签名
  ├── 检查过期时间           ✓
  ├── 查询 web_users         ✓
  └── 返回用户信息           ✓
```

### 验证 refreshToken

```typescript
verifyRefreshToken(token)
  ├── jwt.verify()                    ✓ 检查签名
  ├── CloudBase 查询 tokenId
  ├── 检查 isRevoked = false          ✓
  ├── 检查 expiresAt > now            ✓
  ├── 更新 lastUsedAt + usageCount
  └── 返回用户信息                    ✓
```

---

## 🛠️ 常见任务

### 任务 1: 检查用户是否登录

```typescript
// 获取 accessToken
const token = localStorage.getItem("accessToken");

if (!token) {
  // 未登录
  redirect("/login");
}

// 调用 API
const response = await fetch("/api/profile", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

if (response.status === 401) {
  // Token 过期，需要刷新
  await refreshToken();
}
```

### 任务 2: 刷新 Token

```typescript
async function refreshToken() {
  const refreshToken = localStorage.getItem("refreshToken");

  const response = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (response.ok) {
    const data = await response.json();
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
  } else {
    // 刷新失败，需要重新登录
    redirect("/login");
  }
}
```

### 任务 3: 登出

```typescript
async function logout() {
  const accessToken = localStorage.getItem("accessToken");

  await fetch("/api/auth/logout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  redirect("/login");
}
```

### 任务 4: 处理 401 错误

```typescript
async function apiCall(url, options = {}) {
  let response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
    },
  });

  if (response.status === 401) {
    // Token 过期，尝试刷新
    await refreshToken();

    // 重试请求
    response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
      },
    });
  }

  return response;
}
```

---

## 📊 CloudBase 查询示例

### 查询用户的所有活跃 Tokens

```javascript
const db = cloudbase.database();

const result = await db
  .collection("refresh_tokens")
  .where({
    userId: "user_id_xxx",
    isRevoked: false,
  })
  .get();

console.log(`用户有 ${result.data.length} 个活跃 tokens`);
result.data.forEach((token) => {
  console.log(`设备: ${token.deviceInfo}, IP: ${token.ipAddress}`);
});
```

### 查询已撤销的 Tokens

```javascript
const result = await db
  .collection("refresh_tokens")
  .where({
    userId: "user_id_xxx",
    isRevoked: true,
  })
  .orderBy("revokedAt", "desc")
  .limit(10)
  .get();

console.log("最近撤销的 tokens:");
result.data.forEach((token) => {
  console.log(`撤销时间: ${token.revokedAt}, 原因: ${token.revokeReason}`);
});
```

### 清理过期 Tokens

```javascript
const now = new Date().toISOString();

const result = await db
  .collection("refresh_tokens")
  .where({
    expiresAt: db.command.lt(now),
  })
  .remove();

console.log(`删除了 ${result.deleted} 个过期的 tokens`);
```

---

## ⚙️ 配置

### 环境变量

```bash
# JWT 密钥 (修改!)
JWT_SECRET=your-very-secret-key-change-me

# CloudBase 配置
NEXT_PUBLIC_WECHAT_CLOUDBASE_ID=your_cloudbase_id
CLOUDBASE_SECRET_ID=your_secret_id
CLOUDBASE_SECRET_KEY=your_secret_key

# 部署区域 (CN = 中国/CloudBase, INTL = 国际/Supabase)
NEXT_PUBLIC_DEPLOY_REGION=CN
```

### Token 有效期配置

编辑 `lib/refresh-token-manager.ts`:

```typescript
// 修改这些值来改变 token 有效期

// AccessToken: 改在 loginUser() 中
jwt.sign({ ... }, secret, { expiresIn: "1h" })

// RefreshToken: 改在 createRefreshToken() 中
jwt.sign({ ... }, secret, { expiresIn: "7d" })

// CloudBase 中的过期时间也要同步修改
const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
```

---

## 🚨 常见错误

### 错误 1: 401 Unauthorized

**原因**:

- Token 无效或已过期
- Authorization header 格式错误
- Token 已被撤销

**解决**:

```bash
# 检查 header 格式
Authorization: Bearer {token}

# 而不是
Authorization: {token}
Authorization: Token {token}
```

### 错误 2: Token 刷新失败

**原因**:

- RefreshToken 已过期 (>7 天)
- RefreshToken 已被撤销
- CloudBase 连接失败

**解决**:

- 需要重新登录
- 检查 CloudBase 连接和日志

### 错误 3: 登出不生效

**原因**:

- Authorization header 格式错误
- 用户 ID 提取失败

**解决**:

- 检查 Authorization header
- 查看后端日志中的错误信息

---

## 📈 监控指标

推荐监控的指标:

```
1. 登录成功率
   ├── 登录请求数
   ├── 登录成功数
   └── 登录失败数

2. Token 错误率
   ├── 401 错误数
   ├── 无效 token 数
   └── 过期 token 数

3. 刷新成功率
   ├── 刷新请求数
   ├── 刷新成功数
   └── 刷新失败数

4. 登出操作
   ├── 登出请求数
   ├── 登出成功数
   └── 撤销的 token 数

5. 设备追踪
   ├── 不同 IP 登录数
   ├── 同时在线设备数
   └── 异常登录检测

6. 性能指标
   ├── 登录响应时间
   ├── 刷新响应时间
   └── API 认证耗时
```

---

## 📚 更多信息

详细文档:

- `PLAN_B_IMPLEMENTATION_COMPLETE.md` - 完整实现
- `PLAN_B_TESTING_GUIDE.md` - 测试指南
- `PLAN_B_COMPLETION_REPORT.md` - 项目报告

源代码:

- `lib/refresh-token-manager.ts` - Token 管理器
- `lib/auth-utils.ts` - 认证工具
- `app/api/auth/` - API 端点

---

## ❓ FAQ

### Q: AccessToken 过期了怎么办?

A: 使用 refreshToken 调用 `/api/auth/refresh` 获取新的 accessToken。

### Q: 能否同时登录多个设备?

A: 可以。每个设备有独立的 refreshToken，记录在 CloudBase 中。

### Q: 登出后能否重新使用旧 token?

A: 不能。登出后所有 token 被标记为 `isRevoked: true`，立即失效。

### Q: RefreshToken 有效期是多长?

A: 7 天。如果 7 天没有使用，需要重新登录。

### Q: 能否延长 token 有效期?

A: 可以。修改 `lib/refresh-token-manager.ts` 中的 `expiresIn` 配置。

### Q: 多个浏览器标签页会互相影响吗?

A: 不会。每个 token 独立管理。但登出时会撤销所有 tokens。

### Q: 如何检测 token 被盗?

A: 检查是否有异常的 IP 或 User-Agent 登录。参见 `detectAnomalousLogin()`。

### Q: CloudBase 故障时会怎样?

A: 新的 token 创建会失败。已有的 token 仍然可用（只要 JWT 签名有效）。

---

## 🎯 下一步

1. **前端集成** - 使用新的 token 格式
2. **自动刷新** - 在 token 过期前刷新
3. **错误处理** - 处理 401 和刷新失败
4. **日志记录** - 记录 token 相关事件
5. **监控告警** - 设置告警阈值

---

**最后更新**: 2024-12-XX  
**版本**: v1.0  
**作者**: GitHub Copilot
