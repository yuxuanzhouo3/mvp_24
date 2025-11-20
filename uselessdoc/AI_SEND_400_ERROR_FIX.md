# AI 发送请求 400 错误修复

## 问题描述

用户报告：登录成功后，发送 AI 请求时收到 400 Bad Request 错误：

```
POST /api/chat/send 400 in 1353ms
AI DeepSeek Chat error: Error: API Error: Bad Request
```

## 根本原因分析

### 问题根源：会话 ID 格式不匹配

**问题链条：**

1. 前端调用 `createSession(authToken)` 创建会话
2. `createSession` 函数期望 API 返回 `{ session: { id: "..." } }`
3. 但 CloudBase 返回的是 `{ session: { _id: "..." } }`（使用 `_id` 而不是 `id`）
4. 前端收到 `undefined` 作为 sessionId
5. 发送到 `/api/chat/send` 的请求包含 `sessionId: undefined`
6. API 验证失败，返回 400 Bad Request

### 具体问题位置

**文件**: `components/gpt-workspace.tsx:447`

```typescript
return data.session.id; // CloudBase 返回的是 _id，不是 id
```

**文件**: `app/api/chat/sessions/route.ts` (CloudBase 部分)

```typescript
return Response.json({ session }, { status: 201 }); // session._id 而不是 session.id
```

## 修复方案

### 方案 1：标准化 API 响应格式

在 `/api/chat/sessions` POST 端点中，确保 CloudBase 返回的会话对象包含 `id` 字段：

```typescript
// 国内版：CloudBase
const { data: session, error } = await createCloudBaseSession(
  userId,
  title,
  model
);

if (error || !session) {
  return Response.json({ error: "Failed to create session" }, { status: 500 });
}

// 标准化会话格式，确保有 id 字段
const normalizedSession = {
  id: session._id, // 将 _id 映射为 id
  ...session,
};

return Response.json({ session: normalizedSession }, { status: 201 });
```

### 方案 2：前端兼容处理（已废弃）

最初考虑在前端处理兼容性，但更好的方案是在 API 层标准化。

## 修改的文件

| 文件                             | 修改内容                      | 状态 |
| -------------------------------- | ----------------------------- | ---- |
| `app/api/chat/sessions/route.ts` | 标准化 CloudBase 会话响应格式 | ✅   |
| `components/gpt-workspace.tsx`   | 简化 sessionId 获取逻辑       | ✅   |

## 修复后的工作流程

```
前端创建会话
  ↓
POST /api/chat/sessions
  ├─ CloudBase 创建会话，返回 { _id: "xxx", ... }
  ├─ API 标准化为 { id: "xxx", _id: "xxx", ... } ✅
  └─ 返回 { session: { id: "xxx", ... } } ✅

前端获取 sessionId
  ├─ data.session.id = "xxx" ✅
  └─ sessionId = "xxx" ✅

发送 AI 请求
  ├─ POST /api/chat/send
  ├─ body: { sessionId: "xxx", message: "...", ... } ✅
  ├─ API 验证 sessionId 成功 ✅
  └─ AI 响应正常返回 ✅
```

## 验证步骤

### 1. 清除浏览器缓存

```javascript
localStorage.clear();
sessionStorage.clear();
```

### 2. 重新登录并测试

1. 访问应用并登录
2. 选择 AI 模型
3. 发送消息
4. 观察：
   - 不再出现 400 错误 ✅
   - AI 能够正常生成响应 ✅
   - 控制台不再显示 "API Error: Bad Request" ✅

### 3. 检查网络请求

在浏览器开发者工具的 Network 标签中：

- `POST /api/chat/sessions` 返回 201 ✅
- `POST /api/chat/send` 返回 200（SSE 流）✅
- 请求体包含有效的 `sessionId` ✅

### 4. 检查控制台日志

```
✅ Session created: { id: "xxx", _id: "xxx", ... }
✅ AI DeepSeek Chat 正常响应
❌ 不应该再看到 "API Error: Bad Request"
```

## 技术细节

### CloudBase vs Supabase 会话格式

| 数据库    | 会话对象格式          | API 返回格式                                  |
| --------- | --------------------- | --------------------------------------------- |
| CloudBase | `{ _id: "xxx", ... }` | `{ session: { id: "xxx", _id: "xxx", ... } }` |
| Supabase  | `{ id: "xxx", ... }`  | `{ session: { id: "xxx", ... } }`             |

通过标准化 API 响应，前端代码现在可以统一处理两种数据库格式。

## 构建状态

✅ 项目编译成功：`npm run build` 完成

## 总结

这次修复解决了会话 ID 格式不匹配的问题，确保了 CloudBase 和 Supabase 的会话创建 API 返回一致的格式。前端现在可以正确获取 sessionId，并成功发送 AI 请求。
