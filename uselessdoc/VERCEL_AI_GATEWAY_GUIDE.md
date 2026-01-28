# Vercel AI Gateway 配置指南

## 🎯 概述

Vercel AI Gateway 提供**统一的 API 端点**来访问多个 AI 提供商，包括 OpenAI、Anthropic、Google Gemini、Meta、Mistral 等。

**关键优势：**

- ✅ **一个 API Key 访问所有提供商** - 不需要为每个 AI 服务单独配置
- ✅ **统一的接口格式** - 使用 OpenAI 兼容的 API 格式
- ✅ **自动故障转移** - 支持模型降级和提供商切换
- ✅ **内置监控和分析** - 实时查看使用情况和成本
- ✅ **缓存和优化** - 提高响应速度，降低成本

## 📋 配置步骤

### 1. 创建 AI Gateway API Key

1. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
2. 进入 **AI Gateway** 标签页
3. 点击左侧 **API Keys**
4. 点击 **Create Key** 按钮
5. 复制生成的 API Key

### 2. 配置环境变量

在 `.env.local` 文件中添加：

```bash
# Vercel AI Gateway（统一端点）
AI_GATEWAY_API_KEY=your_vercel_ai_gateway_api_key_here
```

**就这么简单！** 不需要配置 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY` 等单独的密钥。

### 3. 使用模型

在代码中使用以下格式指定模型：

```typescript
// OpenAI 模型
const model = "openai/gpt-4o";
const model = "openai/gpt-4o-mini";
const model = "openai/gpt-3.5-turbo";

// Anthropic 模型
const model = "anthropic/claude-sonnet-4";
const model = "anthropic/claude-opus-4";
const model = "anthropic/claude-haiku-4";

// Google 模型
const model = "google/gemini-2.0-flash";
const model = "google/gemini-1.5-pro";

// Meta 模型
const model = "meta/llama-3-70b";

// Mistral 模型
const model = "mistral/mistral-large";
```

## 🔑 Bring Your Own Key (BYOK) - 可选

如果您希望使用自己的 API Key（例如利用 OpenAI 信用额度或访问私有数据），可以在 Vercel Dashboard 中添加：

### 添加自定义 API Key

1. 进入 **AI Gateway** > **Integrations**
2. 找到对应的提供商（如 OpenAI、Anthropic）
3. 点击 **Add** 按钮
4. 输入您的 API Key
5. 确保 **Enabled** 开关打开
6. 点击 **Test Key** 验证

**工作原理：**

- 如果配置了 BYOK，AI Gateway 会优先使用您的 API Key
- 如果您的 Key 失败，会自动回退到 Vercel 的系统凭据（提高可用性）
- 使用 BYOK 不会产生额外费用

## 📊 监控和分析

### 查看使用情况

1. 进入 **AI Gateway** > **Overview**
2. 查看实时指标：
   - 请求次数
   - Token 使用量
   - 成本估算
   - 响应时间
   - 错误率

### 按模型查看

点击 **Models** 标签查看每个模型的详细使用情况。

## 🔧 高级配置

### 模型故障转移

在请求中指定备选模型：

```typescript
{
  model: "openai/gpt-4o",
  models: ["openai/gpt-4o-mini", "anthropic/claude-sonnet-4"] // 降级列表
}
```

### Provider 优先级

指定 Provider 优先顺序：

```typescript
{
  model: "anthropic/claude-sonnet-4",
  providerOptions: {
    gateway: {
      order: ["anthropic", "vertex"] // 优先使用 Anthropic，失败则用 Vertex AI
    }
  }
}
```

### Reasoning 配置

对于支持推理的模型（如 Claude、o1）：

```typescript
{
  model: "anthropic/claude-sonnet-4",
  reasoning: {
    enabled: true,
    max_tokens: 2000 // 限制推理 token 数量
  }
}
```

## 🧪 测试配置

创建测试脚本 `scripts/test-ai-gateway.ts`：

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  baseURL: "https://ai-gateway.vercel.sh/v1",
});

async function test() {
  console.log("[AI Gateway Test]");
  console.log("API Key:", process.env.AI_GATEWAY_API_KEY?.slice(0, 10) + "...");

  // 测试 OpenAI
  const openaiResponse = await client.chat.completions.create({
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "Say hello!" }],
  });
  console.log("OpenAI:", openaiResponse.choices[0].message.content);

  // 测试 Anthropic
  const anthropicResponse = await client.chat.completions.create({
    model: "anthropic/claude-haiku-4",
    messages: [{ role: "user", content: "Say hello!" }],
  });
  console.log("Anthropic:", anthropicResponse.choices[0].message.content);
}

test().catch(console.error);
```

运行测试：

```bash
npx tsx scripts/test-ai-gateway.ts
```

## 💰 成本优化

### 使用缓存

AI Gateway 自动缓存相同的请求，无需额外配置。

### 选择合适的模型

- **快速任务**: `openai/gpt-4o-mini`, `anthropic/claude-haiku-4`
- **复杂任务**: `openai/gpt-4o`, `anthropic/claude-sonnet-4`
- **最高质量**: `anthropic/claude-opus-4`

### 设置预算限制

在 Vercel Dashboard 设置每月预算告警。

## 🚨 故障排除

### 1. API Key 无效

**错误**: `401 Unauthorized`

**解决**:

- 检查 `AI_GATEWAY_API_KEY` 是否正确配置
- 在 Vercel Dashboard 验证 Key 是否有效
- 重新创建 API Key

### 2. 模型不可用

**错误**: `Model not found`

**解决**:

- 确认模型名称格式正确（`provider/model`）
- 查看 [支持的模型列表](https://vercel.com/ai-gateway/models)
- 使用备选模型

### 3. 速率限制

**错误**: `429 Too Many Requests`

**解决**:

- 在代码中实现重试逻辑
- 使用指数退避策略
- 升级 Vercel 计划获得更高限额

## 📚 参考资源

- [Vercel AI Gateway 官方文档](https://vercel.com/docs/ai-gateway)
- [OpenAI 兼容 API 文档](https://vercel.com/docs/ai-gateway/openai-compat)
- [支持的模型列表](https://vercel.com/ai-gateway/models)
- [Pricing 信息](https://vercel.com/docs/ai-gateway/pricing)

## ✅ 快速开始检查清单

- [ ] 创建 Vercel AI Gateway API Key
- [ ] 在 `.env.local` 中添加 `AI_GATEWAY_API_KEY`
- [ ] 运行测试脚本验证配置
- [ ] 查看 Dashboard 确认请求正常
- [ ] （可选）添加 BYOK 凭据

完成这些步骤后，您就可以通过一个统一的 API 访问所有 AI 模型了！
