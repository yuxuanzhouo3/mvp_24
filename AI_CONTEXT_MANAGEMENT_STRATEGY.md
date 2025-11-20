# AI 上下文管理策略 - 多 AI 切换方案

## 📌 问题描述

当用户在对话过程中切换 AI 模型时，存在上下文管理的复杂问题：

**场景示例：**
```
时刻 T1: 用户选择 [通义千问, DeepSeek, Mistral, Claude]
        │
        ├─ 用户: "问题1"
        ├─ AI响应: [四个 AI 的并行响应]
        │
时刻 T2: 用户改选 [Gemini, GPT-4] ← 完全不同的 AI 组合
        │
        ├─ 用户: "问题2"
        └─ AI响应: [新的两个 AI 的响应]

问题：Gemini 和 GPT-4 会看到之前四个 AI 的响应，这些响应：
  ✗ 格式不匹配
  ✗ 信息冗余
  ✗ 可能导致模型混淆
```

## 🎯 核心问题分析

### 1. **当前实现的缺陷**

当前代码在 `send/route.ts` 中的处理方式：

```typescript
// 获取历史消息（不分组）
history = (conv.messages || [])
  .slice(-20)  // 最近 20 条
  .map((msg: any) => {
    if (msg.isMultiAI && Array.isArray(msg.content)) {
      // 简单地将多 AI 响应合并为字符串
      const aiResponses = msg.content
        .map((resp: any) => `${resp.agentName}: ${resp.content}`)
        .join('\n\n');
      return { role: msg.role, content: aiResponses };
    }
    return { role: msg.role, content: msg.content };
  });
```

**问题所在：**
- 所有消息都混在一起，新 AI 无法识别哪些回复是相关的
- 无法跟踪哪些消息是由哪组 AI 生成的
- 切换 AI 时，新 AI 被旧 AI 的回复"污染"

### 2. **影响范围**

| 场景 | 影响 | 严重程度 |
|------|------|--------|
| 单 AI → 单 AI | 高（完全上下文） | ⚠️ 中 |
| 单 AI → 多 AI | 中（新 AI 看到单消息） | ⚠️ 低 |
| 多 AI → 多 AI（同组） | 无影响 | ✅ 无 |
| 多 AI → 多 AI（不同组） | 高（新 AI 看到旧 AI 回复） | 🔴 高 |
| 多 AI → 单 AI | 高（单 AI 被多个声音混淆） | 🔴 高 |

## ✅ 解决方案：分组消息系统

### 方案设计

在 CloudBase 的 `ai_conversations` 集合中，为消息添加分组信息：

```typescript
/**
 * 改进的消息结构
 */
interface ConversationMessage {
  // 基础字段
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  tokens_used?: number;

  // ========== 新增字段：AI 配置分组 ==========

  // 消息所属的 AI 配置版本
  aiConfigVersion?: {
    version: number;        // 1, 2, 3, ... (每次切换 AI 时递增)
    agentIds: string[];     // 当前轮次使用的所有 AI 的 ID
    mode?: string;          // 'parallel', 'sequential', 'debate', 'synthesis'
    startedAt: string;      // 该配置版本开始的时间
  };

  // 用户消息还是 AI 消息
  isUserMessage: boolean;
  isMultiAI?: boolean;

  // 多 AI 时的响应详情
  agentResponses?: Array<{
    agentId: string;
    agentName: string;
    model: string;
    content: string;
    status: "success" | "error";
    timestamp: string;
    tokens_used?: number;
  }>;
}

/**
 * CloudBase 集合结构
 */
interface AIConversationV2 {
  _id: string;
  user_id: string;
  title: string;

  // 消息数组
  messages: ConversationMessage[];

  // ========== 新增：AI 配置历史 ==========
  aiConfigHistory: Array<{
    version: number;
    agentIds: string[];
    mode: string;
    changedAt: string;
    changedByUser: boolean;  // 用户主动切换
  }>;

  // 当前活跃的配置版本
  currentAIConfigVersion: number;

  // 其他字段...
  model: string;
  provider: string;
  tokens?: { input: number; output: number; total: number };
  cost?: number;
  region: string;
  created_at: string;
  updated_at: string;
}
```

### 实现步骤

#### 第1步：创建 CloudBase 迁移脚本

在国内版中，为现有的 `ai_conversations` 添加新字段：

