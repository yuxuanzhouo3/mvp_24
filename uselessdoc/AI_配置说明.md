# AI配置说明 - 智能体API配置指南

## 📋 概述

本系统采用**三层配置架构**，实现了AI智能体的统一管理：

1. **环境变量层** - API密钥配置
2. **智能体配置层** - AI智能体统一配置文件（核心）
3. **Provider层** - API调用实现

---

## 🔑 第一层：环境变量配置 (API密钥)

**文件位置**: `.env.local`

这一层配置各个AI服务商的API密钥：

```bash
# OpenAI配置
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_ORG_ID=org-xxxxx  # 可选

# Anthropic Claude配置
ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key-here

# DeepSeek配置（国内）
DEEPSEEK_API_KEY=your-deepseek-api-key-here

# 其他AI服务商...
```

**作用**：
- 存储敏感的API密钥
- 决定哪些Provider会被加载
- 如果某个Provider的API密钥不存在，该Provider不会被注册

---

## 🎯 第二层：智能体配置文件（核心）

**文件位置**: `lib/ai/ai-agents.config.ts`

### ⭐ 这就是你要的"统一配置文件"！

这个文件是**所有AI智能体的中央配置库**，所有AI都在这里统一管理。

### 配置结构

```typescript
export const AI_AGENTS_LIBRARY: AIAgentConfig[] = [
  {
    // === 基本信息 ===
    id: 'gpt-4-turbo',              // 唯一ID（必填）
    name: 'GPT-4 Turbo',            // 显示名称（必填）
    nameEn: 'GPT-4 Turbo',          // 英文名称（可选）

    // === 技术配置 ===
    provider: 'openai',             // 使用哪个Provider（必填）
    model: 'gpt-4-turbo',           // 具体模型ID（必填）

    // === 角色定位 ===
    role: '全能战略家',              // 角色描述（必填）
    roleEn: 'Strategic Thinker',    // 英文角色（可选）
    color: 'bg-purple-500',         // UI颜色（Tailwind）（必填）

    // === Prompt配置 ===
    systemPrompt: '你是一位经验丰富的战略顾问...',  // 系统提示词（必填）
    temperature: 0.7,               // 温度参数 0-2（可选，默认0.7）
    maxTokens: 4096,                // 最大Token数（可选）
    topP: 1.0,                      // Top-p采样（可选）

    // === 能力标签 ===
    capabilities: {
      coding: true,                 // 编程能力
      analysis: true,               // 分析能力
      creative: true,               // 创意能力
      research: true,               // 研究能力
      translation: false,           // 翻译能力
      math: false,                  // 数学能力
    },

    // === 分类和搜索 ===
    tags: ['通用', '高级', '战略'],  // 分类标签（必填）
    description: 'OpenAI最强模型',  // 描述（必填）
    descriptionEn: 'Most powerful OpenAI model',  // 英文描述（可选）

    // === 状态和权限 ===
    enabled: true,                  // 是否启用（必填）
    isPremium: true,                // 是否需要付费订阅（可选）
    order: 1,                       // 显示顺序（可选）
  },

  // 更多AI配置...
]
```

### 已预配置的智能体

系统已经预配置了12个AI智能体：

| ID | 名称 | Provider | 用途 |
|---|---|---|---|
| `gpt-4-turbo` | GPT-4 Turbo | OpenAI | 全能战略家 |
| `gpt-3.5-turbo` | GPT-3.5 Turbo | OpenAI | 高效助手 |
| `claude-3.5-sonnet` | Claude 3.5 Sonnet | Anthropic | 深度思考者 |
| `claude-3-opus` | Claude 3 Opus | Anthropic | 顶级智者 |
| `claude-3-haiku` | Claude 3 Haiku | Anthropic | 快速响应者 |
| `code-expert` | 代码专家 | OpenAI | 资深工程师 |
| `business-analyst` | 商业分析师 | OpenAI | 战略顾问 |
| `creative-writer` | 创意作家 | Anthropic | 文案大师 |
| `research-assistant` | 研究助手 | OpenAI | 学术研究员 |
| `translator` | 翻译专家 | OpenAI | 多语言专家 |
| `deepseek-chat` | DeepSeek Chat | DeepSeek | 通用助手（国内）|

### 如何添加新的AI智能体

**方法1：使用现有Provider（最简单）**

只需在 `AI_AGENTS_LIBRARY` 数组中添加新配置：

