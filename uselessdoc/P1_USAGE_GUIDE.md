# P1 使用指南 - Token 自动刷新

**阶段**: P1  
**功能**: Token 自动刷新  
**支持区域**: CN (CloudBase), INTL (Supabase)

---

## 🎯 概述

P1 实现了 **Token 自动刷新** 机制。当 access token 即将过期时，系统会自动调用 `/api/auth/refresh` 端点获取新 token，无需用户重新登录。

### 主要优势

✅ **用户体验**:

- 用户无感刷新，继续使用应用
- 没有中断或强制登出

✅ **安全性**:

- Access token 短期有效（1 小时）
- Refresh token 长期有效（7 天）
- 自动清理过期状态

✅ **可靠性**:

- 刷新失败自动降级
- 错误时清除状态触发重新登录

---

## 📚 API 参考

### `getValidAccessToken()` - 异步获取有效 token

```typescript
import { getValidAccessToken } from "@/lib/auth-state-manager";

// 获取有效 token（如果过期会自动刷新）
const token = await getValidAccessToken();

if (token) {
  // token 有效，可以使用
  console.log("Token:", token);
} else {
  // token 不可恢复，需要重新登录
  router.push("/auth");
}
```

**返回值**:

- `string`: 有效的 access token
- `null`: Token 无效或不可恢复

**错误处理**:

- 如果 refresh token 也过期，自动清除状态并返回 `null`
- 如果网络错误，返回 `null`

---

### `getAuthHeaderAsync()` - 异步获取授权头

```typescript
import { getAuthHeaderAsync } from "@/lib/auth-state-manager";

// 在 API 请求中使用（自动刷新）
const headers = await getAuthHeaderAsync();

const response = await fetch("/api/user/profile", {
  headers: headers || {},
});
```

**返回值**:

- `{ Authorization: "Bearer xxx" }`: 有效的授权头
- `null`: 无法获取 token

---

### `isAuthenticated()` - 同步检查认证状态

```typescript
import { isAuthenticated } from "@/lib/auth-state-manager";

// UI 条件渲染（同步，快速）
if (isAuthenticated()) {
  return <Dashboard />;
} else {
  return <LoginPage />;
}
```

**注意**: 这是 **同步** 检查，不会触发刷新。用于 UI 快速判断。

---

### `getRefreshToken()` - 获取 refresh token

```typescript
import { getRefreshToken } from "@/lib/auth-state-manager";

const refreshToken = getRefreshToken();

if (refreshToken) {
  // 有有效的 refresh token
}
```

---

### `isRefreshTokenValid()` - 检查 refresh token 是否有效

```typescript
import { isRefreshTokenValid } from "@/lib/auth-state-manager";

if (isRefreshTokenValid()) {
  // Refresh token 仍然有效，可以用于刷新
}
```

---

## 🔌 集成到现有代码

### 方案 1: 在 API 调用中使用异步头

**Before (可能使用过期 token)**:

```typescript
const header = getAuthHeader();
const response = await fetch("/api/data", { headers: header });
```

**After (自动刷新)**:

```typescript
const header = await getAuthHeaderAsync();
const response = await fetch("/api/data", { headers: header });
```

### 方案 2: 在 API 路由中使用异步 token

**示例**: `app/api/user/profile/route.ts`

```typescript
import { getValidAccessToken } from "@/lib/auth-state-manager";

export async function GET(request: NextRequest) {
  // 获取有效 token（如果过期自动刷新）
  const token = await getValidAccessToken();

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 使用 token 调用后端服务
  const response = await fetch("https://backend.example.com/profile", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response;
}
```

### 方案 3: 在自定义 Hook 中使用

```typescript
// hooks/useAuthenticatedFetch.ts
import { useCallback } from "react";
import { getAuthHeaderAsync } from "@/lib/auth-state-manager";

export function useAuthenticatedFetch() {
  return useCallback(async (url: string, options?: RequestInit) => {
    const headers = await getAuthHeaderAsync();

    if (!headers) {
      throw new Error("Not authenticated");
    }

    return fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...(options?.headers as Record<string, string>),
      },
    });
  }, []);
}

// 使用示例
function MyComponent() {
  const fetch = useAuthenticatedFetch();

  const loadData = async () => {
    const response = await fetch("/api/data");
    const data = await response.json();
  };

  return <button onClick={loadData}>Load Data</button>;
}
```

---

## 🔄 Token 刷新流程详解

### 当 API 请求被发起时:

```
1. 调用 getValidAccessToken()
   ↓
2. 检查本地 token 是否有效（距离过期 > 60 秒）
   ├─ 是 → 返回当前 token ✅
   └─ 否 → 继续步骤 3
   ↓
3. 检查 refresh token 是否有效（距离过期 > 0）
   ├─ 否 → 清除状态，返回 null ❌
   └─ 是 → 继续步骤 4
   ↓
4. 发送 POST /api/auth/refresh 请求
   ├─ 响应状态 401 → 清除状态，返回 null ❌
   ├─ 响应状态 500 → 返回 null ❌
   └─ 响应状态 200 → 继续步骤 5
   ↓
5. 提取新的 accessToken 和 tokenMeta
   ↓
6. 调用 updateAccessToken() 更新本地 token
   ↓
7. 返回新的 access token ✅
   ↓
8. 使用新 token 完成原始 API 请求
```

