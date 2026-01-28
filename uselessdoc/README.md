# MultiGPT Platform

## 🚀 生产部署 (Production Deployment)

### 安全修复 (Security Fixes)

本项目已实施以下生产前必须的安全修复：

#### ✅ Webhook 签名验证

- 修复了开发环境下跳过 Stripe webhook 签名验证的问题
- 生产环境现在强制验证所有 webhook 签名
- 防止恶意 webhook 请求

#### ✅ 用户认证检查

- 在支付 API 路由中添加了用户认证验证
- 使用 JWT token 验证用户身份
- 防止未授权访问敏感 API

#### ✅ 数据库备份

- 实现了自动数据库备份脚本 (`scripts/backup-database.ts`)
- GitHub Actions 工作流每日自动备份
- 保留最近 7 天的备份文件
- 支持手动备份：`npm run db:backup`

#### ✅ 统一订阅状态管理

- 改进了 `webhook-handler.ts` 中的订阅状态管理
- 添加了用户存在性验证
- 增强了错误处理和日志记录
- 确保订阅状态在所有表中保持一致

### 部署前检查清单 (Pre-deployment Checklist)

- [x] Webhook 签名验证已修复
- [x] 用户认证检查已实现
- [x] 数据库备份策略已添加
- [x] 订阅状态管理已统一
- [ ] 设置生产环境变量
- [ ] 配置数据库备份存储
- [ ] 测试 webhook 处理
- [ ] 验证用户认证流程

## 调试模式 (Debug Mode)

本项目支持强大的调试模式，用于在本地测试不同区域的功能，无需 VPN 或实际地理位置切换。

⚠️ **注意**: 调试模式仅在开发环境 (`NODE_ENV=development`) 中可用，生产环境会自动禁用以确保安全。

### 🚀 快速开始

在任意页面 URL 中添加 `?debug=china`、`?debug=usa` 或 `?debug=europe` 参数：

#### 中国系统测试

```
http://localhost:3000?debug=china
http://localhost:3000/auth?debug=china
http://localhost:3000/payment?debug=china
```

- 显示中国专属 AI 列表
- 登录页面显示"微信登录（开发中）"
- 支付页面显示微信支付、支付宝选项
- 自动切换到中文界面

#### 国际系统测试

```
http://localhost:3000?debug=usa
http://localhost:3000/auth?debug=usa
http://localhost:3000/payment?debug=usa
```

- 显示所有 AI 列表（包括中国和国际 AI）
- 登录页面显示 Google 登录
- 支付页面显示 Stripe、PayPal 选项
- 支持英文界面

#### 欧洲系统测试

```
http://localhost:3000?debug=europe
```

- 显示国际 AI 列表
- 登录页面显示邮箱登录
- 支付功能被禁用（GDPR 合规）
- 支持多语言界面

### 调试模式特性

1. **全程持续**: debug 参数会在所有页面跳转中自动保留，无需重复添加
2. **实时切换**: 在调试面板中可以实时切换不同区域，无需修改 URL
3. **视觉指示**: 右上角显示彩色调试模式指示器，清晰显示当前模拟区域
4. **完整模拟**: 包括 AI 过滤、登录方式、支付方式、语言设置的完整区域体验
5. **一键退出**: 可随时点击退出按钮回到正常模式
6. **安全限制**: 仅在本地开发环境有效，生产环境自动禁用

### 调试模式指示器

当启用调试模式时，页面右上角会显示彩色的调试面板：

- 🇨🇳 **中国模式**: 红色背景
- 🇺🇸 **美国模式**: 蓝色背景
- 🇪🇺 **欧洲模式**: 绿色背景

点击面板可展开，显示：

- 当前模拟区域
- 区域切换按钮
- "退出调试模式"按钮

### 注意事项

- ✅ 调试模式仅在开发环境 (`NODE_ENV=development`) 有效
- 🚫 生产环境会返回 403 错误并阻止访问
- 🔄 所有页面跳转都会自动保留 debug 参数
- 🎯 支持在任何页面进入或退出调试模式
- 🛡️ 生产环境部署时自动禁用，无需手动清理代码

### 测试场景示例

```bash
# 测试支付宝支付（中国区域）
http://localhost:3000/payment?debug=china

# 测试Stripe支付（美国区域）
http://localhost:3000/payment?debug=usa

# 测试GDPR限制（欧洲区域）
http://localhost:3000/payment?debug=europe

# 测试AI模型过滤
http://localhost:3000?debug=china  # 只显示中国可用的AI
http://localhost:3000?debug=usa    # 显示所有AI模型
```

**智能多 GPT 协作平台，支持地理分流和多地区部署**

