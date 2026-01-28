# 🔐 MVP24 Token 认证方法完整分析

**生成日期**: 2025-11-08  
**分析范围**: 项目中所有的 token 认证实现方式  
**状态**: ✅ 已识别 7 种不同的认证方法

---

## 📊 Token 认证方法总结

项目中共有 **7 种不同的 Token 认证方法**：

| 序号 | 认证方法                 | 位置                            | 区域    | 状态        | 说明                                 |
| ---- | ------------------------ | ------------------------------- | ------- | ----------- | ------------------------------------ |
| 1️⃣   | **JWT 签名验证**         | `lib/auth-utils.ts`             | CN      | 🟡 部分实现 | 使用 JWT_SECRET，但未完整验证签名    |
| 2️⃣   | **Token 过期检查**       | `lib/token-normalizer.ts`       | CN/INTL | ✅ 已实现   | 通过 `iat` 和 `exp` 验证过期时间     |
| 3️⃣   | **CloudBase Token 解码** | `lib/cloudbase-service.ts`      | CN      | ✅ 已实现   | 直接解码 JWT payload，提取 userId    |
| 4️⃣   | **Supabase Token 验证**  | `lib/auth-utils.ts`             | INTL    | ✅ 已实现   | 调用 Supabase 官方 API               |
| 5️⃣   | **Token 刷新机制**       | `app/api/auth/refresh/route.ts` | CN      | ✅ 已实现   | Access Token + Refresh Token 轮转    |
| 6️⃣   | **原子性状态管理**       | `lib/auth-state-manager.ts`     | CN/INTL | ✅ 已实现   | localStorage 一次性存储 token + user |
| 7️⃣   | **Token 预加载刷新**     | `lib/auth-token-preloader.ts`   | CN/INTL | ✅ 已实现   | Token 即将过期时自动后台刷新         |

---

## 🔍 详细分析

### 1️⃣ JWT 签名验证 (lib/auth-utils.ts)

**当前状态**: 🟡 部分实现

**实现位置**:

```typescript
// 验证 refresh token 是否有效
const payload = jwt.verify(
  refreshToken,
  process.env.JWT_SECRET || "fallback-secret-key-for-development-only"
) as any;
```

**问题分析**:

- ✅ `/api/auth/refresh` 中使用了 `jwt.verify()` 完整验证
- ❌ `/api/auth/login` 中仅用 `jwt.sign()` 生成，未验证
- ❌ `lib/auth-utils.ts` 中 `verifyAuthToken()` 未调用 `jwt.verify()`

**当前代码 (auth-utils.ts 第 41-95 行)**:

```typescript
const userId = extractUserIdFromToken(token); // ❌ 仅解码，未验证签名
if (!userId) {
  return { success: false, error: "Invalid CloudBase token", region };
}
```

**应该改为**:

```typescript
let payload: any;
try {
  payload = jwt.verify(
    token,
    process.env.JWT_SECRET || "fallback-secret-key-for-development-only"
  );
} catch (error) {
  return { success: false, error: "Invalid token signature", region };
}
const userId = payload.userId || payload.uid || payload.sub;
```

---

### 2️⃣ Token 过期检查 (lib/token-normalizer.ts)

**当前状态**: ✅ 已实现

**实现方式**:

```typescript
export function isTokenExpired(normalized: NormalizedToken): boolean {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return nowSeconds > normalized.exp;
}

export function isTokenExpiringWithin(
  normalized: NormalizedToken,
  secondsThreshold: number = 300
): boolean {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return normalized.exp - nowSeconds < secondsThreshold;
}
```

**支持的 Token 格式**:

- CloudBase JWT: `{ userId, email, phone, iat, exp, ... }`
- Supabase JWT: `{ sub, user: { email }, iat, exp, ... }`

**过期判断逻辑**:

```
当前时间 > exp 时间戳 → Token 已过期 ❌
当前时间 < exp 时间戳 → Token 有效 ✅
```

