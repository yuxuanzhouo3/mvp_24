#!/bin/bash

# MultiGPT Platform 部署准备脚本
# 用于自动化环境配置和基础检查

set -e

echo "🚀 MultiGPT Platform 部署准备脚本"
echo "=================================="

# 检查 Node.js 版本
echo "📋 检查 Node.js 版本..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js 18.0+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 版本过低，需要 18.0+，当前版本: $(node -v)"
    exit 1
fi
echo "✅ Node.js 版本: $(node -v)"

# 检查 npm 或 pnpm
echo "📋 检查包管理器..."
if command -v pnpm &> /dev/null; then
    PACKAGE_MANAGER="pnpm"
elif command -v npm &> /dev/null; then
    PACKAGE_MANAGER="npm"
else
    echo "❌ 未找到包管理器，请安装 npm 或 pnpm"
    exit 1
fi
echo "✅ 使用包管理器: $PACKAGE_MANAGER"

# 检查 Git
echo "📋 检查 Git..."
if ! command -v git &> /dev/null; then
    echo "❌ Git 未安装，请先安装 Git"
    exit 1
fi
echo "✅ Git 版本: $(git --version)"

# 检查环境变量文件
echo "📋 检查环境配置文件..."
if [ ! -f ".env.local" ]; then
    if [ -f ".env.example" ]; then
        echo "⚠️  .env.local 不存在，从 .env.example 复制..."
        cp .env.example .env.local
        echo "✅ 已创建 .env.local，请编辑其中的配置"
        echo "   重要：请配置以下必需的环境变量："
        echo "   - NEXT_PUBLIC_SUPABASE_URL"
        echo "   - NEXT_PUBLIC_SUPABASE_ANON_KEY"
        echo "   - STRIPE_SECRET_KEY"
        echo "   - PAYPAL_CLIENT_ID"
        echo "   - PAYPAL_CLIENT_SECRET"
        echo "   - OPENAI_API_KEY"
    else
        echo "❌ .env.example 文件不存在"
        exit 1
    fi
else
    echo "✅ .env.local 已存在"
fi

# 安装依赖
echo "📦 安装项目依赖..."
if [ "$PACKAGE_MANAGER" = "pnpm" ]; then
    pnpm install
else
    npm install
fi

# 检查 TypeScript 编译
echo "🔧 检查 TypeScript 编译..."
if [ "$PACKAGE_MANAGER" = "pnpm" ]; then
    pnpm run build
else
    npm run build
fi

# 数据库连接测试
echo "🗄️ 测试数据库连接..."
if [ "$PACKAGE_MANAGER" = "pnpm" ]; then
    pnpm run db:test
else
    npm run db:test
fi

echo ""
echo "🎉 部署准备完成！"
echo "=================="
echo ""
echo "📝 下一步操作："
echo "1. 编辑 .env.local 文件，配置所有必需的环境变量"
echo "2. 在 Supabase 中创建数据库表结构"
echo "3. 配置 Stripe 和 PayPal webhook"
echo "4. 运行 'vercel --prod' 部署到生产环境"
echo ""
echo "📚 详细文档请查看: DEPLOYMENT_GUIDE.md"
echo ""
echo "🚀 准备就绪！"</content>
<parameter name="filePath">c:\Users\8086K\Downloads\mvp_24-main\scripts\prepare-deployment.sh