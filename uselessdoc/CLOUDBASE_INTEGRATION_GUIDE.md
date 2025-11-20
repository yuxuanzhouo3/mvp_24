# CloudBase 国内版集成完整指南

## 概述

本项目已完整集成腾讯云 CloudBase 国内版服务，支持：
- ✅ 微信扫码登录（二维码）
- ✅ 邮箱密码登录/注册
- ✅ CloudBase NoSQL 数据库存储用户信息

## 环境变量配置

在 `.env.local` 或 `.env.production` 中配置以下环境变量：

```bash
# CloudBase 环境配置（必需）
NEXT_PUBLIC_WECHAT_CLOUDBASE_ID=your_cloudbase_env_id
DEPLOY_REGION=CN

# 微信应用配置（必需）
NEXT_PUBLIC_WECHAT_APP_ID=your_wechat_app_id
NEXT_PUBLIC_APP_URL=https://your-domain.com

# 腾讯云凭证（可选，用于服务端操作）
TENCENTCLOUD_SECRET_ID=your_secret_id
TENCENTCLOUD_SECRET_KEY=your_secret_key
```

### 环境变量说明

| 变量名 | 说明 | 必需 | 示例 |
|-------|------|------|------|
| `NEXT_PUBLIC_WECHAT_CLOUDBASE_ID` | CloudBase 环境 ID | ✅ | `mvp24-xx1234xx` |
| `DEPLOY_REGION` | 部署区域 | ✅ | `CN` |
| `NEXT_PUBLIC_WECHAT_APP_ID` | 微信应用 ID | ✅ | `wx1234567890` |
| `NEXT_PUBLIC_APP_URL` | 应用地址 | ✅ | `https://app.example.com` |
| `TENCENTCLOUD_SECRET_ID` | 腾讯云密钥 ID | ❌ | - |
| `TENCENTCLOUD_SECRET_KEY` | 腾讯云密钥 | ❌ | - |

## 功能实现详解

### 1. 微信扫码登录

#### 前端实现

使用 `WechatQrcodeLogin` 组件显示登录二维码：

```tsx
import { WechatQrcodeLogin } from "@/components/wechat-qrcode-login";

export function LoginPage() {
  const handleWechatSuccess = () => {
    console.log("微信登录成功");
    // 重定向到首页
    window.location.href = "/";
  };

  const handleWechatError = (error: string) => {
    console.error("微信登录失败:", error);
  };

  return (
    <WechatQrcodeLogin
      onSuccess={handleWechatSuccess}
      onError={handleWechatError}
    />
  );
}
```

#### 后端实现

**API 端点**: `POST /api/auth/cloudbase-wechat`

请求数据：
```json
{
  "code": "微信授权码"
}
```

响应示例：
```json
{
  "success": true,
  "user": {
    "id": "user_id_from_cloudbase",
    "name": "用户名",
    "avatar": "头像URL",
    "metadata": {
      "openid": "openid",
      "unionid": "unionid",
      "sex": 1,
      "province": "广东",
      "city": "深圳"
    }
  },
  "session": {
    "access_token": "present",
    "refresh_token": "present",
    "expires_at": "2024-11-07T10:00:00Z"
  }
}
```

#### CloudBase 微信登录流程

```
用户                    前端                   后端                  CloudBase
  |                      |                       |                      |
  | 点击微信登录          |                       |                      |
  |--------------------->|                       |                      |
  |                      | 获取二维码URL         |                      |
  |                      |-----GET /qrcode------>|                      |
  |                      |<-----返回URL----------|                      |
  | 扫描二维码            |                       |                      |
  |<--展示二维码----------|                       |                      |
  | 授权确认              |                       |                      |
  |                      | 回调: /auth/callback  |                      |
  |                      | 包含 code 参数        |                      |
  |                      |                       | 验证code           |
  |                      |                       |---signInWithWechat->|
  |                      |                       |<-----返回user-------|
  |                      |                       | 保存user到数据库    |
  |                      |<--返回登录成功--------|                      |
  | 自动跳转到首页        |                       |                      |
  |<--重定向到首页--------|                       |                      |
```

