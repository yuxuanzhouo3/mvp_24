# 🔧 AI 双配置系统使用指南

## 📁 文件结构

```
lib/ai/
├── types.ts                  # 类型定义
├── china-ai.config.ts        # 🇨🇳 中国区域配置
├── global-ai.config.ts       # 🌍 全球区域配置
└── ai-config-loader.ts       # 配置加载器

app/api/config/
└── ai/route.ts               # AI 配置 API 接口
```

---

## 🚀 快速开始

### 1️⃣ 配置 API 密钥

复制环境变量示例文件：

```bash
cp .env.ai.example .env.local
```

根据你的区域编辑 `.env.local`：

**🇨🇳 中国区域**（只需配置一个）：

```bash
DEEPSEEK_API_KEY=sk-your-deepseek-key
```

**🌍 全球区域**（至少配置一个）：

```bash
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
```

### 2️⃣ 测试配置

运行测试脚本验证配置：

```bash
npx tsx scripts/test-ai-config.ts
```

### 3️⃣ 启动服务

```bash
npm run dev
```

访问 API：

- 本地测试：`http://localhost:3000/api/config/ai`
- 调试中国区域：`http://localhost:3000?debug=china`
- 调试全球区域：`http://localhost:3000?debug=global`

---

## 🔍 工作原理

### 数据流程

```
用户请求
    ↓
middleware.ts (IP 检测)
    ↓
设置 HTTP Header: X-User-Region
    ↓
/api/config/ai (读取 Header)
    ↓
ai-config-loader.ts (加载配置)
    ↓
china-ai.config.ts 或 global-ai.config.ts
    ↓
返回对应区域的 AI 列表
```

### 区域判断逻辑

| IP 来源   | middleware 检测        | 加载配置              |
| --------- | ---------------------- | --------------------- |
| 中国大陆  | `X-User-Region: china` | `china-ai.config.ts`  |
| 美国/其他 | `X-User-Region: usa`   | `global-ai.config.ts` |
| 欧洲      | ❌ 403 禁止访问        | -                     |

---

## 📝 添加新 AI 模型

### 🇨🇳 添加中国区域 AI

编辑 `lib/ai/china-ai.config.ts`：

```typescript
export const CHINA_AI_AGENTS: AIAgent[] = [
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    provider: "deepseek",
    model: "deepseek-chat",
    description: "强大的中文理解能力",
    capabilities: ["coding", "analysis"],
    maxTokens: 4096,
    temperature: 0.7,
    icon: "🤖",
  },
  // 👇 添加新模型
  {
    id: "qwen-turbo",
    name: "通义千问",
    provider: "qwen",
    model: "qwen-turbo",
    description: "阿里云通义千问",
    capabilities: ["conversation", "creative"],
    maxTokens: 2048,
    temperature: 0.8,
    icon: "☁️",
  },
];

export const CHINA_PROVIDERS: AIProviderConfig[] = [
  // ... existing providers
  // 👇 添加 API 配置
  {
    provider: "qwen",
    apiKey: process.env.QWEN_API_KEY || "",
    baseURL: "https://dashscope.aliyuncs.com/api/v1",
    enabled: !!process.env.QWEN_API_KEY,
  },
];
```

添加环境变量到 `.env.local`：

```bash
QWEN_API_KEY=sk-your-qwen-key
```

### 🌍 添加全球区域 AI

编辑 `lib/ai/global-ai.config.ts`，步骤同上。

---

## 🔐 安全注意事项

### ✅ 安全做法

- ✅ API 密钥只存在 `.env.local`（不提交到 Git）
- ✅ 后端 API 不返回密钥到前端
- ✅ middleware 设置的 Header 用户无法伪造
- ✅ 区域检测基于服务器端 IP

### ❌ 不安全做法

- ❌ 不要在前端代码中硬编码 API 密钥
- ❌ 不要通过 URL 参数传递密钥
- ❌ 不要让用户手动选择区域（容易绕过限制）

---

## 🧪 调试模式

### 本地开发调试

在 URL 添加 `?debug=china` 或 `?debug=global` 参数：

```bash
# 强制使用中国配置
http://localhost:3000?debug=china

# 强制使用全球配置
http://localhost:3000?debug=global
```

### 检查区域检测

查看浏览器开发者工具 → Network → 查看响应头：

```
X-User-Region: china
X-User-Country: CN
X-User-Currency: CNY
X-Debug-Mode: true (调试模式时)
```

---

## 📊 API 响应示例

### 成功响应

```json
{
  "success": true,
  "region": "china",
  "country": "CN",
  "agents": [
    {
      "id": "deepseek-chat",
      "name": "DeepSeek Chat",
      "provider": "deepseek",
      "model": "deepseek-chat",
      "description": "强大的中文理解能力",
      "capabilities": ["coding", "analysis"],
      "maxTokens": 4096,
      "temperature": 0.7,
      "icon": "🤖"
    }
  ],
  "totalAgents": 1,
  "providers": [
    {
      "provider": "deepseek",
      "enabled": true,
      "baseURL": "https://api.deepseek.com"
    }
  ]
}
```

### 错误响应（无可用 AI）

```json
{
  "error": "No AI providers enabled",
  "message": "Please configure API keys in environment variables",
  "region": "china",
  "country": "CN"
}
```

---

## 🛠️ 常见问题

### Q: 为什么我配置了 API 密钥但 AI 还是不可用？

A: 检查以下几点：

1. `.env.local` 文件在项目根目录
2. 重启开发服务器（`npm run dev`）
3. 运行 `npx tsx scripts/test-ai-config.ts` 查看详细状态

### Q: 如何禁用某个 AI？

A: 删除或注释掉对应的环境变量即可，系统会自动禁用。

### Q: 中国用户能访问 GPT 吗？

A: 不能。middleware 根据 IP 自动分配区域，中国用户只能看到中国配置的 AI。

### Q: 我想在本地测试全球配置怎么办？

A: 使用调试参数：`http://localhost:3000?debug=global`

---

## 📚 相关文件

- `middleware.ts` - IP 检测和区域路由
- `lib/architecture-modules/core/geo-router.ts` - 地理位置检测器
- `app/api/chat/route.ts` - 聊天 API（需要集成配置加载器）
- `components/gpt-library.tsx` - AI 模型选择界面（需要更新）

---

## 🎯 下一步

1. ✅ 配置已完成
2. 🔄 集成到前端组件（`gpt-library.tsx`）
3. 🔄 集成到聊天 API（`/api/chat/*`）
4. 🔄 实现 Provider 工厂模式
5. 🔄 添加更多 AI 模型

---

**需要帮助？** 查看测试脚本输出或联系开发团队。
