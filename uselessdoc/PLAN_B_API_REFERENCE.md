# Plan B API 参考手册

完整的 API 规范文档。

---

## 📌 概述

Plan B 实现提供以下 RESTful API 端点。所有请求/响应都使用 JSON 格式。

**基础 URL**: `http(s)://your-domain.com`

**认证**: 使用 Bearer token

```
Authorization: Bearer {accessToken}
```

---

## 🔑 认证端点

### POST /api/auth

通用认证端点，支持登录和注册。

#### 登录

**请求**:

```json
{
  "action": "login",
  "email": "user@example.com",
  "password": "password123"
}
```

**响应** (200):

```json
{
  "success": true,
  "user": {
    "id": "user_id_xxx",
    "email": "user@example.com",
    "name": "user"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenMeta": {
    "accessTokenExpiresIn": 3600,
    "refreshTokenExpiresIn": 604800
  }
}
```

**错误** (401):

```json
{
  "success": false,
  "message": "用户不存在或密码错误"
}
```

**字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| `action` | string | 必需: `"login"` 或 `"signup"` |
| `email` | string | 必需: 用户邮箱 |
| `password` | string | 必需: 用户密码 |

#### 注册

**请求**:

```json
{
  "action": "signup",
  "email": "newuser@example.com",
  "password": "password123"
}
```

**响应** (200):

```json
{
  "success": true,
  "user": {
    "id": "new_user_id",
    "email": "newuser@example.com",
    "name": "newuser"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenMeta": {
    "accessTokenExpiresIn": 3600,
    "refreshTokenExpiresIn": 604800
  }
}
```

**错误** (400):

```json
{
  "success": false,
  "message": "该邮箱已被注册"
}
```

---

### POST /api/auth/login

专用登录端点（推荐使用）。

**请求**:

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**响应** (200):

```json
{
  "success": true,
  "user": {
    "id": "user_id_xxx",
    "email": "user@example.com",
    "name": "user",
    "avatar": "",
    "subscription_plan": "free",
    "subscription_status": "active",
    "subscription_expires_at": null,
    "membership_expires_at": null
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenMeta": {
    "accessTokenExpiresIn": 3600,
    "refreshTokenExpiresIn": 604800
  }
}
```

**错误** (401):

```json
{
  "error": "用户不存在或密码错误"
}
```

---

### POST /api/auth/refresh

刷新访问令牌。

**请求**:

```bash
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**响应** (200):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_id_xxx",
    "email": "user@example.com",
    "name": "user",
    "avatar": "",
    "subscription_plan": "free",
    "subscription_status": "active",
    "subscription_expires_at": null,
    "membership_expires_at": null
  },
  "tokenMeta": {
    "accessTokenExpiresIn": 3600,
    "refreshTokenExpiresIn": 604800
  }
}
```

**错误** (401):

```json
{
  "error": "Refresh token 已过期或已被撤销，请重新登录"
}
```

**字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| `refreshToken` | string | 必需: 用于刷新的 refresh token |

**说明**:

- 使用 refreshToken 获取新的 accessToken
- 响应中会返回新的 refreshToken（token 轮转）
- 新 tokens 与旧 tokens 不同

---

### POST /api/auth/logout

登出用户，撤销所有活跃的 refresh tokens。

**请求**:

```bash
POST /api/auth/logout
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**响应** (200):

```json
{
  "success": true,
  "message": "Logged out successfully",
  "tokensRevoked": 3
}
```

**错误** (401):

```json
{
  "error": "Unauthorized"
}
```

**错误** (500):

```json
{
  "error": "Failed to revoke tokens",
  "details": "..."
}
```

**说明**:

- 需要有效的 accessToken
- 登出后所有该用户的 refresh tokens 被标记为已撤销
- `tokensRevoked` 表示撤销的 token 数量
- 登出立即生效，无延迟

---

## 👤 用户端点

### GET /api/profile

获取当前用户信息（需要认证）。

**请求**:

```bash
GET /api/profile
Authorization: Bearer {accessToken}
```

**响应** (200):

```json
{
  "success": true,
  "user": {
    "id": "user_id_xxx",
    "email": "user@example.com",
    "name": "user",
    "avatar": "avatar_url",
    "subscription_plan": "pro",
    "subscription_status": "active",
    "subscription_expires_at": "2025-12-31T23:59:59Z",
    "membership_expires_at": "2025-06-30T23:59:59Z"
  }
}
```

**错误** (401):

```json
{
  "error": "Unauthorized"
}
```

**说明**:

- 需要有效的 accessToken（在 Authorization header 中）
- Token 过期后返回 401

---

## 🔄 认证流程

### 完整登录和使用流程

```bash
# 1. 登录
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'

# 响应包含:
# accessToken, refreshToken, tokenMeta

# 2. 保存 tokens 到客户端（localStorage/sessionStorage）

# 3. 调用需要认证的 API
curl -X GET http://localhost:3000/api/profile \
  -H "Authorization: Bearer {accessToken}"

# [1小时后] accessToken 过期

# 4. 刷新 token
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "{refreshToken}"}'

# 响应包含新的:
# accessToken, refreshToken

# 5. 更新客户端的 tokens

# 6. 继续调用 API...

# 最后：登出
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer {accessToken}"

