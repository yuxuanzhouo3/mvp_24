# 缓存刷新实现完整指南

## 概述

本文档描述了支付成功后和个人资料保存时的缓存刷新完整流程，确保用户信息在所有标签页和前端状态中保持一致。

## 架构设计

### 国际版（INTL）缓存管理

```
支付成功页面 (payment/success/page.tsx)
    ↓
refreshUser() [user-context.tsx]
    ↓
fetch(/api/profile) + tokenManager.getAuthHeaderAsync()
    ↓
saveSupabaseUserCache() [auth-state-manager-intl.ts]
    ↓
localStorage + 广播 supabase-user-changed 事件
    ↓
其他标签页同时更新 (storage 事件监听)
```

### 中国版（CN）缓存管理

```
支付成功/个人资料保存
    ↓
API 更新 web_users 表
    ↓
前端调用 refreshUser()
    ↓
saveAuthState() [auth-state-manager.ts]
    ↓
localStorage app-auth-state 键
    ↓
其他标签页同步 (storage 事件监听)
```

## 实现细节

### 1. 支付成功流程中的缓存刷新

**文件**: `app/payment/success/page.tsx`

```tsx
// 支付确认成功后
const result = await response.json();

if (result.success) {
  // 标记为已处理，防止重复调用
  setHasProcessed(true);

  // 🔑 关键修复：刷新用户信息以反映新的会员状态
  try {
    await refreshUser(); // 调用 user-context 中的刷新方法
    console.log("✅ 用户信息已刷新，会员状态已更新");
  } catch (refreshError) {
    console.warn("⚠️ 刷新用户信息失败，但支付已成功:", refreshError);
  }

  setPaymentStatus("success");
}
```

### 2. refreshUser() 的完整实现

**文件**: `components/user-context.tsx`

**关键改进**: 支持国际版缓存保存

```tsx
const refreshUser = useCallback(async () => {
  try {
    console.log("🔄 [Auth] 刷新用户信息...");

    // 获取认证头
    const { tokenManager } = await import("@/lib/frontend-token-manager");
    const headers = await tokenManager.getAuthHeaderAsync();
    if (!headers) {
      console.warn("⚠️ [Auth] 无法获取认证信息");
      return;
    }

    // 从后端获取最新用户信息
    const response = await fetch("/api/profile", { headers });
    if (!response.ok) {
      throw new Error(`刷新用户信息失败: ${response.status}`);
    }

    const updatedUser = await response.json();
    setUser(updatedUser as UserProfile);

    // ✅ 国际版：同时保存到缓存，确保其他标签页也能同步
    if (!isChinaRegion()) {
      try {
        const { saveSupabaseUserCache } = await import(
          "@/lib/auth-state-manager-intl"
        );
        saveSupabaseUserCache(updatedUser);
        console.log("✅ [Auth INTL] 用户信息已缓存");
      } catch (cacheError) {
        console.warn(
          "⚠️ [Auth INTL] 缓存保存失败，但用户信息已更新:",
          cacheError
        );
      }
    }

    console.log("✅ [Auth] 用户信息已刷新");
  } catch (error) {
    console.error("❌ [Auth] 刷新用户信息失败:", error);
  }
}, []);
```

### 3. 个人资料保存时的缓存刷新

**文件**: `app/profile/page.tsx`

**关键改进**: 同时更新国际版和中国版缓存

```tsx
const handleSave = async () => {
  // ... 保存逻辑 ...

  const result = await response.json();
  setUser(result);
  setSuccess(t.profile.saved);

  // 更新缓存和认证状态中的用户信息
  if (typeof window !== "undefined") {
    try {
      const { isChinaRegion } = await import("@/lib/config/region");

      if (isChinaRegion()) {
        // 中国版：使用本地认证状态管理器
        const { getStoredAuthState, saveAuthState } = await import(
          "@/lib/auth-state-manager"
        );
        const authState = getStoredAuthState();

        if (authState) {
          const updatedUser = {
            ...authState.user,
            name: result.name,
            avatar: result.avatar,
            // ... 其他字段 ...
          };

          saveAuthState(
            authState.accessToken,
            authState.refreshToken,
            updatedUser,
            authState.tokenMeta
          );

          console.log("✅ [CN] 已更新认证状态中的用户信息");
        }
      } else {
        // 国际版：使用 Supabase 缓存管理器
        const { saveSupabaseUserCache } = await import(
          "@/lib/auth-state-manager-intl"
        );
        saveSupabaseUserCache(result);
        console.log("✅ [INTL] 已更新国际版用户缓存，支持跨标签页同步");
      }
    } catch (e) {
      console.error("❌ 更新缓存失败:", e);
    }
  }
};
```

### 4. Webhook 中的用户信息更新

**文件**: `lib/payment/webhook-handler.ts` (第 2535 行)

```typescript
if (subscription) {
  // 更新用户资料 - 确保状态一致性
  const { error: profileError } = await supabaseAdmin
    .from("user_profiles")
    .update({
      subscription_plan: subscription.plan_id,
      subscription_status: status,
      updated_at: now.toISOString(),
    })
    .eq("id", userId);

  if (!profileError) {
    logBusinessEvent("user_profile_updated", userId, {
      operationId,
      subscriptionPlan: subscription.plan_id,
      subscriptionStatus: status,
    });
  }
}
```

## 缓存同步机制

### 多标签页同步

**国际版**: `auth-state-manager-intl.ts`