---

### 3️⃣ CloudBase Token 解码 (lib/cloudbase-service.ts)

**当前状态**: ✅ 已实现

**实现函数**: `extractUserIdFromToken(token: string)`

**工作流程**:

```
输入 JWT Token
  ↓
Split by "."  → [header, payload, signature]
  ↓
Base64 decode payload
  ↓
JSON.parse 得到 claims
  ↓
提取 userId/uid/sub/user_id
  ↓
返回 userId
```

**支持的 userId 字段名** (优先级):

1. `claims.userId` ✅ (CloudBase 标准)
2. `claims.uid` ✅ (备用)
3. `claims.sub` ✅ (JWT 标准)
4. `claims.user_id` ✅ (备用)

**核心代码**:

```typescript
const parts = token.split(".");
const payload = parts[1];
const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
const decoded = Buffer.from(padded, "base64").toString("utf-8");
const claims = JSON.parse(decoded);
```

**问题**: 🟡 仅解码，不验证签名 → 容易被伪造

---

### 4️⃣ Supabase Token 验证 (lib/auth-utils.ts)

**当前状态**: ✅ 已实现

**实现位置**: `lib/auth-utils.ts` 第 87-130 行

**工作流程**:

```
输入 Token (Supabase JWT)
  ↓
调用 supabase.auth.getUser(token)
  ↓
Supabase 服务器验证签名和过期时间
  ↓
返回有效的用户信息
```

**特点**:

- ✅ 官方 API 验证，安全性高
- ✅ 自动处理签名验证
- ✅ 自动处理过期检查
- ✅ 自动处理时区问题

**实现代码**:

```typescript
const {
  data: { user },
  error,
} = await supabase.auth.getUser(token);
if (error || !user) {
  return { success: false, error: "Invalid Supabase token", region };
}
```

---

### 5️⃣ Token 刷新机制 (app/api/auth/refresh/route.ts)

**当前状态**: ✅ 已实现 (P1)

**端点**: `POST /api/auth/refresh`

**请求格式**:

```json
{
  "refreshToken": "eyJhbGc..."
}
```

**响应格式**:

```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": { ... },
  "tokenMeta": {
    "accessTokenExpiresIn": 3600,
    "refreshTokenExpiresIn": 604800
  }
}
```

**工作流程** (中国版本):

```
1. 验证 refresh token 签名
   jwt.verify(refreshToken, JWT_SECRET) → payload

2. 提取 userId
   userId = payload.userId || payload.uid || payload.sub

3. 生成新 access token (1h 过期)
   jwt.sign({ userId, email, region: "china" }, JWT_SECRET, { expiresIn: "1h" })

4. 生成新 refresh token (7d 过期) ← P2-1 轮转
   jwt.sign({ userId, email, region: "china", type: "refresh" }, JWT_SECRET, { expiresIn: "7d" })

5. 获取用户信息
   getOrCreateUserProfile(userId)

6. 返回完整响应
```

**特点** (P1 完成):

- ✅ Access Token 短期有效 (1 小时)
- ✅ Refresh Token 长期有效 (7 天)
- ✅ Refresh Token 轮转 (每次刷新返回新 token)
- ✅ 并发请求队列去重
- ✅ 详细日志记录

---

### 6️⃣ 原子性状态管理 (lib/auth-state-manager.ts)

**当前状态**: ✅ 已实现 (P0)

**存储位置**: `localStorage["app-auth-state"]`

**存储结构**:

```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "user123",
    "email": "user@example.com",
    "full_name": "张三",
    "avatar": "https://...",
    "subscription_plan": "free",
    "subscription_status": "active"
  },
  "tokenMeta": {
    "accessTokenExpiresIn": 3600,
    "refreshTokenExpiresIn": 604800
  },
  "savedAt": 1731084900000
}
```

**核心函数**:

