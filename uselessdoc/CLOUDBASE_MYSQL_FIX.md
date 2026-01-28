# CloudBase MySQL 适配器修复完整指南

## 🔴 问题症状

```
❌ 查询表 user_profiles 失败: this.db.from(...).select(...).where is not a function
Failed to save user profile: TypeError: this.db.from(...).select(...).where is not a function
    at where (lib\database\cloudbase-mysql-adapter.ts:185:68)
    at async POST (app\api\auth\login\route.ts:174:33)
```

登录流程中，即使认证成功，但保存用户资料失败，导致用户无法完全登录。

## 🔍 问题分析

### 根本原因

CloudBase MySQL 适配器混淆了两个不同的 API 风格：

| 特征     | Supabase 风格                | CloudBase 风格                       |
| -------- | ---------------------------- | ------------------------------------ |
| 表查询   | `.from(table)`               | `.table(table)`                      |
| 选择字段 | `.select('*')`               | 不需要（隐式）                       |
| 过滤条件 | `.where('field = ?', value)` | `.where('field', 'operator', value)` |
| 执行查询 | `.find()`                    | `.get()`                             |
| 返回格式 | 直接数组                     | `{ data: [...] }`                    |

**错误代码示例：**

```typescript
// ❌ 混合了 Supabase 和 CloudBase 的 API
const result = await this.db
  .from(table) // CloudBase 不支持 from()
  .select("*") // 不需要显式 select()
  .where(`${key} = ?`, value) // 使用的是 SQL 参数化语法
  .find(); // CloudBase 使用 get()

// 导致错误：this.db.from(...).select(...).where is not a function
```

## ✅ 修复方案

### 1. **query() 方法修复**

**修改前（错误）：**

```typescript
async query<T>(table: string, filter?: Record<string, any>): Promise<T[]> {
  let query = this.db.table(table);

  if (filter && Object.keys(filter).length > 0) {
    Object.entries(filter).forEach(([key, value]) => {
      query = query.where(`${key} = ?`, value);  // ❌ 错误语法
    });
  }

  const result = await query.find();  // ❌ CloudBase 使用 get()
  return result as T[];
}
```

**修改后（正确）：**

```typescript
async query<T>(table: string, filter?: Record<string, any>): Promise<T[]> {
  let query = this.db.table(table);

  if (filter && Object.keys(filter).length > 0) {
    // ✅ 正确的 CloudBase API 语法
    for (const [key, value] of Object.entries(filter)) {
      query = query.where(key, "==", value);  // ✅ 三参数形式
    }
  }

  const result = await query.get();  // ✅ 使用 get() 而不是 find()
  return (result.data || []) as T[];  // ✅ 提取 data 数组
}
```

### 2. **getById() 方法修复**

**修改前：**

```typescript
const result = await this.db
  .table(table)
  .where("_id = ?", id) // ❌ 错误的 where 语法
  .find(); // ❌ 错误的执行方法

return result && result.length > 0 ? result[0] : null; // ❌ 结果格式错误
```

**修改后：**

```typescript
const result = await this.db
  .table(table)
  .where("_id", "==", id) // ✅ 正确的三参数形式
  .get(); // ✅ 正确的执行方法

const data = result.data || []; // ✅ 正确地提取 data
return data.length > 0 ? data[0] : null;
```

### 3. **update() 和 delete() 方法修复**

所有涉及 `where` 的操作都使用相同的修正：

```typescript
// ❌ 错误
.where("_id = ?", id)

// ✅ 正确
.where("_id", "==", id)
```

### 4. **返回值类型修复**

`update()` 方法原来返回 `Promise<T | null>`，这与接口定义 `Promise<T>` 不匹配。

改为在更新失败时抛出错误，确保返回非空值：

```typescript
if (!result || (result.updated === 0 && result.affectedRows === 0)) {
  throw new Error(`无法更新表 ${table} 中的记录 ${id}`);
}
```

## 📋 CloudBase MySQL API 规范

### Where 操作符