```typescript
// localStorage 键
const SUPABASE_USER_CACHE_KEY = "supabase-user-cache";

// 保存缓存并触发事件
function saveSupabaseUserCache(user: UserProfile) {
  localStorage.setItem(SUPABASE_USER_CACHE_KEY, JSON.stringify({ user }));
  // 触发自定义事件供其他标签页监听
  window.dispatchEvent(
    new CustomEvent("supabase-user-changed", { detail: user })
  );
}
```

**中国版**: `auth-state-manager.ts`

```typescript
// localStorage 键
const AUTH_STATE_KEY = "app-auth-state";

// 自动触发 storage 事件
localStorage.setItem(AUTH_STATE_KEY, JSON.stringify(authState));
```

### 标签页监听

**user-context.tsx** 中的监听代码：

```tsx
// 监听 localStorage 变化（其他标签页）
useEffect(() => {
  const handleStorageChange = (event: StorageEvent) => {
    if (isChinaRegion()) {
      if (event.key === "app-auth-state") {
        console.log("📡 [Auth CN] 检测到其他标签页的认证变化");
        // 同步用户信息
      }
    } else {
      if (event.key === "supabase-user-cache") {
        console.log("📡 [Auth INTL] 检测到其他标签页的用户信息变化");
        // 同步用户信息
      }
    }
  };

  window.addEventListener("storage", handleStorageChange);
  return () => window.removeEventListener("storage", handleStorageChange);
}, []);

// 监听自定义事件（同标签页内的 INTL 更新）
useEffect(() => {
  if (!isChinaRegion()) {
    const handleSupabaseUserChanged = (event: CustomEvent) => {
      console.log("🔔 [Auth INTL] 检测到同标签页内用户信息变化");
      if (event.detail) {
        setUser(event.detail as UserProfile);
      }
    };

    window.addEventListener(
      "supabase-user-changed",
      handleSupabaseUserChanged as EventListener
    );

    return () => {
      window.removeEventListener(
        "supabase-user-changed",
        handleSupabaseUserChanged as EventListener
      );
    };
  }
}, []);
```

## 完整流程时序图

### 支付成功场景

```
1. 用户完成支付
   ↓
2. 重定向到 payment/success/page.tsx
   ↓
3. 确认支付 API → /api/payment/onetime/confirm
   ↓
4. 调用 refreshUser() [user-context]
   ↓
5. Fetch /api/profile (带认证头)
   ↓
6. 获取最新用户信息 (含 membership_expires_at)
   ↓
7. setUser(updatedUser)
   ↓
8. saveSupabaseUserCache(updatedUser) [国际版]
   ↓
9. localStorage + 事件广播
   ↓
10. 其他标签页监听 storage 事件同步
   ↓
11. UI 更新：显示新的会员状态
```

### 个人资料保存场景

```
1. 用户编辑个人资料
   ↓
2. 点击"保存"按钮
   ↓
3. POST /api/profile
   ↓
4. 更新 Supabase user_metadata [国际版]
   ↓
5. 返回更新后的用户信息
   ↓
6. setUser(result)
   ↓
7. saveSupabaseUserCache(result) [国际版]
   或 saveAuthState(...) [中国版]
   ↓
8. localStorage 更新 + 事件广播
   ↓
9. 其他标签页同步
   ↓
10. UI 更新：个人资料变化生效
```

## 调试指南

### 检查缓存是否正确更新

```javascript
// 打开浏览器控制台，检查国际版缓存
console.log(JSON.parse(localStorage.getItem("supabase-user-cache")));

// 检查中国版缓存
console.log(JSON.parse(localStorage.getItem("app-auth-state")));
```

### 监听缓存更新事件

```javascript
// 国际版：监听自定义事件
window.addEventListener("supabase-user-changed", (e) => {
  console.log("🔔 用户信息更新:", e.detail);
});

// 监听 storage 事件
window.addEventListener("storage", (e) => {
  console.log("📡 Storage 变化:", e.key, e.newValue);
});
```

### 常见问题排查

| 问题                     | 原因                                       | 解决方案                                                   |
| ------------------------ | ------------------------------------------ | ---------------------------------------------------------- |
| 支付成功后用户信息未更新 | refreshUser() 未被调用                     | 检查 payment/success/page.tsx 中是否有 await refreshUser() |
| 其他标签页未同步         | 缓存未正确保存                             | 检查 localStorage 中是否有对应的缓存键                     |
| 会员期限未更新           | /api/profile GET 未从 subscriptions 表读取 | 检查 api/profile/route.ts 中是否查询了 subscriptions 表    |
| 个人资料保存后图片未显示 | 缓存未更新                                 | 检查 profile/page.tsx 中的 saveSupabaseUserCache() 调用    |

## 性能考虑

1. **缓存一致性**: 每次更新都同时更新内存状态和 localStorage，确保一致性
2. **网络效率**: refreshUser() 使用已有的认证头，复用 tokenManager 的逻辑
3. **跨域考虑**: Supabase 缓存通过 localStorage 共享，自动支持同源的多标签页
4. **错误恢复**: 缓存保存失败不阻止业务逻辑继续，保障用户体验

## 总结

- ✅ 支付成功 → 自动刷新用户信息
- ✅ 个人资料保存 → 自动更新缓存
- ✅ 国际版和中国版都支持
- ✅ 多标签页自动同步
- ✅ 完善的错误处理和日志记录