| 函数                    | 功能                     | 是否异步 |
| ----------------------- | ------------------------ | -------- |
| `saveAuthState()`       | 原子性保存               | ❌ 同步  |
| `getStoredAuthState()`  | 获取存储状态             | ❌ 同步  |
| `getValidAccessToken()` | 获取有效 token，支持刷新 | ✅ 异步  |
| `getRefreshToken()`     | 获取 refresh token       | ❌ 同步  |
| `isAuthenticated()`     | 检查是否已登录           | ❌ 同步  |
| `clearAuthState()`      | 清除所有状态             | ❌ 同步  |

**特点**:

- ✅ 单一 localStorage key，原子性操作
- ✅ 多标签页通过 `storage` 事件同步
- ✅ 支持 Refresh Token 自动刷新
- ✅ 清理旧格式的 localStorage 键

---

### 7️⃣ Token 预加载刷新 (lib/auth-token-preloader.ts)

**当前状态**: ✅ 已实现 (P2)

**工作流程**:

```
后台每 30 秒检查一次
  ↓
Token 剩余时间 < 5 分钟?
  ├─ 是 → 触发刷新
  │   ↓
  │   POST /api/auth/refresh
  │   ↓
  │   updateAccessToken()
  │   ↓
  │   继续使用应用 ✅
  │
  └─ 否 → 继续等待
```

**配置选项**:

```typescript
{
  preloadThreshold: 300,      // 5 分钟前预加载
  checkInterval: 30000,       // 每 30 秒检查一次
  enableDetailedLogs: true,   // 生产环境建议关闭
  maxRetries: 3,              // 最多重试 3 次
  retryDelay: 1000            // 重试延迟 1 秒
}
```

**特点** (P2 完成):

- ✅ 自动后台刷新，用户无感知
- ✅ 并发请求去重 (同一时间只发一个刷新请求)
- ✅ Refresh Token 轮转
- ✅ 详细性能日志
- ✅ 错误恢复机制

---

## 📐 认证流程图

### 完整登录流程

```
用户访问应用
  ↓
UserContext 初始化
  ├─ 同步读取 localStorage
  └─ 检查 "app-auth-state" key
  ↓
已登录? ✅ → 显示 Dashboard
未登录? ❌ → 重定向到 /auth
  ↓
用户输入邮箱密码
  ↓
POST /api/auth/login
  ├─ 验证邮箱密码
  ├─ 检查账户锁定
  ├─ 生成 JWT token (jwt.sign)
  └─ 返回 { accessToken, refreshToken, user, tokenMeta }
  ↓
前端调用 saveAuthState()
  ├─ 原子性保存到 localStorage
  └─ dispatch 'auth-state-changed' 事件
  ↓
UserContext 监听事件
  ├─ 更新 user state
  └─ 初始化 TokenPreloader
  ↓
页面自动导航到 /
  ↓
应用正常运行 ✅
```

### Token 自动刷新流程

```
应用运行中...
  ↓
[后台 P2 Preloader]
每 30 秒检查一次 token 过期时间
  ↓
Token 剩余 < 5 分钟?
  ├─ 是 → 触发预加载刷新
  │   ↓
  │   检查是否有并发刷新请求
  │   ├─ 有 → 等待并共享结果
  │   └─ 无 → 发起新的刷新请求
  │   ↓
  │   POST /api/auth/refresh { refreshToken }
  │   ↓
  │   服务器验证 refresh token 签名
  │   ↓
  │   生成新 access token (1h)
  │   生成新 refresh token (7d) ← 轮转
  │   ↓
  │   返回新 token
  │   ↓
  │   更新 localStorage
  │   ↓
  │   继续使用应用 ✅
  │
  └─ 否 → 继续等待下次检查
```

---

## 🔒 安全性分析

### 各种认证方法的安全评分