```javascript
// 完整的 CloudBase API 语法
.where(fieldName, operator, value)

// 支持的操作符：
// "=="  或 "eq"   → 等于
// "!="  或 "neq"  → 不等于
// "<"   或 "lt"   → 小于
// "<="  或 "lte"  → 小于等于
// ">"   或 "gt"   → 大于
// ">="  或 "gte"  → 大于等于
```

### 查询结果格式

```javascript
{
  data: [
    { _id: "xxx", name: "...", ... },
    { _id: "yyy", name: "...", ... }
  ],
  affectedRows: 2,    // 影响的行数
  inserted: 0,        // 插入的行数
  updated: 0,         // 更新的行数
  deleted: 0          // 删除的行数
}
```

### 常见操作示例

```javascript
// ✅ 查询单条记录
const result = await db.table("users").where("_id", "==", userId).get();

// ✅ 查询多条记录
const result = await db.table("users").where("status", "==", "active").get();

// ✅ 更新记录
const result = await db
  .table("users")
  .where("_id", "==", userId)
  .update({ name: "New Name", updatedAt: new Date() });

// ✅ 删除记录
const result = await db.table("users").where("_id", "==", userId).delete();

// ✅ 插入记录
const result = await db
  .table("users")
  .add({ name: "User", email: "user@example.com" });
```

## 🧪 测试验证

修复后的登录流程：

1. ✅ 用户提交登录请求

   ```
   POST /api/auth/login
   {
     "email": "user@example.com",
     "password": "password123"
   }
   ```

2. ✅ CloudBase 认证用户

   ```
   [CN] Email login attempt: user@example.com
   ✅ [Login] 登录成功: user@example.com
   ```

3. ✅ 查询用户资料

   ```
   const existingProfile = await db.getById('user_profiles', userId);
   // 不再出现错误：this.db.from(...).select(...).where is not a function
   ```

4. ✅ 保存/更新用户资料

   ```
   await db.insert('user_profiles', userProfile);
   // 或
   await db.update('user_profiles', userId, { lastLoginAt: new Date() });
   ```

5. ✅ 返回登录响应
   ```
   {
     "success": true,
     "user": { ... },
     "session": { ... }
   }
   ```

## 📁 修改的文件

- **`lib/database/cloudbase-mysql-adapter.ts`**
  - ✅ 修复了 `query()` 方法
  - ✅ 修复了 `insert()` 方法的返回值处理
  - ✅ 修复了 `update()` 方法的类型和 API 调用
  - ✅ 修复了 `delete()` 方法的 where 语法
  - ✅ 修复了 `getById()` 方法

## 🌐 环境配置检查

确保以下环境变量已正确配置：

```bash
# .env.local
NEXT_PUBLIC_WECHAT_CLOUDBASE_ID=multigpt-6g9pqxiz52974a7c
CLOUDBASE_SECRET_ID=your_secret_id
CLOUDBASE_SECRET_KEY=your_secret_key
```

## 🚀 验证修复

1. **重启开发服务器**

   ```bash
   npm run dev
   ```

2. **测试登录**

   - 访问 http://localhost:3000/login
   - 输入有效的邮箱和密码
   - 验证登录成功且用户资料已保存

3. **检查日志**
   ```
   ✅ CloudBase MySQL 连接成功
   ✅ [Login] 登录成功: email@example.com
   ✅ 用户资料已保存
   ```

## 🐛 故障排查

### 问题：仍然出现 "where is not a function" 错误

**解决方案：**

1. 清除 Next.js 缓存：`rm -r .next`
2. 重新安装依赖：`npm install`
3. 重启开发服务器：`npm run dev`

### 问题：CloudBase 连接失败

**检查项：**

1. 环境变量是否正确设置
2. CloudBase 环境 ID 是否有效
3. Secret ID 和 Key 是否有效
4. CloudBase MySQL 权限是否已配置

### 问题：更新返回 null

**解决方案：**

- 检查用户 ID 是否正确
- 确保表中存在相应的记录
- 验证数据库表结构

---

**修复日期**: 2025-11-07  
**修复版本**: v1.0  
**状态**: ✅ 完成并测试  
**相关文件**: `lib/database/cloudbase-mysql-adapter.ts`
