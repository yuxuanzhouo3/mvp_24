# 数据库外键约束修复指南

## 问题描述

当用户尝试创建会话时，收到以下错误：
```
Failed to create session in Supabase: {
  code: '23503',
  details: 'Key (user_id)=(9f4cb8b2-dfc0-4285-9f7a-77cd95f3bf56) is not present in table "user_profiles".'
}
```

**根本原因**：
- `gpt_sessions` 表的 `user_id` 字段引用 `user_profiles(id)` 外键
- 但你使用 Supabase 的 `auth.users` 管理用户认证
- 当用户登录时，只在 `auth.users` 中创建记录，不会自动在 `user_profiles` 中创建记录
- 因此当 `gpt_sessions` 尝试插入时，找不到对应的 `user_profiles` 记录

## 当前架构问题

```
auth.users (Supabase 认证系统管理)
    ↓
    ↓ (应该直接引用，但目前间接引用)
    ↓
user_profiles (基本没有实际数据)
    ↓
    ↓ (外键约束)
    ↓
gpt_sessions (无法创建，因为 user_profiles 中没有用户)
```

## 解决方案

### 方案 A：直接引用 auth.users（推荐 ✅）

修改 `gpt_sessions` 直接引用 `auth.users` 而不是 `user_profiles`：

**迁移文件**: `supabase/migrations/20251119000000_fix_gpt_sessions_user_id_reference.sql`

**步骤**：
1. 登录 Supabase 控制台
2. 进入 SQL Editor
3. 执行迁移 SQL

**优点**：
- ✅ 简单直接，符合现在的认证架构
- ✅ 移除了不必要的中间层
- ✅ 解决外键约束问题

**缺点**：
- 如果未来需要额外的用户信息（头像、用户名等），需要另外处理

---

### 方案 B：自动创建用户档案

在用户首次登录时自动创建 `user_profiles` 记录。

需要在认证成功后的钩子中添加：

```typescript
// app/api/auth/callback/route.ts
const { error: profileError } = await supabaseAdmin
  .from('user_profiles')
  .insert({
    id: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name || '',
  });
```

**优点**：
- 保留 user_profiles 表结构
- 可以存储额外的用户信息

**缺点**：
- 需要修改认证流程
- 如果用户注册但不登录，会出现问题

---

### 方案 C：移除 user_profiles 表

如果你完全不需要这个表，可以删除它。

**迁移文件**: `supabase/migrations/20251119000001_remove_unused_user_profiles.sql`

**优点**：
- ✅ 最简洁，移除不需要的表
- ✅ 减少数据库复杂度

**缺点**：
- 如果未来需要用户档案，需要重新创建

---

## 推荐实施方案

1. **立即**：执行 `20251119000000_fix_gpt_sessions_user_id_reference.sql`
   - 这样能立即解决创建会话的问题

2. **可选**：执行 `20251119000001_remove_unused_user_profiles.sql`
   - 如果你确认不需要用户档案表

## 如何在 Supabase 中执行

### 方式 1：通过 Web 控制台（推荐）

1. 访问 [Supabase 控制台](https://supabase.com/dashboard)
2. 选择你的项目
3. 进入 **SQL Editor**（左侧菜单）
4. 点击 **+ New Query**
5. 复制并粘贴迁移 SQL
6. 点击 **Run**
7. 等待成功提示

### 方式 2：通过 Supabase CLI（高级）

```bash
# 推送迁移文件
supabase db push

# 或者手动应用
supabase migration up
```

## 验证修复

修复后，尝试创建一个新会话：

1. 登录你的应用
2. 选择 AI 并点击工作空间
3. 应该能成功创建会话（不再出现 FK 错误）

如果仍然有错误，检查：
- 用户是否正确登录（检查 auth.users 中是否有记录）
- 迁移是否成功执行（检查 Supabase 日志）

## 相关文件

- 创建会话 API：`app/api/chat/sessions/route.ts` (第190-209行)
- Supabase 配置：`lib/supabase-admin.ts`
- 初始数据库架构：`supabase/migrations/20241201000000_initial_schema.sql`

## 常见问题

**Q: 会影响现有数据吗？**
A: 不会。迁移只是改变外键引用，现有数据保持不变。

**Q: 需要修改应用代码吗？**
A: 不需要。API 代码已经正确使用了 `userId`，只是数据库约束需要修复。

**Q: 如果我需要存储用户头像等信息怎么办？**
A: 可以在 `auth.users` 的 `user_metadata` 中存储，或者使用方案 B 创建 `user_profiles` 和自动初始化逻辑。
