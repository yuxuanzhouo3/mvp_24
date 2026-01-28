# 🔐 Token 认证方法快速参考

**创建时间**: 2025-11-08  
**项目**: MVP24  
**总结**: 项目中共有 **7 种不同的 Token 认证方法**

---

## 📊 快速对比表

```
┌─────┬──────────────────────┬─────────┬────────┬──────────────────────┐
│ # │ 认证方法              │ 实现位置 │ 区域   │ 安全性               │
├─────┼──────────────────────┼─────────┼────────┼──────────────────────┤
│ 1 │ JWT 签名验证          │ auth-*  │ CN/INT│ 🟡 部分实现          │
│ 2 │ Token 过期检查        │ token-* │ CN/INT│ ✅ 完整实现          │
│ 3 │ CloudBase 解码        │ cloud-* │ CN    │ 🔴 仅解码，无验证    │
│ 4 │ Supabase 验证         │ auth-*  │ INT   │ ✅ 官方API，最安全   │
│ 5 │ Token 刷新机制        │ refresh │ CN    │ ✅ P1完整            │
│ 6 │ 原子性状态管理        │ state-* │ CN/INT│ ✅ P0完整            │
│ 7 │ 预加载自动刷新        │ preload │ CN/INT│ ✅ P2完整            │
└─────┴──────────────────────┴─────────┴────────┴──────────────────────┘
```

---

## 🔑 核心认证文件位置

### 1️⃣ 主要认证文件 (4 个)

```
lib/
├─ auth-utils.ts              [验证 token] ← 需要修复
├─ auth-state-manager.ts      [保存/获取状态] ✅
├─ auth-token-preloader.ts    [自动刷新] ✅
└─ token-normalizer.ts        [标准化格式] ✅

app/api/auth/
├─ login/route.ts             [生成 token] ← 需要改
├─ refresh/route.ts           [刷新 token] ✅
└─ ...

lib/cloudbase/
└─ auth-*.ts                  [CloudBase特定] ← 备用
```

### 2️⃣ 各区域认证差异

```
中国区域 (CN) - DEPLOY_REGION=CN
├─ 后端: CloudBase + JWT
├─ Token 生成: jwt.sign()
├─ Token 验证: ❌ 不完整 (应该用 jwt.verify)
└─ 刷新: ✅ POST /api/auth/refresh

国际区域 (INT) - DEPLOY_REGION=INTL
├─ 后端: Supabase
├─ Token 生成: Supabase auth
├─ Token 验证: ✅ supabase.auth.getUser()
└─ 刷新: Supabase 内置
```

---

## ⚡ 关键函数速查

### Token 生成

| 函数          | 位置                  | 入参       | 出参  | 问题          |
| ------------- | --------------------- | ---------- | ----- | ------------- |
| `loginUser()` | cloudbase-service.ts  | email, pwd | token | ⚠️ 有效期太长 |
| `jwt.sign()`  | auth/refresh/route.ts | payload    | token | ✅ 1h         |

### Token 验证

| 函数                       | 位置                  | 入参          | 出参              | 问题          |
| -------------------------- | --------------------- | ------------- | ----------------- | ------------- |
| `verifyAuthToken()`        | auth-utils.ts         | token         | {success, userId} | ❌ 无签名验证 |
| `extractUserIdFromToken()` | cloudbase-service.ts  | token         | userId            | ❌ 仅解码     |
| `jwt.verify()`             | auth/refresh/route.ts | token, secret | payload           | ✅ 完整       |

### Token 存储/刷新

| 函数                    | 位置                  | 入参        | 出参        | 问题        |
| ----------------------- | --------------------- | ----------- | ----------- | ----------- |
| `saveAuthState()`       | auth-state-manager.ts | token, user | void        | ✅ 原子性   |
| `getValidAccessToken()` | auth-state-manager.ts | -           | token\|null | ✅ 支持刷新 |
| `getAuthHeaderAsync()`  | auth-state-manager.ts | -           | headers     | ✅ 推荐     |

---

## 🐛 当前问题列表

### 问题 1: 401 错误的原因

```
GET /api/profile 返回 401
├─ ✅ 没有 Authorization header → 直接返回 401
├─ ✅ 格式错误 (不是 Bearer xxx) → 返回 401
├─ ❌ Token 签名无效 → 本应返回 401，但未检查
└─ ❌ Token 已过期 → 本应返回 401，但未检查
```

### 问题 2: JWT 签名验证不完整

**文件**: `lib/auth-utils.ts` 第 41-55 行  
**当前**: 仅调用 `extractUserIdFromToken()` (解码)  
**应该**: 调用 `jwt.verify()` (验证)  
**风险**: 🔴 高 - 可伪造 token

### 问题 3: Token 过期验证缺失

**文件**: `lib/auth-utils.ts` 第 41-95 行  
**当前**: 虽然解码了 token，但未检查 `exp` 字段  
**应该**: 调用 `isTokenExpired()` 检查  
**风险**: 🟡 中 - 过期 token 仍然可用