### 2. 邮箱登录

#### 邮箱登录 API

**端点**: `POST /api/auth/login`

请求数据：
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

响应示例（成功）：
```json
{
  "success": true,
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "full_name": "用户名",
    "avatar_url": "头像URL"
  },
  "session": {
    "access_token": "present",
    "refresh_token": "present",
    "expires_at": "2024-11-07T10:00:00Z"
  }
}
```

**实现细节**：
- 使用 CloudBase 的 `signInWithEmailAndPassword()` 方法
- 自动调用 `accountLockout` 防暴力破解
- 登录成功后自动保存用户资料到数据库

#### 邮箱注册 API

**端点**: `POST /api/auth/register`

请求数据：
```json
{
  "email": "user@example.com",
  "password": "password123",
  "fullName": "用户全名",
  "confirmPassword": "password123"
}
```

响应示例（成功）：
```json
{
  "success": true,
  "user": {
    "id": "new_user_id",
    "email": "user@example.com",
    "full_name": "用户全名",
    "avatar_url": null
  },
  "message": "Registration successful. You can now log in.",
  "region": "CN"
}
```

**实现细节**：
- 密码强度验证（最少 8 个字符，包含大小写、数字等）
- 邮箱去重检查
- 注册成功后自动创建用户资料记录

### 3. 数据库集成

#### CloudBase 数据库适配器

使用统一的数据库适配器接口，自动选择 CloudBase：

```typescript
import { getDatabase } from "@/lib/database/adapter";

const db = getDatabase();

// 查询数据
const profiles = await db.query("user_profiles", { email: "user@example.com" });

// 插入数据
const newProfile = await db.insert("user_profiles", {
  id: "user_id",
  email: "user@example.com",
  name: "用户名",
  status: "active",
  createdAt: new Date(),
});

// 更新数据
const updated = await db.update("user_profiles", "user_id", {
  lastLoginAt: new Date(),
  loginCount: 5,
});

// 按 ID 查询
const profile = await db.getById("user_profiles", "user_id");

// 删除数据
await db.delete("user_profiles", "user_id");
```

#### 用户资料模型

**表名**: `user_profiles`

**数据结构**：
```typescript
interface UserProfile {
  // 基本信息
  id: string;                    // 用户 ID（CloudBase uid）
  email?: string;                // 邮箱
  phone?: string;                // 电话
  name?: string;                 // 昵称
  avatar?: string;               // 头像 URL
  gender?: "male" | "female" | "other";
  birthDate?: string;            // 出生日期

  // 认证信息
  authProvider?: "wechat" | "email" | "google" | "github";
  wechatOpenId?: string;         // 微信 OpenID
  wechatUnionId?: string;        // 微信 UnionID

  // 账户状态
  status?: "active" | "inactive" | "suspended";
  emailVerified?: boolean;       // 邮箱验证
  phoneVerified?: boolean;       // 电话验证

  // 个人信息
  bio?: string;                  // 个人简介
  location?: string;             // 位置
  website?: string;              // 网站

  // 登录统计
  lastLoginAt?: Date;            // 最后登录时间
  lastLoginIp?: string;          // 最后登录 IP
  loginCount?: number;           // 登录次数

  // 时间戳
  createdAt?: Date;              // 创建时间
  updatedAt?: Date;              // 更新时间
  metadata?: Record<string, any>; // 自定义数据
}
```

#### CloudBase 默认表

项目可以使用 CloudBase 提供的默认表：

- `sys_user` - 系统用户表
- `sys_department` - 部门表
- `relation_data_depart` - 关联数据表

查询示例：
```typescript
const users = await db.query("sys_user", { status: 1 });
const departments = await db.query("sys_department");
```

## 完整流程示例

### 微信登录完整流程

1. **前端显示二维码**
   ```tsx
   <WechatQrcodeLogin onSuccess={() => router.push("/")} />
   ```

2. **用户扫描二维码**
   - 微信跳转到应用回调地址
   - 带上 `code` 参数

