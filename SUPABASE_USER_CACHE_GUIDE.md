# Supabase User Cache 本地数据库说明

## 概述

`supabase-user-cache` 是一个**浏览器 localStorage 缓存机制**，用于 **国际版（INTL）** 的用户信息管理。目的是提高页面加载速度和支持跨标签页同步。

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      用户访问应用                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                    ┌────▼─────────────────────────────────┐
                    │  UserContext (useUser hook)          │
                    │  ├─ user: UserProfile | null         │
                    │  ├─ loading: boolean                 │
                    │  └─ refreshUser(): Promise           │
                    └────┬─────────────────────────────────┘
                         │
        ┌────────────────┼───────────────────┐
        │                │                   │
        ▼                ▼                   ▼
    ┌─────────┐   ┌──────────────┐   ┌────────────────┐
    │缓存(1h) │   │Supabase Auth │   │ /api/profile   │
    │localStorage │   │ Session      │   │ API 端点       │
    └─────────┘   └──────────────┘   └────────────────┘
```

## 数据流向

### 1. 应用启动时的数据获取流程

```
应用启动
  │
  ├─ useEffect (initializeAuth)
  │   │
  │   ├─ 判断是否国际版 (isChinaRegion)
  │   │   │
  │   │   ├─ 是 (CN): getStoredAuthState() → CloudBase
  │   │   │
  │   │   └─ 否 (INTL):
  │   │       ├─ getSupabaseUserCache() → 检查 localStorage
  │   │       │   │
  │   │       │   ├─ ✅ 缓存存在且有效 → 立即使用
  │   │       │   │
  │   │       │   └─ ❌ 缓存不存在或已过期
  │   │       │       └─ supabase.auth.getSession() → Supabase Session
  │   │       │
  │   │       └─ 将用户信息保存到 localStorage
  │   │
  │   └─ setUser() → 更新 React State
  │
  └─ 页面加载完成，用户信息可用
```

## 核心文件

### 1. `lib/auth-state-manager-intl.ts` - 缓存管理器

**作用**: 管理 localStorage 中的用户缓存

**核心函数**:

```typescript
// 保存用户信息到缓存
saveSupabaseUserCache(user, expiresIn = 3600)
  └─ 只保存: id, email, name, avatar, subscription_plan, status, membership_expires_at
  └─ 缓存有效期: 1小时 (3600秒)

// 获取缓存的用户信息
getSupabaseUserCache(): SupabaseUserProfile | null
  ├─ 检查缓存是否存在
  ├─ 验证缓存数据完整性 (id 和 email 必须存在)
  ├─ 检查缓存是否过期
  └─ 返回用户对象或 null

// 清除缓存
clearSupabaseUserCache()

// 检查缓存是否有效
isSupabaseCacheValid(): boolean

// 更新缓存中的部分字段
updateSupabaseUserCache(updates)
```

**localStorage 键名**:
```
"supabase-user-cache"
```

**缓存数据结构**:
```typescript
{
  user: {
    id: string,              // 用户UUID
    email: string,           // 邮箱
    name?: string,           // 用户名
    avatar?: string,         // 头像URL
    subscription_plan?: string,      // 订阅计划 (pro/team/free)
    subscription_status?: string,    // 订阅状态 (active/canceled)
    membership_expires_at?: string   // 会员过期时间
  },
  cachedAt: number,          // 缓存时间戳 (毫秒)
  expiresIn: number          // 缓存有效期 (秒)
}
```

### 2. `components/user-context.tsx` - React Context

**作用**: 提供全局用户信息和认证状态

**核心流程**:

```typescript
// 1. 初始化阶段 (P0)
useEffect(() => {
  initializeAuth()
}, [])
  ├─ 优先从缓存读取 (localStorage)
  ├─ 缓存未命中则从 Supabase Session 读取
  ├─ setUser() 立即更新 UI
  └─ 标记初始化完成

// 2. 跨标签页同步 (P1)
useEffect(() => {
  addEventListener("storage") // 监听 localStorage 变化
}, [])
  └─ 其他标签页修改 "supabase-user-cache" → 同步更新

