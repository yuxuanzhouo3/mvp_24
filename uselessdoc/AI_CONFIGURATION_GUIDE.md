# AI配置指南 - 如何添加新的AI智能体

本文档说明如何在系统中添加和配置新的AI智能体。

## 📋 目录

- [快速添加新AI](#快速添加新ai)
- [配置文件详解](#配置文件详解)
- [添加新Provider](#添加新provider)
- [高级配置](#高级配置)
- [测试和调试](#测试和调试)

---

## 🚀 快速添加新AI

### 方法1: 使用现有Provider（推荐）

如果你要添加的AI模型使用已支持的Provider（OpenAI、Anthropic等），只需在配置文件中添加：

**文件**: `lib/ai/ai-agents.config.ts`

```typescript
{
  id: 'my-new-ai',               // 唯一ID
  name: '我的新AI',               // 显示名称
  provider: 'openai',            // 使用现有provider
  model: 'gpt-4',                // 模型名称
  role: '专业角色',               // 角色描述
  color: 'bg-blue-500',          // Tailwind颜色类
  systemPrompt: '你是...',       // 系统提示词
  temperature: 0.7,              // 温度参数
  capabilities: {                // 能力标签
    coding: true,
    analysis: true,
  },
  tags: ['标签1', '标签2'],       // 分类标签
  description: '这个AI的用途',    // 描述
  enabled: true,                 // 启用状态
  order: 50,                     // 显示顺序
}
```

### 方法2: 添加全新的Provider

如果需要集成新的AI服务商：

1. **创建Provider实现**

**文件**: `lib/ai/providers/my-provider.ts`

```typescript
import { BaseAIProvider } from './base-provider';
import { AIMessage, AIResponse, StreamChunk, ChatOptions, ModelInfo } from '../types';

export class MyProvider extends BaseAIProvider {
  readonly name = 'myprovider';
  readonly models = ['model-1', 'model-2'];
  readonly defaultModel = 'model-1';

  constructor() {
    super();
    // 初始化你的API客户端
  }

  getModelInfo(model: string): ModelInfo | null {
    // 返回模型信息
    return {
      id: model,
      name: 'My Model',
      provider: this.name,
      contextWindow: 4096,
      pricing: { prompt: 0.001, completion: 0.002 },
      capabilities: {
        streaming: true,
        functionCalling: false,
        vision: false,
      },
    };
  }

  async chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse> {
    // 实现非流式调用
    try {
      this.validateMessages(messages);
      const model = this.getValidModel(options?.model);

      // 调用你的API
      const result = await yourApiClient.chat({
        messages,
        model,
        temperature: options?.temperature,
      });

      return {
        content: result.content,
        tokens: {
          prompt: result.promptTokens,
          completion: result.completionTokens,
          total: result.totalTokens,
        },
        model: result.model,
        finish_reason: result.finishReason,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async *chatStream(messages: AIMessage[], options?: ChatOptions): AsyncIterableIterator<StreamChunk> {
    // 实现流式调用
    this.validateMessages(messages);
    const model = this.getValidModel(options?.model);

    const stream = await yourApiClient.chatStream({
      messages,
      model,
    });

    for await (const chunk of stream) {
      yield {
        content: chunk.content,
        done: chunk.isDone,
        tokens: chunk.tokens,
      };
    }
  }

  countTokens(messages: AIMessage[], model?: string): number {
    // 实现Token计数
    return messages.reduce((sum, msg) => sum + Math.ceil(msg.content.length / 4), 0);
  }
}
```

2. **注册Provider**

**文件**: `lib/ai/router.ts`

```typescript
import { MyProvider } from './providers/my-provider';

class AIRouter {
  private constructor() {
    this.initialize();
  }

  private initialize(): void {
    // ... existing providers ...

    // 添加你的provider
    if (process.env.MY_PROVIDER_API_KEY) {
      const myProvider = new MyProvider();
      this.registerProvider(myProvider);
    }
  }
}
```

3. **添加环境变量**

**文件**: `.env.local`

```bash
MY_PROVIDER_API_KEY=your-api-key-here
```

4. **在配置文件中添加AI**

**文件**: `lib/ai/ai-agents.config.ts`

```typescript
{
  id: 'my-custom-ai',
  name: '我的自定义AI',
  provider: 'myprovider',  // 你的provider名称
  model: 'model-1',
  role: '专家',
  color: 'bg-purple-500',
  systemPrompt: '你是一个...',
  temperature: 0.7,
  capabilities: { coding: true },
  tags: ['自定义'],
  description: '这是我添加的AI',
  enabled: true,
}
```

---

## 📖 配置文件详解

### AIAgentConfig 接口

```typescript
interface AIAgentConfig {
  // 必填字段
  id: string                  // 唯一标识符，全局唯一
  name: string                // 显示名称（中文）
  provider: string            // Provider名称: openai, anthropic等
  model: string               // 模型ID
  role: string                // 角色描述
  color: string               // Tailwind颜色类（如 bg-blue-500）
  systemPrompt: string        // 系统提示词
  capabilities: {             // AI的能力标签
    coding?: boolean
    analysis?: boolean
    creative?: boolean
    research?: boolean
    translation?: boolean
    math?: boolean
    [key: string]: boolean | undefined
  }
  tags: string[]              // 分类标签数组
  description: string         // 详细描述
  enabled: boolean            // 是否启用

  // 可选字段
  nameEn?: string             // 英文名称
  roleEn?: string             // 英文角色
  avatar?: string             // 头像URL
  temperature?: number        // 温度 (0-2)，默认0.7
  maxTokens?: number          // 最大token数
  topP?: number               // Top-p采样
  descriptionEn?: string      // 英文描述
  isPremium?: boolean         // 是否需要付费订阅
  order?: number              // 显示顺序
}
```

### 字段说明

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `id` | string | 全局唯一标识符 | `'gpt-4-turbo'` |
| `name` | string | 显示在UI的名称 | `'GPT-4 Turbo'` |
| `provider` | string | Provider标识 | `'openai'` |
| `model` | string | 实际的模型ID | `'gpt-4-turbo'` |
| `role` | string | 角色定位 | `'战略分析师'` |
| `color` | string | Tailwind背景色类 | `'bg-purple-500'` |
| `systemPrompt` | string | 定义AI行为的提示词 | `'你是一位...'` |
| `temperature` | number | 创造性程度(0-2) | `0.7` |
| `capabilities` | object | 能力标签 | `{ coding: true }` |
| `tags` | string[] | 用于搜索和分类 | `['编程', '技术']` |
| `enabled` | boolean | 是否在系统中启用 | `true` |
| `isPremium` | boolean | 是否需要付费 | `false` |
| `order` | number | 显示排序 | `10` |

---

## 🎯 最佳实践

### 1. 命名规范

```typescript
// ✅ 推荐
id: 'gpt-4-turbo'           // 小写，用连字符
name: 'GPT-4 Turbo'         // 首字母大写
role: '战略分析师'           // 简洁明确

// ❌ 不推荐
id: 'GPT4Turbo'             // 不要用驼峰
name: 'gpt4turbo'           // 不要全小写
role: '这是一个很厉害的AI'   // 太冗长
```

### 2. SystemPrompt 编写

```typescript
// ✅ 推荐 - 结构化、清晰
systemPrompt: `你是一位资深软件工程师。你的回答应该：
1. 提供清晰的代码示例
2. 解释关键概念
3. 考虑最佳实践
4. 包含必要的注释`

// ❌ 不推荐 - 模糊、泛泛
systemPrompt: '你是一个AI助手，请帮助用户'
```

### 3. Temperature 设置

```typescript
// 代码生成 - 低温度（更精确）
temperature: 0.3

// 通用对话 - 中等温度
temperature: 0.7

// 创意写作 - 高温度（更发散）
temperature: 0.9
```

### 4. 能力标签

```typescript
// ✅ 准确标注
capabilities: {
  coding: true,      // 确实擅长编程
  analysis: true,    // 确实擅长分析
}

// ❌ 避免过度标注
capabilities: {
  coding: true,
  analysis: true,
  creative: true,
  research: true,
  translation: true,
  math: true,
  design: true,     // 不要把所有标签都标上
}
```

---

## 🔌 添加新Provider示例

### 示例：集成Gemini

```typescript
// lib/ai/providers/gemini-provider.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseAIProvider } from './base-provider';

export class GeminiProvider extends BaseAIProvider {
  readonly name = 'gemini';
  readonly models = ['gemini-pro', 'gemini-pro-vision'];
  readonly defaultModel = 'gemini-pro';

  private client: GoogleGenerativeAI;

  constructor() {
    super();
    this.client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  }

  async chat(messages, options) {
    const model = this.client.getGenerativeModel({ model: options?.model || this.defaultModel });
    const result = await model.generateContent(messages[messages.length - 1].content);
    const response = await result.response;

    return {
      content: response.text(),
      tokens: { prompt: 0, completion: 0, total: 0 },
      model: options?.model || this.defaultModel,
      finish_reason: 'stop',
    };
  }

  // ... 其他必需方法
}
```

**配置**:

```typescript
// lib/ai/ai-agents.config.ts
{
  id: 'gemini-pro',
  name: 'Gemini Pro',
  provider: 'gemini',
  model: 'gemini-pro',
  role: 'Google AI助手',
  color: 'bg-blue-600',
  systemPrompt: '你是Google Gemini AI',
  capabilities: { coding: true, analysis: true },
  tags: ['Google', '多模态'],
  description: 'Google最新的多模态AI',
  enabled: true,
}
```

---

## 🧪 测试和调试

### 1. 测试单个AI

```typescript
import { getAgentById } from '@/lib/ai/ai-agents.config';
import { aiRouter } from '@/lib/ai/router';

// 获取AI配置
const agent = getAgentById('my-new-ai');

// 测试调用
const provider = aiRouter.getProviderForModel(agent.model);
const result = await provider.chat([
  { role: 'system', content: agent.systemPrompt },
  { role: 'user', content: '测试消息' }
], {
  model: agent.model,
  temperature: agent.temperature,
});

console.log(result);
```

### 2. 测试多AI协作

```bash
curl -X POST http://localhost:3000/api/chat/multi-send \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session",
    "message": "测试消息",
    "agentIds": ["gpt-3.5-turbo", "my-new-ai"],
    "mode": "parallel"
  }'
```

### 3. 调试技巧

```typescript
// 在provider中添加日志
console.log('[MyProvider] Request:', messages);
console.log('[MyProvider] Response:', result);
console.log('[MyProvider] Tokens:', result.tokens);

// 在配置中临时禁用其他AI
const AI_AGENTS_LIBRARY = AI_AGENTS_LIBRARY.map(a =>
  a.id === 'my-new-ai' ? a : { ...a, enabled: false }
);
```

---

## 📚 完整示例

### 添加一个"数学专家"AI

```typescript
// 1. 在 lib/ai/ai-agents.config.ts 中添加
{
  id: 'math-expert',
  name: '数学专家',
  nameEn: 'Math Expert',
  provider: 'openai',
  model: 'gpt-4-turbo',
  role: '数学教授',
  roleEn: 'Math Professor',
  color: 'bg-amber-600',
  systemPrompt: `你是一位数学教授。你的回答应该：
1. 使用LaTeX格式展示数学公式
2. 逐步展示求解过程
3. 解释每一步的数学原理
4. 提供相关的数学定理和公式`,
  temperature: 0.3, // 数学需要精确
  maxTokens: 4096,
  capabilities: {
    math: true,
    analysis: true,
    research: true,
  },
  tags: ['数学', '教育', '理工'],
  description: '专注于数学问题的求解、证明和教学',
  descriptionEn: 'Specialized in mathematical problem-solving, proofs, and teaching',
  enabled: true,
  isPremium: false,
  order: 30,
},
```

### 使用示例

```typescript
// 前端调用
const response = await fetch('/api/chat/multi-send', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    sessionId: 'session-123',
    message: '证明勾股定理',
    agentIds: ['math-expert'],
    mode: 'parallel',
  }),
});
```

---

## 🎓 高级技巧

### 动态加载AI配置

从数据库加载AI配置：

```typescript
// lib/ai/dynamic-agents.ts
export async function loadAgentsFromDatabase() {
  const { data } = await supabase.from('ai_agents').select('*').eq('enabled', true);
  return data.map(agent => ({
    ...agent,
    capabilities: JSON.parse(agent.capabilities),
    tags: JSON.parse(agent.tags),
  }));
}

// 在router中使用
const dbAgents = await loadAgentsFromDatabase();
AI_AGENTS_LIBRARY.push(...dbAgents);
```

### 条件启用AI

根据用户地区启用不同AI：

```typescript
const chinaAgents = getAgentsByProvider('deepseek');
const internationalAgents = getAgentsByProvider('openai');

const availableAgents = isChina ? chinaAgents : internationalAgents;
```

---

## ❓ 常见问题

### Q: 如何临时禁用某个AI？
A: 将配置中的 `enabled` 设为 `false`

### Q: 如何修改已有AI的提示词？
A: 直接修改配置文件中的 `systemPrompt` 字段

### Q: 如何添加付费AI？
A: 设置 `isPremium: true`，系统会自动检查用户订阅

### Q: Token计数不准确怎么办？
A: 实现精确的 `countTokens` 方法，或使用 tiktoken 库

---

## 📞 获取帮助

- 查看现有AI配置示例
- 参考 `BaseAIProvider` 文档
- 测试API端点 `/api/chat/multi-send`

---

**提示**: 每次修改配置后，重启开发服务器以加载新配置。