```javascript
// CloudBase 迁移操作
// 为所有现有对话添加版本信息（一次性操作）

const cloudbase = require("@cloudbase/node-sdk");
const app = cloudbase.init({
  env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
  secretId: process.env.CLOUDBASE_SECRET_ID,
  secretKey: process.env.CLOUDBASE_SECRET_KEY,
});

const db = app.database();
const conversationsCollection = db.collection("ai_conversations");

// 对现有数据进行迁移
const allConversations = await conversationsCollection.get();

for (const conv of allConversations.data) {
  // 初始化 aiConfigHistory
  const aiConfigHistory = [
    {
      version: 1,
      agentIds: conv.model ? [conv.model] : [],
      mode: "single",
      changedAt: conv.created_at,
      changedByUser: false,
    },
  ];

  // 更新消息，添加版本标记
  const updatedMessages = (conv.messages || []).map((msg, index) => ({
    ...msg,
    aiConfigVersion: {
      version: 1,
      agentIds: conv.model ? [conv.model] : [],
      mode: "single",
      startedAt: conv.created_at,
    },
    isUserMessage: msg.role === "user",
  }));

  // 保存更新
  await conversationsCollection.doc(conv._id).update({
    messages: updatedMessages,
    aiConfigHistory,
    currentAIConfigVersion: 1,
  });
}
```

#### 第2步：修改 send/route.ts 中的上下文获取逻辑

```typescript
/**
 * 智能上下文提取函数
 * 根据当前 AI 配置只提取相关的消息
 */
function extractContextMessages(
  allMessages: ConversationMessage[],
  currentAgentIds: string[],
  maxMessages: number = 20
): AIMessage[] {
  // 策略：
  // 1. 如果用户新切换了 AI，只获取切换点之后的消息
  // 2. 不同 AI 配置之间的消息分别处理
  // 3. 最多保留 20 条相关消息

  const recentMessages = allMessages.slice(-40); // 先取最近 40 条

  let relevantMessages: ConversationMessage[] = [];
  let lastConfigVersion = currentAgentIds;

  // 从后往前遍历，找到第一个配置变化点
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];

    // 检查配置是否变化
    if (msg.aiConfigVersion) {
      const configAgents = msg.aiConfigVersion.agentIds;

      // 如果配置完全不同，停止收集
      if (
        JSON.stringify(configAgents.sort()) !==
        JSON.stringify(lastConfigVersion.sort())
      ) {
        // 如果找到了配置变化点，从这里开始收集
        if (relevantMessages.length > 0) {
          break; // 停止，因为已经跨越了配置边界
        }
      }
    }

    relevantMessages.unshift(msg);
  }

  // 最多返回 maxMessages 条
  if (relevantMessages.length > maxMessages) {
    relevantMessages = relevantMessages.slice(-maxMessages);
  }

  // 转换为 AIMessage 格式
  return relevantMessages.map((msg) => {
    let contentStr = "";

    if (msg.isMultiAI && msg.agentResponses) {
      // 多 AI 响应：只提取新 AI 相关的部分（如果可识别）
      // 或者合并所有响应
      contentStr = msg.agentResponses
        .map((resp) => `${resp.agentName}: ${resp.content}`)
        .join("\n\n");
    } else {
      contentStr = msg.content;
    }

    return {
      role: msg.role as "system" | "user" | "assistant",
      content: contentStr,
    };
  });
}
```

#### 第3步：修改消息保存逻辑

当用户切换 AI 时，增加配置版本号：

```typescript
/**
 * 检测并更新 AI 配置版本
 */
async function detectAndUpdateAIConfig(
  sessionId: string,
  userId: string,
  newAgentIds: string[],
  mode: string
) {
  const cloudbase = require("@cloudbase/node-sdk").init({
    env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
    secretId: process.env.CLOUDBASE_SECRET_ID,
    secretKey: process.env.CLOUDBASE_SECRET_KEY,
  });

  const db = cloudbase.database();
  const conv = await db
    .collection("ai_conversations")
    .doc(sessionId)
    .get();

  if (!conv.data || conv.data.length === 0) {
    return; // 会话不存在
  }

  const conversation = conv.data[0];
  const aiConfigHistory = conversation.aiConfigHistory || [];
  const lastConfig = aiConfigHistory[aiConfigHistory.length - 1];

  // 比较 AI 配置是否变化
  const agentIdsChanged =
    JSON.stringify(newAgentIds.sort()) !==
    JSON.stringify(lastConfig.agentIds.sort());

  if (agentIdsChanged) {
    // 配置发生了变化，增加版本号
    const newVersion = lastConfig.version + 1;

    const newConfig = {
      version: newVersion,
      agentIds: newAgentIds,
      mode: mode,
      changedAt: new Date().toISOString(),
      changedByUser: true,
    };

    aiConfigHistory.push(newConfig);

    // 更新会话
    await db
      .collection("ai_conversations")
      .doc(sessionId)
      .update({
        aiConfigHistory,
        currentAIConfigVersion: newVersion,
      });

    console.log(
      `[AI Config] Session ${sessionId} updated to version ${newVersion}`,
      { agentIds: newAgentIds, mode }
    );
  }
}
```

