# 历史消息加载修复

## 问题描述

当点击历史记录切换会话时，前端没有从数据库加载消息，只显示了用户消息。多AI响应不显示。

## 根本原因

前端使用 `localStorage` 来存储当前会话的消息，但当用户切换会话时，没有从数据库加载完整的历史消息。

## 解决方案

需要在以下地方添加消息加载逻辑：

### 1. 在 `gpt-workspace.tsx` 中添加会话切换时的消息加载

```typescript
// 当 currentSessionId 变化时，从数据库加载消息
useEffect(() => {
  if (currentSessionId && authToken) {
    loadMessagesFromDatabase(currentSessionId, authToken);
  }
}, [currentSessionId, authToken]);

const loadMessagesFromDatabase = async (sessionId: string, token: string) => {
  try {
    const response = await fetch(
      `/api/chat/sessions/${sessionId}/messages`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) throw new Error("Failed to load messages");

    const data = await response.json();
    const loadedMessages = data.messages || [];

    // 转换数据库消息格式为前端格式
    const formattedMessages = loadedMessages.map((msg: any) => ({
      id: msg.id || `msg-${Date.now()}`,
      role: msg.role,
      content: msg.isMultiAI && Array.isArray(msg.content)
        ? msg.content.map((r: any) => ({
            agentId: r.agentId,
            agentName: r.agentName,
            content: r.content,
            model: r.model,
            tokens: r.tokens,
            status: "completed" as const,
            timestamp: new Date(r.timestamp),
          }))
        : msg.content,
      isMultiAI: msg.isMultiAI,
      timestamp: new Date(msg.timestamp),
    }));

    setMessages(formattedMessages);
  } catch (error) {
    console.error("Failed to load messages from database:", error);
  }
};
```

### 2. 确保 `/api/chat/sessions/[id]/messages` 端点正确过滤多AI消息

这个端点已经存在，但需要验证它正确返回完整的多AI消息结构。

查看文件: `app/api/chat/sessions/[id]/messages/route.ts`

应该返回的格式：
```json
{
  "messages": [
    {
      "id": "...",
      "role": "user",
      "content": "用户消息",
      "timestamp": "..."
    },
    {
      "id": "...",
      "role": "assistant",
      "isMultiAI": true,
      "content": [
        {
          "agentId": "qwen3-max",
          "agentName": "通义千问 3 Max",
          "content": "...",
          "model": "qwen3-max",
          "tokens": 256,
          "timestamp": "..."
        },
        {
          "agentId": "kimi-k2-thinking",
          "agentName": "Kimi K2 Thinking",
          "content": "...",
          "model": "kimi-k2-thinking",
          "tokens": 512,
          "timestamp": "..."
        }
      ],
      "timestamp": "..."
    }
  ]
}
```

### 3. 验证会话历史列表能正确加载会话

当用户点击历史记录中的一个会话时，应该：
1. 调用 `setCurrentSessionId(sessionId)`
2. 这会触发上面的 `useEffect`
3. 从数据库加载消息
4. 显示完整的多AI消息

## 实施步骤

### Step 1: 验证 `/api/chat/sessions/[id]/messages` 端点

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/chat/sessions/<session-id>/messages"
```

验证返回的消息是否包含完整的多AI响应。

### Step 2: 修改 gpt-workspace.tsx

在文件中找到消息显示部分（大约在第512行），在其上方添加 `useEffect` 钩子来加载数据库消息。

### Step 3: 测试

1. 创建多AI会话
2. 发送消息
3. 等待所有AI回复
4. **关闭并重新打开应用**
5. 点击历史记录中的会话
6. 验证所有AI的回复都显示出来

## 完整的代码修改

在 `components/gpt-workspace.tsx` 中，在 `useWorkspaceMessages()` 之后添加：

```typescript
// 获取认证token
const getAuthToken = async () => {
  const { token } = await getClientAuthToken();
  return token;
};

// 当会话ID改变时，从数据库加载消息
useEffect(() => {
  const loadMessages = async () => {
    if (!currentSessionId) return;

    const { token } = await getClientAuthToken();
    if (!token) return;

    try {
      const response = await fetch(
        `/api/chat/sessions/${currentSessionId}/messages`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) return;

      const data = await response.json();
      const loadedMessages = data.messages || [];

      const formattedMessages = loadedMessages.map((msg: any) => ({
        id: msg.id || `msg-${Date.now()}-${Math.random()}`,
        role: msg.role,
        content: msg.isMultiAI && Array.isArray(msg.content)
          ? msg.content.map((r: any) => ({
              agentId: r.agentId,
              agentName: r.agentName,
              content: r.content,
              model: r.model,
              tokens: r.tokens || 0,
              cost: r.cost || 0,
              status: "completed" as const,
              timestamp: new Date(r.timestamp),
            }))
          : msg.content,
        isMultiAI: msg.isMultiAI || false,
        timestamp: new Date(msg.timestamp),
      }));

      setMessages(formattedMessages);
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  };

  loadMessages();
}, [currentSessionId]);
```

## 检查清单

- [ ] 验证API端点返回正确的消息格式
- [ ] 在gpt-workspace.tsx中添加useEffect
- [ ] 测试切换会话时是否加载消息
- [ ] 验证多AI响应是否正确显示
- [ ] 检查console是否有错误
- [ ] 验证localStorage仍然正确缓存

## 调试提示

如果消息仍然不显示：

1. **检查浏览器Network标签**
   - 确认 `/api/chat/sessions/[id]/messages` 请求成功
   - 查看返回的消息结构

2. **检查浏览器Console**
   - 查看是否有错误信息
   - 查看 `setMessages` 是否被调用

3. **检查localStorage**
   - 打开DevTools → Application → localStorage
   - 查看 `workspace-messages` 中的数据结构

4. **验证数据库中的数据**
   - 直接查询 CloudBase/Supabase
   - 确认消息结构是否正确
