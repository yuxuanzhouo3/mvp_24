# CloudBase 集合缺失问题修复指南

## 问题描述

错误：`[ResourceNotFound] Db or Table not exist`

这表示您正在尝试访问的 CloudBase 集合不存在。

## 根本原因

CloudBase 中缺少以下集合：

- ❌ `gpt_sessions`
- ❌ `gpt_messages`

这两个集合在代码中使用，但在 CloudBase 控制台中从未创建。

## 解决方案

### 步骤 1：代码修复 ✅ (已完成)

已修改 `lib/cloudbase-db.ts`：

- ✅ 将 `gpt_sessions` 改为 `ai_conversations`（已有的集合）
- ✅ 将 `gpt_messages` 存储在 `ai_conversations.messages` 数组中
- ✅ 使用 CloudBase 原生的数据库操作方法

### 步骤 2：创建 CloudBase 集合

您需要确保 CloudBase 中存在以下集合：

#### 必需的集合清单

```
✓ web_users          - 用户账户信息
✓ user_profiles      - 用户详细信息
✓ ai_conversations   - AI 对话记录（包含消息）
✓ payments           - 支付记录
✓ tokens             - Token 使用记录
✓ subscriptions      - 订阅信息
✓ wechat_logins      - 微信登录记录
✓ security_logs      - 安全日志
```

#### 操作步骤

**2.1 打开腾讯云 CloudBase 控制台**

1. 访问：https://console.cloud.tencent.com/tcb/db
2. 选择环境：`multigpt-6g9pqxiz52974a7c`（您的 CLOUDBASE_ID）
3. 进入"数据库"标签

**2.2 创建缺失的集合**

对于每个缺失的集合，点击"创建集合"：

##### 集合 1: `web_users`

- **集合名称**: `web_users`
- **权限**: 自定义安全规则或管理员权限

##### 集合 2: `user_profiles`

- **集合名称**: `user_profiles`
- **权限**: 自定义安全规则或管理员权限

##### 集合 3: `ai_conversations`

- **集合名称**: `ai_conversations`
- **权限**: 自定义安全规则或管理员权限
- **字段说明**:
  ```
  _id: 文档ID（系统自动）
  user_id: 用户ID（字符串）
  title: 对话标题（字符串）
  model: 使用的模型（字符串）
  provider: AI 提供商（字符串）
  messages: 消息数组（数组）
    - role: "user" | "assistant" | "system"
    - content: 消息内容（字符串）
    - timestamp: 时间戳（ISO 字符串）
    - tokens_used: 使用的 token 数（数字）
  tokens: Token 统计（对象）
    - input: 输入 token 数（数字）
    - output: 输出 token 数（数字）
    - total: 总 token 数（数字）
  cost: 成本（数字）
  region: 地区（字符串）
  created_at: 创建时间（ISO 字符串）
  updated_at: 更新时间（ISO 字符串）
  ```

##### 集合 4-8: 其他集合

- 类似步骤创建其他集合

**2.3 创建索引（重要）**

为了提高查询性能和支持某些查询功能，请创建以下索引：

###### `web_users` 索引

```
- 字段: email, 类型: 唯一索引
- 字段: created_at, 类型: 普通索引，顺序: 倒序
```

###### `user_profiles` 索引

```
- 字段: user_id, 类型: 唯一索引
- 字段: email, 类型: 普通索引
- 字段: created_at, 类型: 普通索引，顺序: 倒序
```

###### `ai_conversations` 索引

```
- 字段: user_id + created_at, 类型: 普通复合索引，顺序: user_id (升序), created_at (倒序)
- 字段: model, 类型: 普通索引
```

###### `payments` 索引

```
- 字段: user_id + created_at, 类型: 普通复合索引
- 字段: order_id, 类型: 唯一索引
- 字段: status, 类型: 普通索引
```

###### `tokens` 索引

```
- 字段: user_id + created_at, 类型: 普通复合索引
- 字段: model, 类型: 普通索引
```

###### `subscriptions` 索引

```
- 字段: user_id, 类型: 普通索引
- 字段: status, 类型: 普通索引
- 字段: end_date, 类型: 普通索引
```

###### `wechat_logins` 索引