3. **后端处理**
   ```
   POST /api/auth/cloudbase-wechat
   { "code": "auth_code_from_wechat" }
   ```

4. **CloudBase 验证并登录**
   ```typescript
   const result = await auth.signInWithWechat(code);
   ```

5. **保存用户资料**
   ```typescript
   const db = getDatabase();
   await db.insert("user_profiles", userProfile);
   ```

6. **前端自动跳转**
   - 等待 user-context 更新
   - 自动跳转到首页

### 邮箱登录完整流程

1. **用户输入邮箱密码**
   ```tsx
   <form onSubmit={handleEmailLogin}>
     <input type="email" value={email} />
     <input type="password" value={password} />
     <button type="submit">登录</button>
   </form>
   ```

2. **发送登录请求**
   ```typescript
   const response = await fetch("/api/auth/login", {
     method: "POST",
     body: JSON.stringify({ email, password }),
   });
   ```

3. **后端处理**
   - 检查账户锁定状态
   - 调用 CloudBase 验证
   - 保存/更新用户资料

4. **前端处理响应**
   - 成功：user-context 自动更新，跳转首页
   - 失败：显示错误信息

## 错误处理

### 常见错误及解决方案

| 错误 | 原因 | 解决方案 |
|------|------|--------|
| `UNSUPPORTED_AUTH_METHOD` | 不是中国区域 | 检查 `DEPLOY_REGION=CN` |
| `VALIDATION_ERROR` | 输入数据格式错误 | 检查请求参数 |
| `WECHAT_LOGIN_FAILED` | 微信授权码无效或过期 | 重新扫码登录 |
| `EMAIL_EXISTS` | 邮箱已注册 | 使用其他邮箱或找回密码 |
| `WEAK_PASSWORD` | 密码强度不足 | 使用更复杂的密码 |
| `ACCOUNT_LOCKED` | 登录尝试次数过多 | 等待 15 分钟后重试 |

### 错误响应格式

```json
{
  "error": "错误描述",
  "code": "ERROR_CODE",
  "details": "详细错误信息（可选）",
  "remainingAttempts": 2
}
```

## 测试步骤

### 1. 测试邮箱注册

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Password123!",
    "confirmPassword": "Password123!",
    "fullName": "Test User"
  }'
```

### 2. 测试邮箱登录

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Password123!"
  }'
```

### 3. 测试微信登录二维码

```bash
curl http://localhost:3000/api/auth/cloudbase-wechat/qrcode
```

### 4. 测试数据库操作

在 API 路由或服务器端代码中测试：

```typescript
import { getDatabase } from "@/lib/database/adapter";

const db = getDatabase();

// 测试查询
const users = await db.query("user_profiles", { status: "active" });
console.log("查询结果:", users);

// 测试插入
const newUser = await db.insert("user_profiles", {
  id: "test_user_id",
  email: "test@cloudbase.com",
  name: "测试用户",
  status: "active",
  createdAt: new Date(),
});
console.log("插入结果:", newUser);

// 测试更新
const updated = await db.update("user_profiles", "test_user_id", {
  name: "更新后的名称",
  updatedAt: new Date(),
});
console.log("更新结果:", updated);

// 测试查询单条
const user = await db.getById("user_profiles", "test_user_id");
console.log("查询单条:", user);

// 测试删除
await db.delete("user_profiles", "test_user_id");
console.log("删除完成");
```

## 架构图

