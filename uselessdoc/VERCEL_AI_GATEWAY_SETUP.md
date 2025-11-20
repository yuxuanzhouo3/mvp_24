# Vercel AI Gateway 配置指南

## 概述

已将 OpenAI 和 Anthropic 配置为支持通过 Vercel AI Gateway 或其他代理服务访问。

## 环境变量配置

在 `.env.local` 文件中添加以下配置：

### 1. OpenAI 配置

```bash
# OpenAI API Key（必需）
OPENAI_API_KEY=your_openai_api_key

# OpenAI Base URL（可选，使用 AI Gateway）
# 默认: https://gateway.ai.cloudflare.com/v1/openai
OPENAI_BASE_URL=https://your-vercel-gateway.vercel.app/api/openai

# 可选：Organization ID
OPENAI_ORG_ID=your_org_id
```

### 2. Anthropic 配置

```bash
# Anthropic API Key（必需）
ANTHROPIC_API_KEY=your_anthropic_api_key

# Anthropic Base URL（可选，使用 AI Gateway）
ANTHROPIC_BASE_URL=https://your-vercel-gateway.vercel.app/api/anthropic
```

### 3. DeepSeek 配置（国内直连）

```bash
# DeepSeek API Key（必需）
DEEPSEEK_API_KEY=your_deepseek_api_key
```

## Vercel AI Gateway 选项

### 选项 1: Cloudflare AI Gateway

```bash
# OpenAI
OPENAI_BASE_URL=https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT_ID/YOUR_GATEWAY_ID/openai

# Anthropic
ANTHROPIC_BASE_URL=https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT_ID/YOUR_GATEWAY_ID/anthropic
```

### 选项 2: 自建 Vercel Edge Function 代理

创建 API 代理：

**`pages/api/openai/[...path].ts`**:

```typescript
import { NextRequest } from "next/server";

export const config = {
  runtime: "edge",
};

export default async function handler(req: NextRequest) {
  const path = req.nextUrl.pathname.replace("/api/openai/", "");
  const url = `https://api.openai.com/${path}`;

  const headers = new Headers(req.headers);
  headers.set("Authorization", `Bearer ${process.env.OPENAI_API_KEY}`);

  const response = await fetch(url, {
    method: req.method,
    headers,
    body: req.body,
  });

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
```

然后配置：

```bash
OPENAI_BASE_URL=https://your-app.vercel.app/api/openai
```

### 选项 3: 第三方 AI Gateway 服务

一些可用的服务：

- **OpenRouter**: `https://openrouter.ai/api/v1`
- **Helicone**: `https://oai.hconeai.com/v1`
- **Portkey**: `https://api.portkey.ai/v1`

## 测试配置

运行测试脚本验证配置：

```bash
# 测试 OpenAI
npx tsx scripts/test-openai-gateway.ts

# 测试 Anthropic
npx tsx scripts/test-anthropic-gateway.ts
```

## 代码说明

### OpenAI Provider

- 文件: `lib/ai/providers/openai-provider.ts`
- 支持通过 `OPENAI_BASE_URL` 自定义端点
- 默认使用 Cloudflare AI Gateway

### Anthropic Provider

- 文件: `lib/ai/providers/anthropic-provider.ts`
- 支持通过 `ANTHROPIC_BASE_URL` 自定义端点

### DeepSeek Provider

- 文件: `lib/ai/providers/deepseek-provider.ts`
- 国内直连，不需要 Gateway

## 优势

✅ **降低延迟**: 通过就近节点访问
✅ **提高稳定性**: 避免网络问题
✅ **成本优化**: 可使用缓存和负载均衡
✅ **监控统计**: Gateway 提供详细的使用统计
✅ **安全性**: API Key 不暴露给客户端

## 注意事项

1. **API Key 安全**: 永远不要在前端代码中暴露 API Key
2. **费用监控**: 定期检查 API 使用量和费用
3. **错误处理**: Gateway 可能有额外的错误码
4. **速率限制**: 注意 Gateway 的速率限制策略

## 故障排查

### 连接失败

```bash
# 检查环境变量
echo $OPENAI_BASE_URL

# 测试连接
curl -X POST $OPENAI_BASE_URL/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"Hello"}]}'
```

### 日志查看

服务器启动时会输出使用的 Base URL：

```
[OpenAI] Using base URL: https://gateway.ai.cloudflare.com/v1/openai
[Anthropic] Using base URL: https://your-gateway/api/anthropic
```

## 更多资源

- [Cloudflare AI Gateway 文档](https://developers.cloudflare.com/ai-gateway/)
- [Vercel Edge Functions 文档](https://vercel.com/docs/functions/edge-functions)
- [OpenRouter 文档](https://openrouter.ai/docs)