// 3. 同标签页内同步 (P1)
useEffect(() => {
  addEventListener("supabase-user-changed") // 自定义事件
}, [])
  └─ 同一标签页内用户信息变化 → 实时更新

// 4. Supabase 状态变化监听 (INTL only)
useEffect(() => {
  supabase.auth.onAuthStateChange()
}, [])
  └─ Supabase 检测到用户登录/登出 → 更新 UI

// 5. 刷新用户信息
refreshUser()
  ├─ 调用 /api/profile API 获取最新信息
  ├─ 更新 React State
  └─ 同时保存到 localStorage 缓存
```

## 数据获取源

### 优先级顺序 (INTL版本)

1. **localStorage 缓存** (速度最快，但可能过期)
   - 来源: `supabase-user-cache` key
   - 有效期: 1小时
   - 在应用启动时首先尝试读取

2. **Supabase Session** (实时，但需要网络)
   - 来源: `supabase.auth.getSession()`
   - 仅在缓存未命中时调用
   - 包含: 用户ID、邮箱、user_metadata (name, avatar等)

3. **API 端点** `/api/profile` (最新信息)
   - 来源: `refreshUser()` 调用
   - 用途: 获取完整用户信息 (包括订阅状态等)
   - 需要认证 Token

## 获取用户信息的方法

### 方法1: 使用 useUser Hook (推荐)

```typescript
import { useUser } from "@/components/user-context";

function MyComponent() {
  const { user, loading, isAuthInitialized, refreshUser } = useUser();

  if (loading) return <div>加载中...</div>;
  if (!user) return <div>未登录</div>;

  return (
    <div>
      <p>用户: {user.email}</p>
      <p>订阅: {user.subscription_plan}</p>
      <button onClick={refreshUser}>刷新信息</button>
    </div>
  );
}
```

### 方法2: 直接访问缓存

```typescript
import { getSupabaseUserCache } from "@/lib/auth-state-manager-intl";

const cachedUser = getSupabaseUserCache();
if (cachedUser) {
  console.log("缓存用户:", cachedUser);
} else {
  console.log("缓存未命中");
}
```

### 方法3: 更新用户信息

```typescript
import { updateSupabaseUserCache } from "@/lib/auth-state-manager-intl";

// 支付后更新订阅信息
updateSupabaseUserCache({
  subscription_plan: "pro",
  subscription_status: "active",
  membership_expires_at: "2025-11-20T12:00:00Z"
});
```

## 缓存有效期管理

### 缓存过期检查

```typescript
// 获取缓存的剩余有效时间 (秒)
const remaining = getCacheRemainingTime();
console.log(`缓存还有 ${remaining} 秒过期`);

// 检查缓存是否仍然有效
const isValid = isSupabaseCacheValid();
```

### 缓存过期的自动处理

当缓存过期时:
1. `getSupabaseUserCache()` 返回 `null`
2. 应用自动从 Supabase Session 读取
3. 如果需要完整信息，调用 `refreshUser()` 从 `/api/profile` 获取

## 跨标签页同步机制

### 1. Storage Event 监听 (标签页间同步)

```typescript
// 当一个标签页更新 localStorage 时，其他标签页监听到事件
addEventListener("storage", (event) => {
  if (event.key === "supabase-user-cache") {
    // 其他标签页更新了缓存 → 同步当前标签页
    const updatedCache = JSON.parse(event.newValue);
    setUser(updatedCache.user);
  }
});
```

### 2. Custom Event 监听 (标签页内同步)

```typescript
// 当缓存更新时，同一标签页内的所有监听器都能收到通知
window.dispatchEvent(
  new CustomEvent("supabase-user-changed", {
    detail: sanitizedUser
  })
);