| 认证方法       | 签名验证 | 过期检查 | 防盗取 | 防伪造 | 评分   |
| -------------- | -------- | -------- | ------ | ------ | ------ |
| JWT 签名验证   | ❌ 部分  | ✅ 是    | ✅ 中  | ⚠️ 低  | 🟡 60% |
| Token 过期检查 | ✅ 完全  | ✅ 是    | ✅ 中  | ✅ 高  | ✅ 85% |
| CloudBase 解码 | ❌ 否    | ⚠️ 否    | ❌ 低  | ❌ 低  | 🔴 30% |
| Supabase 验证  | ✅ 完全  | ✅ 是    | ✅ 中  | ✅ 高  | ✅ 90% |
| Token 刷新     | ✅ 完全  | ✅ 是    | ✅ 中  | ✅ 高  | ✅ 95% |
| 原子性状态     | ❌ 否    | ❌ 否    | ✅ 中  | ❌ 低  | 🟡 50% |
| 预加载刷新     | ✅ 完全  | ✅ 是    | ✅ 中  | ✅ 高  | ✅ 92% |

---

## ❌ 当前存在的问题

### 问题 1: JWT 签名验证不完整

**位置**: `lib/auth-utils.ts` 第 41-55 行

**问题**: 在 `/api/profile` 中仅调用 `extractUserIdFromToken()`，不验证 JWT 签名

**风险**:

- 🔴 **高风险** - 可以伪造 token
- 任何人都可以创建一个假 token，改变 userId

**现在的代码**:

```typescript
const userId = extractUserIdFromToken(token); // ❌ 只解码，不验证
if (!userId) {
  return { success: false, error: "Invalid CloudBase token", region };
}
```

**应该改为**:

```typescript
let payload: any;
try {
  payload = jwt.verify(
    token,
    process.env.JWT_SECRET || "fallback-secret-key-for-development-only"
  );
} catch (error) {
  console.error("Token verification failed:", error);
  return { success: false, error: "Invalid token signature", region };
}

const userId = payload.userId;
if (!userId) {
  return { success: false, error: "Invalid token payload", region };
}
```

---

### 问题 2: Token 过期验证缺失

**位置**: `lib/auth-utils.ts` 第 41-95 行

**问题**: 虽然解码了 token，但未检查 `iat` 和 `exp` 字段

**风险**:

- 🟡 **中等风险** - 过期 token 仍然可用
- Token 应该在指定时间后失效

**现在的代码**:

```typescript
// 虽然有 normalizeTokenPayload 和 isTokenExpired，但在 verifyAuthToken 中未调用
```

**应该改为**:

```typescript
const normalized = normalizeTokenPayload(payload, "CN");
if (isTokenExpired(normalized)) {
  return { success: false, error: "Token expired", region };
}
```

---

### 问题 3: 旧格式 token 仍在使用

**位置**: `lib/cloudbase-service.ts` 第 106-112 行

**问题**: 登录时生成 token 时使用了长期有效期 ("30d" 或 "90d")

**风险**:

- 🟡 **中等风险** - Token 有效期过长
- 如果 token 被盗，攻击者有很长时间的访问权限

**现在的代码**:

```typescript
const expiresIn = user.pro ? "90d" : "30d"; // ❌ 太长了
```

**应该改为**:

```typescript
const expiresIn = "1h"; // ✅ 1 小时短期 token
// 配合 refresh token (7 天) 使用
```

---

## 🔧 修复建议

### 修复 1: 完整的 JWT 签名验证

**文件**: `lib/auth-utils.ts`  
**优先级**: 🔴 **高**  
**影响范围**: 所有 API 路由认证