```
- 字段: open_id, 类型: 唯一索引
- 字段: user_id, 类型: 普通索引
```

###### `security_logs` 索引

```
- 字段: user_id + created_at, 类型: 普通复合索引
- 字段: email + created_at, 类型: 普通复合索引
- 字段: event, 类型: 普通索引
```

### 步骤 3：验证集合创建

运行初始化脚本验证所有集合是否正确创建：

```bash
npm run init:cloudbase
```

成功输出示例：

```
✅ 集合 "web_users" 存在
✅ 集合 "user_profiles" 存在
✅ 集合 "ai_conversations" 存在
✅ 集合 "payments" 存在
...
✅ 所有集合都已存在！系统已准备好。
```

### 步骤 4：测试创建会话

现在应该能正常创建会话了。你可以：

1. 登录应用 (test@example.com / password123)
2. 创建新的 AI 对话会话
3. 发送消息测试

## 关键改动总结

| 文件                                    | 改动         | 说明                                                          |
| --------------------------------------- | ------------ | ------------------------------------------------------------- |
| `lib/cloudbase-db.ts`                   | 更新集合引用 | 使用 `ai_conversations` 替代 `gpt_sessions` 和 `gpt_messages` |
| `lib/cloudbase-db.ts`                   | 消息存储方式 | 消息现在存储为 `ai_conversations.messages` 数组元素           |
| `package.json`                          | 新增脚本     | 添加 `npm run init:cloudbase` 命令                            |
| `scripts/init-cloudbase-collections.ts` | 新文件       | 集合初始化验证脚本                                            |

## 新的数据结构

### 原设计（错误的）

```
gpt_sessions 集合
├── session_id
├── user_id
└── title

gpt_messages 集合（不存在）
├── session_id
├── role
└── content
```

### 新设计（正确的）

```
ai_conversations 集合（已存在）
├── _id (session_id)
├── user_id
├── title
├── model
├── messages: [       ← 嵌入式消息数组
│   ├── role
│   ├── content
│   ├── timestamp
│   └── tokens_used
│]
├── created_at
└── updated_at
```

## 常见问题

**Q: 为什么不使用 gpt_sessions 和 gpt_messages？**
A: 因为这两个集合在 CloudBase 中从未创建。使用 `ai_conversations` 是现有的、正确的集合设计。

**Q: 消息会在数组中无限增长吗？**
A: 是的，但这在 CloudBase 中是正常的模式。对于大型应用，可以考虑定期归档旧消息或实现分页。

**Q: 如何修改旧会话中的消息？**
A: 使用 CloudBase 的数组操作符：

```typescript
// 查找并更新特定消息
db.collection("ai_conversations")
  .where({ _id: sessionId })
  .update({
    messages: db.command.filter((msg) => msg.id !== messageId),
  });
```

**Q: 能否删除单个消息？**
A: 可以，使用数组过滤操作来移除特定消息。

## 检查清单

创建集合时请检查：

- [ ] 所有 8 个集合都已创建
- [ ] 每个集合都有正确的索引
- [ ] 环境变量配置正确：
  - [ ] `NEXT_PUBLIC_WECHAT_CLOUDBASE_ID`
  - [ ] `CLOUDBASE_SECRET_ID`
  - [ ] `CLOUDBASE_SECRET_KEY`
- [ ] 运行 `npm run init:cloudbase` 通过验证
- [ ] 成功创建会话和发送消息

## 相关文件

- `lib/cloudbase-db.ts` - CloudBase 数据库操作
- `app/api/chat/sessions/route.ts` - 会话 API（已应用区域分离）
- `lib/database/cloudbase-schema.ts` - 集合 Schema 定义
- `scripts/init-cloudbase-collections.ts` - 初始化验证脚本

## 下一步

完成集合创建后，继续修复其他 API 路由的区域分离：

- [ ] `/api/chat/send/route.ts`
- [ ] `/api/chat/sessions/[id]/route.ts`
- [ ] `/api/chat/sessions/[id]/messages/route.ts`
- [ ] `/api/chat/multi-send/route.ts`
- [ ] 修复前端组件中的 Supabase 直接调用

参考 `SYSTEM_SEPARATION_GUIDE.md` 了解详细的实现模式。