[![Next.js](https://img.shields.io/badge/Next.js-15.2.4-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-2.76-green?style=flat-square&logo=supabase)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Vercel-Deploy-black?style=flat-square&logo=vercel)](https://vercel.com/)

## 📖 项目概述

MultiGPT Platform 是一个现代化的多 GPT 协作平台，集成了智能地理分流、支付系统和多数据库支持。平台根据用户地理位置自动选择合适的数据库和支付方式，提供合规的全球化服务。

## ✨ 核心特性

### 🌍 智能地理分流

- **自动 IP 检测**：实时识别用户地理位置
- **地区合规**：欧洲用户自动禁用支付（GDPR 合规）
- **智能路由**：国内/国外用户自动分流到对应系统

### 💰 支付系统集成

- **多支付提供商**：支持 Stripe、微信支付、支付宝
- **订阅管理**：灵活的订阅计划和账单管理
- **地区适配**：根据地区自动选择合适的支付方式

### 🗄️ 多数据库支持

- **Supabase**：海外用户数据存储
- **CloudBase**：国内用户数据存储
- **自动切换**：基于地理位置智能选择

### 🎨 现代化 UI

- **响应式设计**：完美适配桌面和移动设备
- **多语言支持**：中文/英文界面
- **暗色模式**：舒适的视觉体验

## 🏗️ 技术架构

```
MultiGPT Platform/
├── app/                          # Next.js App Router
│   ├── api/                     # API路由
│   ├── payment/                 # 支付页面
│   └── globals.css              # 全局样式
├── components/                   # React组件
│   ├── payment/                 # 支付相关组件
│   ├── ui/                      # UI组件库
│   └── header.tsx               # 导航栏
├── lib/                         # 工具库
│   ├── architecture-modules/    # 架构模块
│   ├── payment/                 # 支付服务
│   └── types/                   # 类型定义
├── middleware.ts                # IP检测中间件
├── supabase/                    # Supabase配置
│   ├── config.toml             # 本地配置
│   └── migrations/             # 数据库迁移
└── vercel.json                  # Vercel部署配置
```

## 🚀 快速开始

### 系统要求

- Node.js 18.0+
- pnpm / npm / yarn
- Git

### 安装步骤

1. **克隆项目**

   ```bash
   git clone https://github.com/your-org/multigpt-platform.git
   cd multigpt-platform
   ```

2. **安装依赖**

   ```bash
   pnpm install
   ```

3. **环境配置**

   ```bash
   cp .env.local.example .env.local
   # 编辑 .env.local 配置你的API密钥
   ```

### 数据库设置

4. **设置数据库**

   由于 Supabase CLI 在 Windows 上的兼容性问题，请手动在 Supabase 控制台中运行数据库迁移：

   1. 访问你的 [Supabase 项目控制台](https://supabase.com/dashboard)
   2. 进入 "SQL Editor"
   3. 复制 `supabase/migrations/20241201000000_initial_schema.sql` 的内容
   4. 粘贴到 SQL Editor 中并执行

   或者使用数据库连接测试：

   ```bash
   pnpm run db:test
   ```

5. **启动开发服务器**
   ```bash
   pnpm run dev
   ```

访问 `http://localhost:3000` 开始开发！

## 📋 本地开发工具

### Supabase CLI

```bash
# 启动本地Supabase服务
pnpm run supabase:start

# 查看服务状态
pnpm run supabase:status

# 重置数据库
pnpm run supabase:reset

# 生成TypeScript类型
pnpm run types:generate
```

### Vercel CLI

```bash
# 本地开发（热重载）
pnpm run vercel:dev

# 部署到生产环境
pnpm run vercel:deploy
```

### 数据库操作

```bash
# 创建新的迁移
pnpm run supabase:migration:new create_user_profiles

# 应用迁移到本地数据库
pnpm run db:push

# 从远程拉取数据库结构
pnpm run db:pull
```

## 🔧 配置说明

### 环境变量

创建 `.env.local` 文件：

```env
# 基础配置
APP_NAME=MultiGPT Platform
NODE_ENV=development

# Supabase (海外)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# CloudBase (国内)
NEXT_PUBLIC_WECHAT_CLOUDBASE_ID=your_cloudbase_id

# Stripe支付
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key
STRIPE_SECRET_KEY=sk_test_your_key

# 地理分流
DOMESTIC_SYSTEM_URL=https://cn.yourapp.com
INTERNATIONAL_SYSTEM_URL=https://global.yourapp.com
```

### 数据库迁移

项目包含初始数据库结构：

- `user_profiles` - 用户资料
- `gpt_sessions` - GPT 会话
- `gpt_messages` - 会话消息
- `subscriptions` - 订阅记录
- `payments` - 支付记录

## 🌐 地区支持

| 地区 | 数据库    | 支付方式         | 认证方式     | 状态 |
| ---- | --------- | ---------------- | ------------ | ---- |
| 中国 | CloudBase | 微信支付、支付宝 | 微信、邮箱   | ✅   |
| 美国 | Supabase  | Stripe、PayPal   | Google、邮箱 | ✅   |
| 欧洲 | Supabase  | 🚫 (GDPR)        | 邮箱         | ✅   |
| 其他 | Supabase  | Stripe、PayPal   | Google、邮箱 | ✅   |

## 📱 使用指南

### 支付功能

1. 点击导航栏的"订阅"按钮
2. 选择适合的订阅计划
3. 根据地区自动选择支付方式
4. 完成支付后即可享受高级功能

### 地理分流

- 欧洲用户：自动禁用支付功能
- 国内用户：可选择微信支付或支付宝
- 海外用户：支持 Stripe 和 PayPal

## 🧪 测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试
pnpm test -- --testPathPattern=payment

# 生成覆盖率报告
pnpm test -- --coverage
```

## 🚀 部署

### Vercel 部署

1. **连接仓库**

   ```bash
   npx vercel link
   ```

2. **配置环境变量**
   在 Vercel Dashboard 中设置环境变量

3. **部署**
   ```bash
   npx vercel --prod
   ```

### 手动部署

```bash
# 构建生产版本
pnpm run build

# 启动生产服务器
pnpm run start
```

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- [Next.js](https://nextjs.org/) - React 框架
- [Supabase](https://supabase.com/) - 后端即服务
- [Stripe](https://stripe.com/) - 支付处理
- [Vercel](https://vercel.com/) - 部署平台
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架

---

**Made with ❤️ by the MultiGPT Team**

2. **Install dependencies**

   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

4. **Run the application**
   ```bash
   python src/main.py
   ```

## 📚 Usage

### Basic Usage

```python
from mornGPT import MultiPromptGPT

# Initialize the assistant
gpt = MultiPromptGPT()

# Process a multi-prompt conversation
response = gpt.process_conversation([
    "What is the weather like?",
    "Based on that, what should I wear?",
    "Can you suggest activities for today?"
])
```

### Advanced Configuration

```python
# Custom prompt configuration
config = {
    "max_tokens": 1000,
    "temperature": 0.7,
    "prompt_strategy": "sequential",
    "context_window": 10
}

gpt = MultiPromptGPT(config=config)
```

## 🔧 Configuration

The application can be configured through environment variables or configuration files:

| Variable         | Description             | Default         |
| ---------------- | ----------------------- | --------------- |
| `OPENAI_API_KEY` | OpenAI API key          | Required        |
| `MODEL_NAME`     | GPT model to use        | `gpt-3.5-turbo` |
| `MAX_TOKENS`     | Maximum response tokens | `1000`          |
| `TEMPERATURE`    | Response creativity     | `0.7`           |

## 🧪 Testing

Run the test suite:

```bash
# Run all tests
python -m pytest tests/

# Run with coverage
python -m pytest tests/ --cov=src --cov-report=html
```

## 📝 API Documentation

### Endpoints

- `POST /api/chat` - Process multi-prompt conversations
- `GET /api/health` - Health check endpoint
- `POST /api/configure` - Update configuration

### Example API Usage

```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompts": [
      "Analyze this data: [data]",
      "Generate insights from the analysis",
      "Create actionable recommendations"
    ],
    "context": "business_analysis"
  }'
```

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
4. **Add tests for new functionality**
5. **Commit your changes**
   ```bash
   git commit -m "Add amazing feature"
   ```
6. **Push to the branch**
   ```bash
   git push origin feature/amazing-feature
   ```
7. **Open a Pull Request**

### Development Setup

```bash
# Install development dependencies
pip install -r requirements-dev.txt

# Set up pre-commit hooks
pre-commit install

# Run linting
flake8 src/
black src/
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- OpenAI for providing the GPT API
- The open-source community for inspiration and tools
- Contributors and users of mornGPT-h1

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yuxuanzhouo3/mvp_24/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yuxuanzhouo3/mvp_24/discussions)
- **Email**: [Your Email]

## 🔄 Version History

- **v1.0.0** - Initial release with multi-prompt architecture
- **v1.1.0** - Enhanced context management
- **v1.2.0** - API improvements and error handling

---

**Made with ❤️ by the mornGPT team**

_Empowering AI interactions through intelligent multi-prompt processing_
