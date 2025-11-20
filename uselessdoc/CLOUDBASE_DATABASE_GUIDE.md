# 腾讯云 CloudBase 数据模型管理指南

## CloudBase vs 传统数据库

### 主要区别

| 特性           | CloudBase (NoSQL)         | 传统关系型数据库 (MySQL/PostgreSQL) |
| -------------- | ------------------------- | ----------------------------------- |
| **表结构**     | 不需要预定义              | 必须预先定义表结构和字段            |
| **灵活性**     | 高 - 每个文档可有不同字段 | 低 - 所有记录必须符合表结构         |
| **扩展性**     | 水平扩展容易              | 垂直扩展为主                        |
| **数据一致性** | 最终一致性                | ACID 事务保证                       |
| **查询性能**   | 针对文档优化的查询        | 复杂的 JOIN 查询                    |

### CloudBase 的优势

1. **灵活的数据结构**: 可以根据业务需求快速调整字段
2. **水平扩展**: 轻松处理海量数据
3. **JSON 原生支持**: 直接存储复杂对象
4. **自动索引**: 对常用字段自动创建索引

## 数据模型定义

虽然 CloudBase 不强制要求预定义模式，我们仍然需要在应用层面定义数据结构：

### 1. TypeScript 接口定义

```typescript
// lib/models/database.ts
export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  subscription_plan: "free" | "premium" | "pro";
  subscription_status: "active" | "inactive" | "cancelled";
  created_at?: string;
  updated_at?: string;
}
```

### 2. 数据验证

```typescript
export class DataValidators {
  static validateUserProfile(data: Partial<UserProfile>): boolean {
    const requiredFields = ["id", "email", "full_name"];
    return requiredFields.every((field) => data[field as keyof UserProfile]);
  }
}
```

### 3. 默认值生成

```typescript
export class DefaultValues {
  static userProfile(userId: string, email: string): UserProfile {
    return {
      id: userId,
      email,
      full_name: email.split("@")[0],
      avatar_url: "",
      subscription_plan: "free",
      subscription_status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
}
```

## 在腾讯云控制台中的配置

### 1. 创建环境

1. 登录 [腾讯云 CloudBase 控制台](https://console.cloud.tencent.com/tcb)
2. 创建新环境或选择现有环境
3. 记录环境 ID（用于 `NEXT_PUBLIC_WECHAT_CLOUDBASE_ID`）

### 2. 配置数据库

CloudBase 数据库是自动创建的，不需要手动创建集合。

### 3. 创建索引（重要）

在 CloudBase 控制台中创建索引以提高查询性能：

#### 用户资料集合 (user_profiles)

- **索引字段**: `id` (唯一索引)

#### 聊天会话集合 (chat_sessions)

- **索引字段**: `user_id`, `is_active`
- **复合索引**: `(user_id, updated_at)` - 降序

#### 聊天消息集合 (chat_messages)

- **索引字段**: `session_id`
- **复合索引**: `(session_id, created_at)` - 升序

#### 支付记录集合 (payment_records)

- **索引字段**: `user_id`, `status`
- **复合索引**: `(user_id, created_at)` - 降序

### 4. 权限配置

在 CloudBase 控制台中配置数据库权限：

```json
{
  "collections": {
    "user_profiles": {
      "permissions": {
        "read": "auth != null && auth.id == doc.id",
        "write": "auth != null && auth.id == doc.id"
      }
    },
    "chat_sessions": {
      "permissions": {
        "read": "auth != null && auth.id == doc.user_id",
        "write": "auth != null && auth.id == doc.user_id"
      }
    }
  }
}
```

## 最佳实践

### 1. 数据一致性

- 在应用层面验证数据结构
- 使用 TypeScript 接口确保类型安全
- 实现数据迁移脚本来处理结构变更

### 2. 性能优化

- 为常用查询字段创建索引
- 使用复合索引优化多条件查询
- 合理设计文档结构，避免过度嵌套

### 3. 备份和恢复

- 定期备份重要数据
- 测试数据恢复流程
- 监控数据库使用情况

### 4. 监控和告警

- 设置数据库使用量告警
- 监控查询性能
- 定期检查数据一致性

## 常见问题

### Q: 为什么我的数据插入失败？

A: 检查以下几点：

1. 环境变量配置是否正确
2. 数据库权限是否正确设置
3. 数据格式是否符合接口定义

### Q: 如何修改现有数据的结构？

A: CloudBase 支持动态修改文档结构：

1. 在应用中更新 TypeScript 接口
2. 编写数据迁移脚本
3. 逐步更新现有文档

### Q: 如何处理大数据量的查询？

A: 使用分页查询：

```typescript
// 分页查询示例
const pageSize = 20;
const page = 1;
const { data } = await collection
  .where({ user_id: userId })
  .orderBy("created_at", "desc")
  .skip((page - 1) * pageSize)
  .limit(pageSize)
  .get();
```

## 迁移到 CloudBase

如果您之前使用的是关系型数据库，迁移时需要注意：

1. **数据结构扁平化**: 将关联表的数据嵌入到主文档中
2. **索引策略调整**: 重新设计索引以适应文档查询模式
3. **查询逻辑重写**: 使用文档查询替代 SQL JOIN

## 总结

CloudBase 的无模式特性提供了极大的灵活性，但也需要我们在应用层面做好数据管理和验证工作。通过 TypeScript 接口定义、数据验证和索引优化，我们可以在享受 NoSQL 优势的同时确保数据的一致性和性能。