# 7. 清除客户端的 tokens
```

---

## ⚠️ 错误处理

### 错误代码

| 状态码 | 错误                  | 说明                   |
| ------ | --------------------- | ---------------------- |
| 400    | Bad Request           | 请求参数无效           |
| 401    | Unauthorized          | Token 无效、过期或缺失 |
| 403    | Forbidden             | 没有权限访问资源       |
| 404    | Not Found             | 资源不存在             |
| 500    | Internal Server Error | 服务器错误             |

### 常见错误响应

**无效的 email/password**:

```json
{
  "error": "用户不存在或密码错误"
}
```

**Token 过期**:

```json
{
  "error": "Unauthorized"
}
```

**Token 已撤销**:

```json
{
  "error": "Refresh token 已过期或已被撤销，请重新登录"
}
```

**缺失 Authorization header**:

```json
{
  "error": "Unauthorized - missing Authorization header"
}
```

---

## 📊 Token 详细信息

### AccessToken

**类型**: JWT  
**有效期**: 3600 秒 (1 小时)  
**用途**: 调用需要认证的 API  
**格式**:

```
Header: { "alg": "HS256", "typ": "JWT" }
Payload: {
  "userId": "user_id_xxx",
  "email": "user@example.com",
  "region": "CN",
  "iat": 1234567890,
  "exp": 1234571490
}
Signature: HMAC-SHA256(header.payload, secret)
```

### RefreshToken

**类型**: JWT + CloudBase 持久化  
**有效期**: 604800 秒 (7 天)  
**用途**: 获取新的 accessToken  
**格式**:

```
Header: { "alg": "HS256", "typ": "JWT" }
Payload: {
  "userId": "user_id_xxx",
  "tokenId": "uuid-v4",
  "iat": 1234567890,
  "exp": 1234604690
}
Signature: HMAC-SHA256(header.payload, secret)
```

**CloudBase 中的记录**:

```json
{
  "tokenId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user_id_xxx",
  "email": "user@example.com",
  "isRevoked": false,
  "createdAt": "2024-12-20T10:00:00Z",
  "expiresAt": "2024-12-27T10:00:00Z",
  "lastUsedAt": "2024-12-20T10:00:00Z",
  "usageCount": 1,
  "ipAddress": "127.0.0.1",
  "userAgent": "Mozilla/5.0...",
  "deviceInfo": "web-login"
}
```

---

## 🔒 安全最佳实践

### 客户端

1. **安全存储 tokens**:

   ```javascript
   // ✓ 推荐：使用 httpOnly cookies（后端设置）
   // ✓ 可接受：localStorage（仅在 HTTPS 上）

   // ✗ 不推荐：sessionStorage（容易暴露）
   // ✗ 严禁：URL 参数或 localStorage（不安全）
   ```

2. **自动刷新**:

   ```javascript
   // 在 token 过期前 5 分钟自动刷新
   setInterval(async () => {
     const now = Date.now();
     const expiresAt = getTokenExpirationTime();

     if (expiresAt - now < 5 * 60 * 1000) {
       await refreshToken();
     }
   }, 60 * 1000); // 每分钟检查一次
   ```

3. **处理 401 错误**:
   ```javascript
   // 所有 API 调用都应该处理 401
   if (response.status === 401) {
     await refreshToken();
     // 重试请求
   }
   ```

### 服务器

1. **Token 验证**:

   - 总是使用 JWT.verify() 进行完整验证
   - 检查签名、过期时间、payload

2. **刷新速率限制**:

   - 防止滥用刷新端点
   - 实现 rate limiting

3. **定期清理**:
   - 删除过期的 tokens
   - 清理已撤销的 tokens

---

## 📈 性能指标

预期的性能参数（本地测试）：

| 操作              | 响应时间 | 备注                      |
| ----------------- | -------- | ------------------------- |
| 登录              | < 500ms  | 包括密码验证和 token 生成 |
| 登出              | < 200ms  | 批量撤销 tokens           |
| API 调用 (有认证) | < 100ms  | JWT 验证和用户查询        |
| 刷新 Token        | < 300ms  | 包括 CloudBase 查询和轮转 |

**优化建议**:

- 使用 Redis 缓存 CloudBase 中的撤销状态
- 异步处理设备信息记录
- 定期清理过期 tokens

---

## 🧪 cURL 测试示例

### 登录

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }' | jq .
```

### 调用受保护的 API

```bash
curl -X GET http://localhost:3000/api/profile \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" | jq .
```

### 刷新 Token

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGc..."
  }' | jq .
```

### 登出

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" | jq .
```

---

## 📚 参考资源

- JWT 规范: https://tools.ietf.org/html/rfc7519
- OAuth 2.0: https://tools.ietf.org/html/rfc6749
- Bearer Token: https://tools.ietf.org/html/rfc6750

---

## ❓ 常见问题

### Q: 如何处理 token 过期?

A: 在任何 API 调用返回 401 时，使用 refreshToken 获取新的 accessToken，然后重试请求。

### Q: accessToken 过期后立即丢弃还是尝试刷新?

A: 建议尝试刷新。大部分 SDK 都会自动处理这个逻辑。

### Q: 能否在没有 refreshToken 的情况下使用 API?

A: 不能。如果 accessToken 过期，必须使用 refreshToken 获取新的。

### Q: 登出后能否重新使用旧的 tokens?

A: 不能。登出会立即撤销所有 tokens。

### Q: 是否可以跨域使用这些 API?

A: 可以，如果后端配置了 CORS。tokens 使用 Authorization header，不依赖 cookies。

---

**最后更新**: 2024-12-XX  
**版本**: v1.0  
**作者**: GitHub Copilot