```typescript
{
  id: 'my-data-analyst',
  name: '数据分析专家',
  provider: 'openai',              // 使用已有的OpenAI Provider
  model: 'gpt-4-turbo',
  role: '数据科学家',
  color: 'bg-blue-600',
  systemPrompt: `你是专业的数据分析师。你的分析应该：
1. 基于数据驱动
2. 使用统计方法
3. 可视化建议
4. 清晰的结论`,
  temperature: 0.5,
  capabilities: {
    analysis: true,
    math: true,
    research: true,
  },
  tags: ['数据', '分析', '统计'],
  description: '专业数据分析和洞察',
  enabled: true,
  order: 30,
}
```

**就这么简单！无需修改任何其他代码！**

### 工具函数

配置文件提供了丰富的工具函数：

```typescript
// 获取所有启用的AI
const allAgents = getEnabledAgents();

// 根据ID获取AI
const gpt4 = getAgentById('gpt-4-turbo');

// 根据Provider筛选
const openaiAgents = getAgentsByProvider('openai');
const claudeAgents = getAgentsByProvider('anthropic');

// 根据能力筛选
const codingAgents = getAgentsByCapability('coding');
const creativeAgents = getAgentsByCapability('creative');

// 根据标签搜索
const techAgents = searchAgentsByTags(['编程', '技术']);

// 获取免费/付费AI
const freeAgents = getFreeAgents();
const premiumAgents = getPremiumAgents();

// 验证用户是否能使用某个AI
const canUse = isAgentAvailable('gpt-4-turbo', 'free');  // false
const canUse2 = isAgentAvailable('gpt-3.5-turbo', 'free');  // true

// 批量验证
const validation = validateAgents(['gpt-4-turbo', 'claude-3-opus'], 'free');
// 返回: { valid: [], invalid: [], needsUpgrade: ['gpt-4-turbo', 'claude-3-opus'] }
```

---

## 🔌 第三层：Provider实现

**文件位置**: `lib/ai/providers/`

这一层是实际调用各个AI服务商API的代码实现。

### 已实现的Provider

1. **`base-provider.ts`** - 抽象基类
2. **`openai-provider.ts`** - OpenAI GPT系列
3. **`anthropic-provider.ts`** - Anthropic Claude系列

### Provider注册

所有Provider在 `lib/ai/router.ts` 中自动注册：

```typescript
// lib/ai/router.ts
private initialize(): void {
  // 如果环境变量中有OpenAI密钥，注册OpenAI Provider
  if (process.env.OPENAI_API_KEY) {
    const openaiProvider = new OpenAIProvider();
    this.registerProvider(openaiProvider);
  }

  // 如果环境变量中有Anthropic密钥，注册Anthropic Provider
  if (process.env.ANTHROPIC_API_KEY) {
    const anthropicProvider = new AnthropicProvider();
    this.registerProvider(anthropicProvider);
  }

  // 添加新Provider时在这里注册...
}
```

### 如何添加新的Provider

详细步骤参见 [`AI_CONFIGURATION_GUIDE.md`](./AI_CONFIGURATION_GUIDE.md) 文件。

---

## 🎮 协作模式配置

系统支持4种AI协作模式，也在配置文件中定义：

```typescript
export const COLLABORATION_MODES = {
  sequential: {
    id: 'sequential',
    name: '顺序协作',
    description: 'AI按顺序处理，后续AI可看到前面的结果',
  },
  parallel: {
    id: 'parallel',
    name: '并行协作',
    description: 'AI同时独立处理，提供多角度分析',
  },
  debate: {
    id: 'debate',
    name: '辩论模式',
    description: 'AI互相质疑反驳，深入探讨',
  },
  synthesis: {
    id: 'synthesis',
    name: '综合模式',
    description: '先并行分析，再由主AI综合',
  },
}
```

---

## 📡 API使用

### 单AI对话

```bash
POST /api/chat/send
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": "session-123",
  "message": "你好",
  "model": "gpt-4-turbo"  # 使用配置文件中定义的model
}
```

### 多AI协作

```bash
POST /api/chat/multi-send
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": "session-123",
  "message": "分析这个商业计划",
  "agentIds": [            # 使用配置文件中定义的id
    "business-analyst",
    "code-expert",
    "research-assistant"
  ],
  "mode": "parallel",      # sequential | parallel | debate | synthesis
  "rounds": 2              # 仅在debate模式下有效
}
```

---

## 🔄 配置流程总结

### 添加新AI的完整流程：

