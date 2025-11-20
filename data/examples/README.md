# CloudBase 集合导入数据示例

本目录包含 8 个集合的 JSON 格式示例数据，可以直接在 CloudBase 控制台导入。

## 📂 文件说明

| 文件名 | 集合名称 | 说明 | 记录数 | 格式 |
|--------|---------|------|--------|------|
| `web_users.json` | web_users | 用户账户 | 3 条 | JSONL |
| `user_profiles.json` | user_profiles | 用户详细信息 | 2 条 | JSONL |
| `ai_conversations.json` | ai_conversations | AI 对话记录 | 2 条 | JSONL |
| `payments.json` | payments | 支付记录 | 2 条 | JSONL |
| `tokens.json` | tokens | Token 消耗统计 | 3 条 | JSONL |
| `subscriptions.json` | subscriptions | 订阅计划 | 2 条 | JSONL |
| `wechat_logins.json` | wechat_logins | 微信登录记录 | 2 条 | JSONL |
| `security_logs.json` | security_logs | 安全日志 | 5 条 | JSONL |

**重要说明**：所有文件采用 **JSON Lines** 格式（.jsonl），每行一个完整的 JSON 对象，不包装在数组中。这是 CloudBase 推荐的导入格式。

## 🚀 导入步骤

### 前提条件

- 所有文件均采用 **JSON Lines 格式** (JSONL)，每行一个完整的 JSON 对象
- 文件无需修改即可直接导入
- 支持一次性导入完整文件

### 方法 1：CloudBase 控制台导入

