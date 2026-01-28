# 🚀 CloudBase MySQL 修复 - 快速参考

## 问题

```
❌ this.db.from(...).select(...).where is not a function
```

## 原因

混淆了 Supabase 和 CloudBase 的 API 语法

## 修复

### ❌ 错误方式

```typescript
this.db.from(table).select("*").where("_id = ?", id).find();
```

### ✅ 正确方式

```typescript
this.db.table(table).where("_id", "==", id).get();
```

## API 映射表

| 操作     | 错误（Supabase）             | 正确（CloudBase）              |
| -------- | ---------------------------- | ------------------------------ |
| 表查询   | `.from(table)`               | `.table(table)`                |
| 字段选择 | `.select('*')`               | （隐式，不需要）               |
| 过滤条件 | `.where('field = ?', value)` | `.where('field', '==', value)` |
| 执行查询 | `.find()`                    | `.get()`                       |
| 返回数据 | `result`                     | `result.data`                  |

## 常见操作

```javascript
// 查询单条
const { data } = await db.table("users").where("_id", "==", userId).get();
const user = data?.[0] || null;

// 查询多条
const { data } = await db.table("users").where("status", "==", "active").get();

// 插入
await db.table("users").add({ name: "John" });

// 更新
await db.table("users").where("_id", "==", userId).update({ name: "Jane" });

// 删除
await db.table("users").where("_id", "==", userId).delete();
```

## 验证修复

1. 查看错误是否消失
2. 登录流程正常完成
3. 用户资料成功保存

---

**修复文件**: `lib/database/cloudbase-mysql-adapter.ts`  
**更新日期**: 2025-11-07