```
1. 确保Provider已实现
   ↓ (如果是OpenAI/Anthropic，已实现，跳到步骤3)

2. 实现新Provider（如需要）
   - 创建 lib/ai/providers/your-provider.ts
   - 在 lib/ai/router.ts 中注册
   - 在 .env.local 中添加API密钥
   ↓

3. 在配置文件添加AI智能体
   - 打开 lib/ai/ai-agents.config.ts
   - 在 AI_AGENTS_LIBRARY 数组中添加新配置
   - 设置 enabled: true
   ↓

4. 完成！
   - 新AI自动在系统中可用
   - 可通过API调用
   - 可参与多AI协作
```

### 临时禁用某个AI：

```typescript
// 在 lib/ai/ai-agents.config.ts 中
{
  id: 'gpt-4-turbo',
  // ... 其他配置 ...
  enabled: false,  // 改为 false 即可
}
```

### 修改AI的行为：

```typescript
// 在 lib/ai/ai-agents.config.ts 中
{
  id: 'code-expert',
  // ... 其他配置 ...
  systemPrompt: '新的系统提示词...',  // 修改这里
  temperature: 0.3,                  // 或修改温度
}
```

---

## 📊 配置架构图

```
用户请求
   ↓
API端点 (/api/chat/multi-send)
   ↓
读取智能体配置 (lib/ai/ai-agents.config.ts) ← 📌 核心配置文件
   ↓
多AI编排器 (lib/ai/multi-agent-orchestrator.ts)
   ↓
AI路由器 (lib/ai/router.ts)
   ↓
Provider实现
   ├─ OpenAIProvider (lib/ai/providers/openai-provider.ts)
   ├─ AnthropicProvider (lib/ai/providers/anthropic-provider.ts)
   └─ 其他Provider...
   ↓
调用AI API
   ├─ OpenAI API (使用 .env.local 中的 OPENAI_API_KEY)
   ├─ Anthropic API (使用 .env.local 中的 ANTHROPIC_API_KEY)
   └─ 其他API...
   ↓
返回结果
```

---

## ✅ 快速检查清单

### 要添加新AI？

- [ ] Provider已实现？（OpenAI/Anthropic已有）
- [ ] API密钥已配置在 `.env.local`？
- [ ] 在 `lib/ai/ai-agents.config.ts` 添加配置
- [ ] 设置 `enabled: true`
- [ ] 重启开发服务器

### 要修改AI行为？

- [ ] 打开 `lib/ai/ai-agents.config.ts`
- [ ] 找到对应的AI配置（通过id）
- [ ] 修改 `systemPrompt` 或其他参数
- [ ] 重启开发服务器

### 要禁用AI？

- [ ] 在 `lib/ai/ai-agents.config.ts` 中设置 `enabled: false`
- [ ] 重启开发服务器

---

## 🎓 最佳实践

1. **所有AI配置集中管理** - 永远在 `lib/ai/ai-agents.config.ts` 中配置，不要散落在代码各处
2. **使用描述性ID** - 用 `code-expert` 而不是 `ai-1`
3. **合理设置温度** - 代码生成用低温(0.3)，创意写作用高温(0.9)
4. **准确标注能力** - 只标注真正擅长的能力
5. **提供清晰的systemPrompt** - 明确定义AI的角色和行为规范

---

## 🆘 常见问题

**Q: 我添加了新AI，为什么不显示？**
A: 检查 `enabled: true` 且重启了开发服务器

**Q: 提示找不到Provider？**
A: 检查 `.env.local` 中对应的API密钥是否配置

**Q: 如何修改AI的回答风格？**
A: 修改配置文件中的 `systemPrompt` 字段

**Q: 能动态从数据库加载AI配置吗？**
A: 可以，参考 `AI_CONFIGURATION_GUIDE.md` 中的"动态加载AI配置"章节

---

## 📞 相关文件

- **核心配置**: [`lib/ai/ai-agents.config.ts`](./lib/ai/ai-agents.config.ts)
- **详细指南**: [`AI_CONFIGURATION_GUIDE.md`](./AI_CONFIGURATION_GUIDE.md)
- **Provider实现**: `lib/ai/providers/`
- **API路由**: `app/api/chat/`
- **编排器**: [`lib/ai/multi-agent-orchestrator.ts`](./lib/ai/multi-agent-orchestrator.ts)

---

**总结**: `lib/ai/ai-agents.config.ts` 就是你要的统一配置文件。所有AI智能体都在这里集中管理，添加、修改、禁用AI都只需要编辑这一个文件！