```typescript
export async function verifyAuthToken(token: string): Promise<...> {
  if (!token) {
    return { success: false, error: "Missing token" };
  }

  try {
    const region = isChinaRegion() ? "CN" : "INTL";

    if (region === "CN") {
      // ✅ 使用 jwt.verify() 完整验证
      let payload: any;
      try {
        payload = jwt.verify(
          token,
          process.env.JWT_SECRET || "fallback-secret-key-for-development-only"
        );
      } catch (error) {
        return { success: false, error: "Invalid token signature", region };
      }

      const userId = payload.userId;
      if (!userId) {
        return { success: false, error: "Invalid token payload", region };
      }

      // ✅ 验证 token 是否过期
      const normalized = normalizeTokenPayload(payload, "CN");
      if (isTokenExpired(normalized)) {
        return { success: false, error: "Token expired", region };
      }

      // ... 验证用户是否存在
    }
    // ... 其他逻辑
  }
}
```

---

### 修复 2: 使用短期 token

**文件**: `lib/cloudbase-service.ts`  
**优先级**: 🟡 **中**  
**影响范围**: 登录时 token 生成

```typescript
// ❌ 改为
const expiresIn = user.pro ? "90d" : "30d";

// ✅ 改为
const expiresIn = "1h"; // 1 小时短期 token
```

---

### 修复 3: 在所有 API 中验证 token 过期

**文件**: 所有 API 路由  
**优先级**: 🟡 **中**  
**影响范围**: `/api/profile`, `/api/user/**`, 等

```typescript
// 在每个 GET/POST 请求中添加过期检查
const authResult = await verifyAuthToken(token);
if (!authResult.success) {
  return NextResponse.json(
    { error: authResult.error || "Unauthorized" },
    { status: 401 }
  );
}
```

---

## 📋 建议的认证系统架构

### 统一的认证验证流程

```
API 请求
  ↓
middleware 提取 Authorization header
  ├─ 格式检查: Bearer <token>
  └─ 如果失败 → 401 Unauthorized
  ↓
verifyAuthToken(token)
  ├─ 签名验证 (jwt.verify)
  ├─ 过期检查 (iat, exp)
  ├─ 用户存在性检查 (从数据库)
  └─ 如果任何失败 → 401 Unauthorized
  ↓
成功 ✅ → 继续处理请求
失败 ❌ → 401 Unauthorized
```

---

## 🎯 总结

### 当前实现的 7 种认证方法

| #   | 方法           | 状态    | 推荐      | 说明                             |
| --- | -------------- | ------- | --------- | -------------------------------- |
| 1   | JWT 签名验证   | 🟡 部分 | ⚠️ 需修复 | `/api/auth/refresh` 有，其他没有 |
| 2   | Token 过期检查 | ✅ 完全 | ✅ 使用   | `lib/token-normalizer.ts` 完整   |
| 3   | CloudBase 解码 | ✅ 完全 | ⚠️ 有风险 | 仅解码，不验证签名               |
| 4   | Supabase 验证  | ✅ 完全 | ✅ 推荐   | 官方 API，安全性最高             |
| 5   | Token 刷新     | ✅ 完全 | ✅ 推荐   | P1 实现，完整可用                |
| 6   | 原子性状态     | ✅ 完全 | ✅ 推荐   | P0 实现，解决登录 bug            |
| 7   | 预加载刷新     | ✅ 完全 | ✅ 推荐   | P2 实现，用户体验最好            |

### 401 错误返回的根本原因

**症状**: `GET /api/profile` 返回 401 Unauthorized

**根本原因** (已找到):

1. ✅ 没有 Authorization header → 返回 401
2. ✅ Authorization 格式错误 (不是 Bearer xxx) → 返回 401
3. ❌ Token 签名无效 → 应该返回 401，但当前未检查
4. ❌ Token 已过期 → 应该返回 401，但当前未检查

**修复优先级**:

1. 🔴 **高** - 修复 JWT 签名验证
2. 🔴 **高** - 修复 Token 过期检查
3. 🟡 **中** - 统一所有 API 的认证逻辑
4. 🟡 **中** - 改用短期 token (1h)

---

**下一步**: 开始修复这些问题？建议从问题 1 开始！
