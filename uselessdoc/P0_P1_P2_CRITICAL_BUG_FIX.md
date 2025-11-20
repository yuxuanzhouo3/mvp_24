# P0/P1/P2 关键 Bug 修复总结

## 问题描述

用户报告：登录后发送 AI 请求时收到 401 错误和"Token 格式错误，部分数: 1"消息。

## 根本原因分析

### 问题 1：`lib/client-auth.ts` 中缺少 `await`

**文件**: `lib/client-auth.ts:21`
**问题**: `getClientAuthToken()` 调用异步函数 `tokenManager.getValidToken()` 但没有 `await`

```typescript
// ❌ 错误
const token = tokenManager.getValidToken(); // 返回 Promise<string | null>

// ✅ 正确
const token = await tokenManager.getValidToken(); // 返回 string | null
```

**结果**: 返回一个 Promise 对象而不是实际的 token，导致 Authorization 头变成 `Bearer [object Promise]`

### 问题 2：`lib/auth/client.ts` 中 `saveAuthState()` 调用缺少错误处理

**文件**: `lib/auth/client.ts:310-328`
**问题**: 调用 `saveAuthState()` 时没有 try-catch，如果保存失败则会导致没有 token 被保存

```typescript
// ❌ 原始代码 - 没有错误处理
await saveAuthState(...);  // 如果异常，进程会中断，备用逻辑不会执行

// ✅ 修复后的代码 - 有完整的错误处理
try {
  saveAuthState(...);
  localStorage.setItem("DEBUG_LOGIN_STEP", "3_auth_state_saved");
} catch (error) {
  // 即使失败也回退到旧格式
  localStorage.setItem("auth-token", data.accessToken);
}
```

**结果**: 登录后如果 P0 保存失败，备用逻辑无法执行，最后没有任何 token 被保存

### 问题 3：旧格式的 localStorage 键没有被清理

**文件**: 全局
**问题**: 用户之前可能用旧代码登录，旧的 `auth-token` 键仍然存在，可能导致系统读取错误的 token
**解决**: 添加 `initAuthStateManager()` 来清理旧键

## 修复列表

### ✅ 修复 1: `lib/client-auth.ts`

添加缺失的 `await`：

```typescript
export async function getClientAuthToken(): Promise<{
  token: string | null;
  error: string | null;
}> {
  try {
    // getValidToken() 是异步的，需要 await
    const token = await tokenManager.getValidToken();  // ✅ 修复
    // ...
  }
}
```

### ✅ 修复 2: `lib/auth/client.ts`

添加完整的错误处理：

```typescript
if (data.accessToken && data.user && typeof window !== "undefined") {
  try {
    const { saveAuthState } = await import("@/lib/auth-state-manager");
    saveAuthState(...);
    localStorage.setItem("DEBUG_LOGIN_STEP", "3_auth_state_saved");
  } catch (error) {
    // 即使失败也回退到旧格式，确保至少保存了一个 token
    console.error("保存认证状态失败:", error);
    localStorage.setItem("auth-token", data.accessToken);
    localStorage.setItem("auth-user", JSON.stringify(data.user));
    localStorage.setItem("auth-logged-in", "true");
    localStorage.setItem("DEBUG_LOGIN_STEP", "3_token_saved_fallback");
  }
}
```

### ✅ 修复 3: `lib/auth-state-manager.ts` 和 `components/user-context.tsx`

添加初始化函数来清理旧键：

```typescript
// lib/auth-state-manager.ts
export function initAuthStateManager(): void {
  if (typeof window === "undefined") return;

  const oldKeys = ["auth-token", "auth-user", "auth-logged-in"];
  const hasP0State = !!localStorage.getItem(AUTH_STATE_KEY);

  if (hasP0State) {
    oldKeys.forEach((key) => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
      }
    });
  }
}

// components/user-context.tsx
useEffect(() => {
  const initializeAuth = () => {
    // 0. 初始化认证管理器（清除旧键）
    initAuthStateManager(); // ✅ 添加此调用
    // ...
  };
}, []);
```

## 关键改变

| 文件                          | 行号    | 改变                               | 原因                     |
| ----------------------------- | ------- | ---------------------------------- | ------------------------ |
| `lib/client-auth.ts`          | 21      | 添加 `await`                       | 修复异步调用             |
| `lib/auth/client.ts`          | 310-328 | 添加 try-catch 错误处理            | 确保失败时也有备用方案   |
| `lib/auth-state-manager.ts`   | 27-45   | 添加 `initAuthStateManager()` 函数 | 清理旧的 localStorage 键 |
| `components/user-context.tsx` | 18, 63  | 添加初始化调用                     | 在应用启动时清理旧键     |

## 测试验证

修复后的流程：

```
1. 用户登录 → POST /api/auth/login
   ├─ 返回: { accessToken: "jwt...", refreshToken: "jwt...", user: {...}, tokenMeta: {...} }
   └─ P0 保存到 localStorage["app-auth-state"]

2. 前端初始化 → UserContext
   ├─ 调用 initAuthStateManager() - 清理旧键
   ├─ 从 localStorage 读取 P0 状态
   └─ 初始化 TokenPreloader

3. 用户发送 AI 请求 → gpt-workspace.tsx
   ├─ 调用 getClientAuthToken()
   ├─ 调用 tokenManager.getValidToken()
   ├─ 调用 getValidAccessToken() - 自动刷新（如果需要）
   ├─ 得到有效的 3 部分 JWT token
   └─ 创建会话成功 ✅

4. 创建会话 → POST /api/chat/sessions
   ├─ 发送 Authorization: Bearer <3-part-jwt>
   ├─ 验证 token 格式 ✅
   ├─ 提取 userId ✅
   └─ 返回 session.id ✅
```

## 已修复的文件

- ✅ `lib/client-auth.ts`
- ✅ `lib/auth/client.ts`
- ✅ `lib/auth-state-manager.ts`
- ✅ `components/user-context.tsx`

## 构建状态

✅ 项目编译成功：`npm run build` 完成

## 下一步

用户应该：

1. 清除 localStorage（F12 → Application → Clear Storage）
2. 重新登录
3. 尝试发送 AI 请求
4. 验证会话是否成功创建