// 监听此事件
addEventListener("supabase-user-changed", (event) => {
  setUser(event.detail);
});
```

## 安全考虑

### 已缓存的字段 ✅

```typescript
{
  id,                        // 用户UUID
  email,                     // 邮箱地址
  name,                      // 用户名
  avatar,                    // 头像URL
  subscription_plan,         // 订阅计划
  subscription_status,       // 订阅状态
  membership_expires_at      // 会员过期时间
}
```

### 不缓存的字段 🔒

```typescript
// ❌ 敏感信息不会保存到 localStorage:
- app_metadata        // 应用元数据
- identities          // 身份信息
- providers           // 认证提供商ID
- session tokens      // 会话令牌
- refresh tokens      // 刷新令牌
```

## 常见场景

### 场景1: 用户登录

```
用户点击登录
  ↓
Supabase auth state changed
  ↓
onAuthStateChange() 触发
  ↓
setUser() + saveSupabaseUserCache()
  ↓
用户信息可用，UI 更新
```

### 场景2: 用户完成支付

```
支付完成
  ↓
refreshUser() 调用 /api/profile
  ↓
获取最新的订阅信息
  ↓
saveSupabaseUserCache() 保存更新
  ↓
其他标签页通过 storage event 同步
```

### 场景3: 页面刷新

```
用户刷新页面
  ↓
UserProvider 初始化
  ↓
getSupabaseUserCache() 从 localStorage 读取
  ↓
✅ 缓存有效 → 立即显示用户信息（无闪烁）
❌ 缓存过期 → 从 Supabase Session 读取
```

## 故障排查

### 问题1: 用户信息显示为空

**检查项**:
```javascript
// 1. 检查缓存是否存在
const cached = localStorage.getItem("supabase-user-cache");
console.log("缓存数据:", cached);

// 2. 检查缓存是否有效
import { isSupabaseCacheValid } from "@/lib/auth-state-manager-intl";
console.log("缓存有效:", isSupabaseCacheValid());

// 3. 检查 Supabase 会话
const { data } = await supabase.auth.getSession();
console.log("Supabase Session:", data.session);

// 4. 检查 useUser hook
const { user, loading } = useUser();
console.log("User:", user, "Loading:", loading);
```

### 问题2: 支付后信息未更新

**解决方案**:
```typescript
// 支付成功后手动刷新
const { refreshUser } = useUser();
await refreshUser();

// 或者直接更新缓存
import { updateSupabaseUserCache } from "@/lib/auth-state-manager-intl";
updateSupabaseUserCache({
  subscription_status: "active",
  membership_expires_at: newExpiryDate
});
```

### 问题3: 跨标签页不同步

**检查**:
```javascript
// 1. 开启浏览器开发者工具 Console
// 2. 在一个标签页执行:
const { updateSupabaseUserCache } = await import("@/lib/auth-state-manager-intl");
updateSupabaseUserCache({ name: "Test" });

// 3. 检查其他标签页是否自动更新
// 4. 查看 Console 日志中是否有 "📡 [Auth INTL] 检测到其他标签页的用户信息变化" 日志
```

## 性能优化

### 缓存有效期 (1小时)

- ✅ 足够长: 避免频繁的网络请求
- ✅ 足够短: 确保用户信息相对新鲜

### 缓存大小

- 仅缓存 UI 需要的最小字段
- 典型缓存大小: ~500 bytes
- 不会对性能造成影响

### 首屏加载

```
无缓存 (cold start)     有缓存 (warm start)
─────────────────      ──────────────────
1. 读取 Session  (50ms)  1. 读取 localStorage  (1ms)
2. 刷新用户信息 (200ms)  2. 验证有效性        (1ms)
─────────────────      ──────────────────
总耗时: ~250ms         总耗时: ~2ms (快 125 倍!)
```

## 总结

| 方面 | 说明 |
|------|------|
| **缓存位置** | 浏览器 localStorage |
| **缓存键** | `supabase-user-cache` |
| **有效期** | 1小时 (3600秒) |
| **数据来源** | Supabase Auth + `/api/profile` API |
| **同步方式** | storage event + custom event |
| **适用版本** | 国际版 (INTL) 仅 |
| **安全性** | 仅缓存非敏感信息 |
