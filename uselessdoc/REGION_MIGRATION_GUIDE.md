# 🔄 区域适配迁移指南

## 问题诊断

你的项目中前端组件直接使用了 `supabase` 客户端，导致即使设置 `DEPLOY_REGION=CN` 也仍然使用国际版服务。

## 解决方案

### 1. 使用新的认证客户端

**旧代码（直接使用 supabase）：**

```tsx
import { supabase } from "@/lib/supabase";

// 登录
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password,
});

// 获取用户
const {
  data: { user },
} = await supabase.auth.getUser();

// 登出
await supabase.auth.signOut();
```

**新代码（使用适配器）：**

```tsx
import { getAuthClient } from "@/lib/auth/client";

const authClient = getAuthClient();

// 登录
const { data, error } = await authClient.signInWithPassword({
  email,
  password,
});

// 获取用户
const {
  data: { user },
} = await authClient.getUser();

// 登出
await authClient.signOut();
```

### 2. 需要更新的文件

以下文件需要从 `supabase` 迁移到 `getAuthClient()`：

#### 前端组件

- [ ] `components/user-context.tsx` - 用户上下文
- [ ] `components/user-menu.tsx` - 用户菜单
- [ ] `components/workspace-context.tsx` - 工作区上下文
- [ ] `app/auth/page.tsx` - 登录页面
- [ ] `app/auth-test/page.tsx` - 认证测试页面
- [ ] `app/profile/page.tsx` - 个人资料页面
- [ ] `app/payment/success/page.tsx` - 支付成功页面

#### API 路由（已完成）

- [x] `app/api/auth/login/route.ts` - 登录 API
- [x] `app/api/auth/wechat/route.ts` - 微信登录 API
- [x] `app/api/auth/logout/route.ts` - 登出 API（新创建）
- [x] `app/api/auth/me/route.ts` - 获取用户 API（新创建）
- [x] `app/api/payment/create/route.ts` - 创建支付
- [x] `app/api/payment/verify/route.ts` - 验证支付
- [x] `app/api/ai/chat/route.ts` - AI 聊天

### 3. 迁移步骤

#### 步骤 1: 更新导入

```tsx
// 删除
import { supabase } from "@/lib/supabase";

// 添加
import { getAuthClient } from "@/lib/auth/client";
```

#### 步骤 2: 创建客户端实例

```tsx
const authClient = getAuthClient();
```

#### 步骤 3: 替换所有 `supabase.auth` 调用

```tsx
// 旧: supabase.auth.signInWithPassword(...)
// 新: authClient.signInWithPassword(...)

// 旧: supabase.auth.getUser()
// 新: authClient.getUser()

// 旧: supabase.auth.signOut()
// 新: authClient.signOut()
```

### 4. 中国区域特殊处理

在中国区域（`DEPLOY_REGION=CN`），邮箱登录会返回错误，提示用户使用微信登录：

```tsx
const { data, error } = await authClient.signInWithPassword({
  email,
  password,
});

if (error) {
  // error.message: "Email/password authentication is not supported in China region. Please use WeChat login."
  // 显示微信登录按钮
}
```

### 5. 验证迁移

迁移完成后，在浏览器控制台应该看到：

**国际版 (`DEPLOY_REGION=INTL`):**

```
🔐 使用 Supabase 认证客户端（国际版）
```

**中国版 (`DEPLOY_REGION=CN`):**

```
🔐 使用 CloudBase 认证客户端（中国版）
```

## 快速测试

```bash
# 1. 设置环境变量
# .env.local 中设置: DEPLOY_REGION=CN

# 2. 重启开发服务器
pnpm run dev

# 3. 访问登录页面
# http://localhost:3000/auth

# 4. 尝试邮箱登录
# 应该看到错误提示使用微信登录

# 5. 检查API配置
# http://localhost:3000/api/config/region
# 应该返回 deployRegion: "CN"
```

## 支付系统检查

支付系统的 API 路由已经更新使用适配器，但前端支付页面可能还需要更新。检查这些文件：

- `app/payment/page.tsx` - 支付页面
- `components/payment-*.tsx` - 支付相关组件

确保它们使用 `/api/payment/create` API 而不是直接调用支付提供商。