1. 打开 [CloudBase 控制台](https://console.cloud.tencent.com/tcb)
2. 选择你的环境：`multigpt-6g9pqxiz52974a7c`
3. 左侧菜单 → **数据库** → **集合管理**
4. 选择对应的集合（例如 `web_users`）
5. 点击 **导入数据** 按钮
6. 选择对应的 JSONL 文件（例如 `web_users.json`）
7. 确保选择的是 **JSON Lines 格式**
8. 点击 **导入**

### 按推荐顺序导入

建议按以下顺序导入数据，以避免关联键问题：

```
1. web_users.json          # 基础用户账户
2. user_profiles.json      # 用户详细信息（依赖 web_users）
3. ai_conversations.json   # AI 对话（依赖 web_users）
4. payments.json           # 支付记录（依赖 web_users）
5. tokens.json             # Token 统计（依赖 web_users）
6. subscriptions.json      # 订阅信息（依赖 web_users）
7. wechat_logins.json      # 微信登录（可选）
8. security_logs.json      # 安全日志（依赖 web_users）
```

## 📋 数据说明

### web_users - 用户账户表

```json
{
  "email": "user@example.com",           // 邮箱地址（唯一）
  "password": "$2a$10$...",              // bcryptjs 加密后的密码
  "name": "张三",                        // 用户名
  "avatar": "https://...",               // 头像 URL
  "phone": "13800000001",                // 电话号码
  "pro": false,                          // 是否是 Pro 用户
  "region": "china",                     // 地区
  "createdAt": "2024-11-07T...",        // 创建时间
  "updatedAt": "2024-11-07T...",        // 更新时间
  "lastLoginAt": "2024-11-07T...",      // 最后登录时间
  "loginCount": 5                        // 登录次数
}
```

### user_profiles - 用户详细信息表

```json
{
  "userId": "user1_id",                  // 关联到 web_users._id
  "email": "user@example.com",           // 邮箱
  "fullName": "张三",                    // 全名
  "avatar": "https://...",               // 头像
  "bio": "个人简介",                     // 个人简介
  "region": "china",                     // 地区
  "loginCount": 5,                       // 登录次数
  "lastLoginAt": "2024-11-07T...",      // 最后登录
  "preferences": {                       // 用户偏好设置
    "language": "zh-CN",
    "theme": "dark",
    "notifications": true
  }
}
```

### ai_conversations - AI 对话记录

```json
{
  "userId": "user1_id",                  // 用户 ID
  "title": "Python 编程问题",            // 对话标题
  "model": "gpt-4o",                     // 使用的模型
  "provider": "openai",                  // 服务商
  "messages": [                          // 对话消息数组
    {
      "role": "user",
      "content": "问题内容",
      "timestamp": "2024-11-07T..."
    }
  ],
  "tokens": {                            // Token 统计
    "input": 45,
    "output": 120,
    "total": 165
  },
  "cost": 0.0015,                        // 成本
  "region": "china"
}
```

### payments - 支付记录

```json
{
  "userId": "user2_id",                  // 用户 ID
  "email": "user@example.com",           // 用户邮箱
  "amount": 99.99,                       // 金额
  "currency": "CNY",                     // 货币
  "method": "wechat",                    // 支付方式（wechat/alipay）
  "status": "completed",                 // 状态
  "orderId": "ORDER_20241107_001",      // 订单号（唯一）
  "transactionId": "WECHAT_TXN_...",    // 第三方交易ID
  "productType": "pro",                  // 产品类型
  "productName": "Pro 年度订阅",         // 产品名称
  "completedAt": "2024-11-07T..."      // 完成时间
}
```

### tokens - Token 消耗统计

```json
{
  "userId": "user1_id",                  // 用户 ID
  "conversationId": "conv1_id",          // 对话 ID（可选）
  "model": "gpt-4o",                     // 使用的模型
  "inputTokens": 45,                     // 输入 tokens
  "outputTokens": 120,                   // 输出 tokens
  "totalTokens": 165,                    // 总 tokens
  "cost": 0.0015,                        // 成本
  "region": "china"
}
```

### subscriptions - 订阅计划

```json
{
  "userId": "user2_id",                  // 用户 ID
  "email": "user@example.com",           // 邮箱
  "plan": "pro",                         // 计划（free/pro/enterprise）
  "status": "active",                    // 状态
  "startDate": "2024-11-07T...",        // 开始日期
  "endDate": "2025-11-07T...",          // 结束日期
  "renewalDate": "2025-11-07T...",      // 续费日期
  "autoRenew": true,                     // 自动续费
  "monthlyTokens": 1000000,              // 每月 tokens
  "usedTokens": 150000,                  // 已使用
  "monthlyLimit": 1000000,               // 每月限额
  "price": 99.99,                        // 价格
  "currency": "CNY"
}
```

### wechat_logins - 微信登录

```json
{
  "userId": "user1_id",                  // 用户 ID（可选）
  "openId": "oUVf6wtj...",              // 微信 openId（唯一）
  "nickname": "张三",                    // 微信昵称
  "avatar": "https://thirdwx.qlogo...", // 微信头像
  "unionId": "oOZLOjpv...",             // 微信 unionId
  "status": "active",                    // 状态
  "lastLoginAt": "2024-11-07T..."       // 最后登录
}
```

### security_logs - 安全日志

```json
{
  "userId": "user1_id",                  // 用户 ID（可选）
  "email": "user@example.com",           // 邮箱（可选）
  "event": "login_successful",           // 事件类型
  "ipAddress": "192.168.1.1",            // IP 地址
  "userAgent": "Mozilla/5.0...",         // User Agent
  "status": "success",                   // 状态
  "message": "用户成功登录",              // 消息
  "region": "china"
}
```

## ⚠️ 注意事项

1. **JSON Lines 格式**：所有文件采用 JSON Lines (JSONL) 格式，每行是一个完整的 JSON 对象，不是数组格式。CloudBase 需要这种格式进行正确导入。

2. **关联 ID**：某些集合中的 `userId` 或 `conversationId` 应该与其他集合的 `_id` 对应。示例数据中使用了简化的 ID，实际导入后需要更新这些关联。

3. **密码加密**：示例数据中的密码已使用 bcryptjs 加密。如果要创建新用户，请使用真实的加密密码。

4. **时间戳**：所有时间戳都使用 ISO 8601 格式（`2024-11-07T10:00:00.000Z`）。

5. **唯一索引**：以下字段必须唯一（已在 CloudBase 控制台创建索引）：
   - `web_users.email`
   - `user_profiles.userId`
   - `payments.orderId`
   - `wechat_logins.openId`

6. **文件大小限制**：CloudBase 单次导入最多支持 50MB 的文件。

7. **导入前检查**：导入前请确保：
   - 目标集合已在 CloudBase 中创建
   - 文件格式为 JSON Lines (JSONL)
   - 字段类型与集合定义相匹配

## 📝 导入后验证

导入完成后，可以在 CloudBase 控制台查看：

1. 点击集合名称查看数据
2. 验证记录数是否正确
3. 检查字段和数据类型是否匹配
4. 查看索引是否已创建

## 🔄 导出数据

如果需要从 CloudBase 导出数据，可以在控制台的"数据管理"中选择"导出数据"功能。

## 🛠️ 自定义数据

你可以根据需求修改这些 JSON 文件：

1. 添加或删除记录
2. 修改字段值
3. 调整关联关系
4. 更新时间戳

确保修改后的 JSON 仍然是有效的格式，然后上传即可。

## 📚 相关文档

- [CloudBase 官方文档](https://cloudbase.net/)
- [CloudBase 数据库操作](https://cloudbase.net/docs/database)
- [JSON 数据导入教程](https://cloudbase.net/docs/database)

---

**提示**：这些示例数据仅用于开发测试，生产环境请使用真实数据。
