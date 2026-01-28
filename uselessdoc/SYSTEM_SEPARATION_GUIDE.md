## 系统完全分离修复指南

### 问题

之前的实现混淆了两个系统：

- 国内版（CN）应该**只使用 CloudBase**
- 国际版（INTL）应该**只使用 Supabase**

### 已修复

✅ `/api/auth/login` - 国内版只使用 CloudBase
✅ `/api/chat/sessions` - 根据 isChinaRegion() 选择数据库
✅ `lib/cloudbase-db.ts` - CloudBase 数据库操作工具

### 需要继续修复的 API 路由

对以下每个 API 应用相同的模式：

#### 1. `/api/chat/send/route.ts`

```typescript
import { isChinaRegion } from "@/lib/config/region";
import {
  getGptMessages,
  saveGptMessage as saveCloudBaseMessage,
} from "@/lib/cloudbase-db";
import { supabaseAdmin } from "@/lib/supabase-admin";

// 在需要查询/保存消息的地方添加判断：
if (isChinaRegion()) {
  // 使用 saveCloudBaseMessage(messageData)
  // 使用 getGptMessages(sessionId, limit)
} else {
  // 使用 supabaseAdmin.from("gpt_messages").insert/select/etc
}
```

#### 2. `/api/chat/sessions/[id]/route.ts`

- GET: 获取会话详情 - 分离
- DELETE: 删除会话 - 使用 deleteGptSession (CloudBase) 或 supabaseAdmin (Supabase)
- PATCH: 更新会话 - 使用 updateGptSession (CloudBase) 或 supabaseAdmin (Supabase)

#### 3. `/api/chat/sessions/[id]/messages/route.ts`

- GET: 获取消息 - 使用 getGptMessages (CloudBase) 或 supabaseAdmin (Supabase)
- DELETE: 删除消息 - 使用 deleteGptMessages (CloudBase) 或 supabaseAdmin (Supabase)

#### 4. `/api/chat/multi-send/route.ts`

- 同样应用分离模式

### CloudBase DB 工具函数

```typescript
// lib/cloudbase-db.ts 已提供的函数：

// 会话操作
getGptSessions(userId, limit, offset);
createGptSession(userId, title, model);
deleteGptSession(sessionId, userId);
updateGptSession(sessionId, userId, updates);

// 消息操作
getGptMessages(sessionId, limit, offset);
saveGptMessage(messageData);
deleteGptMessages(sessionId);
```

### 修复步骤

对每个文件应用以下步骤：

1. 导入 `isChinaRegion` 和相应的 CloudBase 工具函数
2. 在所有数据库操作处添加 if/else 判断
3. 国内版分支使用 CloudBase 工具函数
4. 国际版分支使用 supabaseAdmin

### 关键注意事项

⚠️ **不要混淆两个系统**：

- 不要在 CloudBase 登录时创建 Supabase 记录
- 不要在 Supabase 查询时使用 CloudBase
- 每个操作都必须明确判断区域

⚠️ **ID 格式不同**：

- CloudBase: `_id` 字段（通常是 UUID）
- Supabase: `id` 字段（也通常是 UUID）
- 确保正确使用相应系统的 ID 字段