---

## ⚠️ 注意事项

### 1. 异步 vs 同步

- **`getValidAccessToken()`**: ⏳ 异步，可能调用 `/api/auth/refresh`
- **`isAuthenticated()`**: ⚡ 同步，只检查本地状态
- **`getAuthHeader()`**: ⚡ 同步，不刷新 token

选择合适的 API：

- 发送 API 请求时用 **异步** 版本
- UI 条件渲染用 **同步** 版本

### 2. 并发刷新

多个请求同时到达且 token 都过期时：

```
Request 1: 调用 getValidAccessToken() → 发起刷新
Request 2: 调用 getValidAccessToken() → 也发起刷新 ⚠️
Request 3: 调用 getValidAccessToken() → 也发起刷新 ⚠️
```

当前实现会发出多个刷新请求。优化方案：

```typescript
// 未来改进：添加刷新锁
let refreshingPromise: Promise<string | null> | null = null;

export async function getValidAccessToken(): Promise<string | null> {
  // 如果已经在刷新，等待现有刷新完成
  if (refreshingPromise) {
    return refreshingPromise;
  }

  // ... 刷新逻辑 ...
}
```

### 3. 错误恢复

- 如果刷新失败 3 次，考虑强制登出
- 考虑在 catch 块中重试一次

---

## 🧪 测试场景

### 场景 1: 正常 Token 使用

```typescript
// ✅ 测试: Token 有效时直接返回
const token = await getValidAccessToken();
expect(token).toBe(currentToken);
```

### 场景 2: Token 自动刷新

```typescript
// ✅ 测试: Token 过期时自动刷新
// 1. 手动修改 savedAt 使 token 过期
localStorage.setItem(
  "app-auth-state",
  JSON.stringify({
    ...authState,
    savedAt: Date.now() - 4000000, // 过期
  })
);

// 2. 调用 getValidAccessToken
const token = await getValidAccessToken();

// 3. 应该返回新的 token
expect(token).not.toBe(oldToken);
```

### 场景 3: 全部 Token 过期

```typescript
// ✅ 测试: 两个 token 都过期时清除状态
// 1. 清除 auth state
localStorage.removeItem("app-auth-state");

// 2. 调用 getValidAccessToken
const token = await getValidAccessToken();

// 3. 应该返回 null
expect(token).toBeNull();
```

---

## 📊 性能指标

| 操作                           | 耗时      | 说明       |
| ------------------------------ | --------- | ---------- |
| `isAuthenticated()`            | < 1ms     | 同步检查   |
| `getValidAccessToken()` (有效) | < 1ms     | 无需刷新   |
| `getValidAccessToken()` (刷新) | 100-500ms | 取决于网络 |
| `getAuthHeaderAsync()` (有效)  | < 1ms     | 无需刷新   |
| `getAuthHeaderAsync()` (刷新)  | 100-500ms | 取决于网络 |

---

## 🐛 调试

### 启用详细日志

所有操作已经包含日志：

```typescript
✅ [Auth] 认证状态已保存
⏰ [Auth] Access token 已过期或即将过期，尝试自动刷新...
🔄 [Auth] 调用刷新端点...
✅ [Auth] Token 刷新成功，更新本地状态
```

### 检查 localStorage

打开浏览器开发者工具:

```
F12 → Application → LocalStorage → app-auth-state

查看以下字段:
- accessToken
- refreshToken
- user.id
- tokenMeta.accessTokenExpiresIn
- savedAt
```

### 检查 API 调用

```
F12 → Network → Filter "refresh"

应该看到 POST /api/auth/refresh 请求:
- Status: 200
- Response: { accessToken, refreshToken, user, tokenMeta }
```

---

## ✅ 验证清单

- [ ] `npm run build` 编译成功
- [ ] `/api/auth/refresh` 端点可访问
- [ ] 登录后可以调用 `getValidAccessToken()`
- [ ] Token 过期时自动刷新
- [ ] 刷新失败时正确清除状态
- [ ] 多个请求同时刷新不会导致错误

---

## 📞 常见问题

### Q: 为什么 `getValidAccessToken()` 是异步的？

**A**: 因为需要可能调用 `/api/auth/refresh` 这是网络操作。如果做成同步的：

- 阻塞 UI 线程
- 无法处理网络延迟
- 无法正确处理错误

### Q: 为什么保留 `isAuthenticated()` 同步版本？

**A**: 用于 UI 快速判断（如条件渲染），不能等待网络请求。如果需要检查 token 是否可用，应该：

```typescript
if (isAuthenticated()) {
  // 快速决定显示哪个 UI
  const token = await getValidAccessToken();
  // 然后使用 token 发送请求
}
```

### Q: Token 刷新失败后会怎样？

**A**: 系统会：

1. 记录错误日志
2. 清除本地认证状态
3. 下次调用会返回 `null`
4. 应用应该重定向到登录页

### Q: 支持 Refresh Token 轮转吗？

**A**: 当前实现：

- ✅ 返回相同的 refresh token
- 🔄 未来可实现轮转（每次返回新 refresh token）

---

**P1 实现完成** ✅

下一步可考虑 P2 优化（并发控制、预加载等）。