### 问题 4: Token 有效期太长

**文件**: `lib/cloudbase-service.ts` 第 106-112 行  
**当前**: 30-90 天 (根据用户类型)  
**应该**: 1 小时 (配合 refresh token 7 天)  
**风险**: 🟡 中 - 盗用风险大

---

## ✅ 应该使用的正确方式

### 正确的登录流程

```typescript
// 1. 生成短期 token (1小时)
const token = jwt.sign(
  { userId, email },
  JWT_SECRET,
  { expiresIn: "1h" }  // ✅ 改为 1小时
);

// 2. 返回完整格式
{
  accessToken: token,
  refreshToken: longerToken,  // 7 天
  user: { ... },
  tokenMeta: { ... }
}
```

### 正确的 API 验证

```typescript
// ❌ 不要这样做
const userId = extractUserIdFromToken(token);

// ✅ 应该这样做
let payload;
try {
  payload = jwt.verify(token, JWT_SECRET);
} catch (e) {
  return 401; // 签名无效
}

const normalized = normalizeTokenPayload(payload, "CN");
if (isTokenExpired(normalized)) {
  return 401; // Token 已过期
}

const userId = payload.userId;
```

### 正确的 API 请求

```typescript
// ❌ 不要这样做
const response = await fetch("/api/profile", {
  headers: { Authorization: "Bearer invalid-token" },
});

// ✅ 应该这样做
const response = await fetch("/api/profile", {
  headers: await getAuthHeaderAsync(), // 自动刷新 token
});
```

---

## 📈 认证方法演进

```
阶段 1: 基础认证
├─ 登录生成 token (jwt.sign) ✅
└─ API 验证 token (extractUserIdFromToken) ⚠️ 不完整

阶段 2 (P0): 原子性管理
├─ 保存 token + user 一起 ✅
├─ 支持多标签页同步 ✅
└─ 支持自动刷新 ✅

阶段 3 (P1): 完整刷新机制
├─ Access token 1小时 ✅
├─ Refresh token 7天 ✅
├─ Token 轮转 ✅
└─ 并发去重 ✅

阶段 4 (P2): 性能优化
├─ 预加载刷新 ✅
├─ 请求队列 ✅
├─ 详细日志 ✅
└─ → 当前状态 ✅

待修复:
├─ JWT 签名验证 ❌
├─ Token 过期检查 ❌
└─ 统一 API 认证逻辑 ❌
```

---

## 🎯 修复优先级

### 🔴 高优先级 (立即修复)

```
[ ] 1. 修复 JWT 签名验证
      文件: lib/auth-utils.ts
      影响: 所有 API 路由

[ ] 2. 统一 API 认证逻辑
      文件: 所有 /api/** 路由
      影响: 安全性
```

### 🟡 中优先级 (本周修复)

```
[ ] 3. 改用短期 token (1小时)
      文件: lib/cloudbase-service.ts
      影响: 登录流程

[ ] 4. 添加 Token 过期检查
      文件: lib/auth-utils.ts
      影响: 所有 API 路由
```

### 🟢 低优先级 (优化)

```
[ ] 5. 添加更多日志
[ ] 6. 添加监控告警
[ ] 7. 性能测试
```

---

## 📝 相关文档

| 文档        | 内容               | 位置                             |
| ----------- | ------------------ | -------------------------------- |
| P0 完整说明 | 原子性状态管理     | `P0_IMPLEMENTATION_COMPLETE.md`  |
| P1 完整说明 | Token 自动刷新     | `P1_IMPLEMENTATION_COMPLETE.md`  |
| P2 完整说明 | 性能优化           | `P2_IMPLEMENTATION_COMPLETE.md`  |
| **本文**    | Token 认证方法分析 | `TOKEN_AUTH_METHODS_ANALYSIS.md` |

---

## 💡 快速测试

### 测试有效 token

```powershell
# 登录获取 token
$response = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"test@example.com","password":"password"}'

$token = ($response.Content | ConvertFrom-Json).accessToken

# 测试 API
Invoke-WebRequest -Uri "http://localhost:3000/api/profile" `
  -Headers @{"Authorization"="Bearer $token"} `
  -Method GET
```

### 测试无效 token

```powershell
# 这会返回 401 (因为没有有效的 token 签名)
Invoke-WebRequest -Uri "http://localhost:3000/api/profile" `
  -Headers @{"Authorization"="Bearer invalid-token"} `
  -Method GET
```

---

## ✨ 总结

**你的项目中有 7 种不同的 Token 认证方法：**

1. ✅ JWT 签名验证 (部分实现)
2. ✅ Token 过期检查 (完整)
3. ✅ CloudBase 解码 (无验证)
4. ✅ Supabase 验证 (完整安全)
5. ✅ Token 刷新机制 (P1 完整)
6. ✅ 原子性状态管理 (P0 完整)
7. ✅ 预加载自动刷新 (P2 完整)

**401 错误的根本原因**: 未完整验证 Token 签名和过期时间

**建议**: 从问题 1 开始修复！