#### 第4步：在 send/route.ts 中集成新逻辑

```typescript
// 在获取上下文之前调用
if (isChinaRegion() && agentId) {
  // 多 AI 模式，检测配置变化
  const agentIds = Array.isArray(agentId) ? agentId : [agentId];
  await detectAndUpdateAIConfig(sessionId, userId, agentIds, "parallel");
}

// 获取相关的上下文消息
const history = extractContextMessages(
  session.messages || [],
  Array.isArray(agentId) ? agentId : [agentId],
  20
);
```

#### 第5步：添加 API 端点获取消息历史

```typescript
// app/api/chat/sessions/[id]/timeline/route.ts
/**
 * 获取某个时间段内的消息
 * 支持按 AI 配置版本筛选
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { version, agentId } = Object.fromEntries(req.nextUrl.searchParams);

  const conversation = await getConversation(params.id);

  let messages = conversation.messages;

  // 按版本筛选
  if (version) {
    messages = messages.filter(
      (m) => m.aiConfigVersion?.version === parseInt(version)
    );
  }

  // 按 AI 筛选
  if (agentId) {
    messages = messages.filter((m) =>
      m.aiConfigVersion?.agentIds.includes(agentId)
    );
  }

  // 按时间分组
  const grouped = messages.reduce((acc, msg) => {
    const configVersion = msg.aiConfigVersion?.version || 1;
    if (!acc[configVersion]) {
      acc[configVersion] = [];
    }
    acc[configVersion].push(msg);
    return acc;
  }, {});

  return Response.json({
    conversationId: params.id,
    messagesByVersion: grouped,
    configHistory: conversation.aiConfigHistory,
  });
}
```

## 📊 消息流示意图

```
原始情况（有问题）：
┌─────────────────────────────────────────────────────┐
│ messages: [                                         │
│   {user: "Q1"},                                    │
│   {ai: [通义千问, DeepSeek, Mistral, Claude]},   │
│   {user: "Q2"},                                    │
│   {ai: [通义千问, DeepSeek, Mistral, Claude]},   │
│   {user: "Q3"} ← 切换到 [Gemini, GPT-4]           │
│   {ai: [Gemini, GPT-4]} ← 看不清上下文             │
│ ]                                                   │
└─────────────────────────────────────────────────────┘

改进后（分组管理）：
┌─────────────────────────────────────────────────────┐
│ messages: [                                         │
│   {user: "Q1", version: 1},                        │
│   {ai: [...], version: 1},                         │
│   {user: "Q2", version: 1},                        │
│   {ai: [...], version: 1},                         │
│   {user: "Q3", version: 2} ← 配置切换！           │
│   {ai: [...], version: 2} ← 清晰上下文             │
│ ]                                                   │
│                                                    │
│ aiConfigHistory: [                                 │
│   {version: 1, agentIds: [通义,DeepSeek,...]},   │
│   {version: 2, agentIds: [Gemini, GPT-4]}        │
│ ]                                                   │
└─────────────────────────────────────────────────────┘

取上下文时的行为：
当 currentVersion = 2，agentIds = [Gemini, GPT-4]
  → 从消息末尾倒序查找
  → 找到最近的 version: 2 消息
  → 停止于 version: 1 的消息
  → 只返回 version: 2 的消息给 Gemini 和 GPT-4 ✓
```

## 🔄 实现清单

- [ ] 创建 CloudBase 迁移脚本（一次性运行）
- [ ] 修改 `lib/database/cloudbase-schema.ts` 更新 `ConversationMessage` 接口
- [ ] 修改 `app/api/chat/send/route.ts` 添加上下文提取逻辑
- [ ] 修改 `app/api/chat/multi-send/route.ts` 添加配置检测
- [ ] 创建 `app/api/chat/sessions/[id]/timeline/route.ts` 获取消息历史
- [ ] 添加前端 UI 展示消息分组和 AI 配置变化
- [ ] 测试：单 AI → 多 AI → 单 AI 等各种切换场景

## ✨ 优势总结

| 优势 | 说明 |
|------|------|
| **清晰追踪** | 完全清楚哪些消息属于哪组 AI |
| **智能过滤** | 新 AI 只看到相关的上下文 |
| **向后兼容** | 不影响现有数据，渐进式迁移 |
| **可审计** | 完整的配置历史记录 |
| **灵活查询** | 按版本、按 AI、按时间查询消息 |

---

**实现难度：** ⚠️ 中等
**优先级：** 🔴 高（影响多 AI 使用体验）
**预计工时：** 4-6 小时（完整实现 + 测试）