```
┌─────────────────────────────────────────────┐
│           Next.js 应用（国内版）             │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────────┐                      │
│  │   登录页面       │                      │
│  │  - 微信扫码     │                      │
│  │  - 邮箱密码     │                      │
│  └────────┬─────────┘                      │
│           │                                 │
│  ┌────────▼──────────────────────┐         │
│  │     认证 API 层               │         │
│  │  - /api/auth/login           │         │
│  │  - /api/auth/register        │         │
│  │  - /api/auth/cloudbase-wechat│         │
│  └────────┬───────────────────────┘         │
│           │                                 │
│  ┌────────▼──────────────────────┐         │
│  │   认证适配器层                │         │
│  │   (lib/auth/adapter.ts)      │         │
│  │  - CloudBase 认证方法        │         │
│  └────────┬───────────────────────┘         │
│           │                                 │
│  ┌────────▼──────────────────────┐         │
│  │   数据库适配器层              │         │
│  │  (lib/database/adapter.ts)   │         │
│  │  - CloudBase 数据库操作      │         │
│  └────────┬───────────────────────┘         │
│           │                                 │
└───────────┼─────────────────────────────────┘
            │
            │ 网络请求
            │
┌───────────▼─────────────────────────────────┐
│        腾讯云 CloudBase                      │
├─────────────────────────────────────────────┤
│                                             │
│  ┌────────────────┐  ┌─────────────────┐  │
│  │  认证服务      │  │   数据库        │  │
│  │ - 微信登录    │  │ - user_profiles │  │
│  │ - 邮箱登录    │  │ - sys_user      │  │
│  │ - 密钥管理    │  │ - sys_department│  │
│  └────────────────┘  └─────────────────┘  │
│                                             │
└─────────────────────────────────────────────┘
```

## 常见问题

### Q: 微信登录二维码显示不出来？

A: 检查以下几点：
1. 确保 `NEXT_PUBLIC_WECHAT_APP_ID` 已配置
2. 确保 `NEXT_PUBLIC_APP_URL` 指向正确的域名
3. 微信应用的回调 URL 需要配置为 `https://your-domain/auth/callback`
4. 检查浏览器控制台是否有错误信息

### Q: 邮箱登录失败，提示"Email already registered"？

A: 这表示该邮箱已经注册过。选项：
1. 使用其他邮箱注册
2. 使用该邮箱登录（如果记得密码）
3. 联系管理员重置账户

### Q: 数据库操作返回空数组？

A: 可能的原因：
1. CloudBase 环境 ID 配置错误
2. 凭证不足（无读权限）
3. 表中确实没有数据

检查：
```typescript
// 检查 CloudBase 初始化
const db = getDatabase();
console.log("数据库实例:", db);

// 检查表名是否正确
const result = await db.query("user_profiles");
console.log("查询结果:", result);
```

### Q: 怎样在本地测试？

A:
1. 使用本地 CloudBase 模拟器（如果可用）
2. 或配置一个测试 CloudBase 环境
3. 在 `.env.local` 中设置测试环境变量

## 安全建议

1. **环境变量**
   - 不要在版本控制中提交 `.env.local`
   - 生产环境使用腾讯云 CI/CD 密钥管理

2. **微信登录**
   - 验证回调的 state 参数防止 CSRF
   - 定期更新微信应用凭证

3. **邮箱登录**
   - 启用账户锁定保护
   - 设置强密码要求
   - 支持邮箱验证和二次认证

4. **数据库**
   - 配置适当的读写权限
   - 定期备份 CloudBase 数据
   - 监控数据库访问日志

## 相关文件

- 认证适配器：[lib/auth/adapter.ts](lib/auth/adapter.ts)
- 数据库适配器：[lib/database/adapter.ts](lib/database/adapter.ts)
- 邮箱登录 API：[app/api/auth/login/route.ts](app/api/auth/login/route.ts)
- 邮箱注册 API：[app/api/auth/register/route.ts](app/api/auth/register/route.ts)
- 微信登录 API：[app/api/auth/cloudbase-wechat/route.ts](app/api/auth/cloudbase-wechat/route.ts)
- 微信二维码组件：[components/wechat-qrcode-login.tsx](components/wechat-qrcode-login.tsx)
- 用户模型：[lib/models/user.ts](lib/models/user.ts)

## 后续工作

- [ ] 添加邮箱验证功能
- [ ] 实现忘记密码流程
- [ ] 支持第三方社交登录（QQ、支付宝等）
- [ ] 添加二次认证（2FA）
- [ ] 数据库权限细粒度控制
- [ ] 详细的审计日志

