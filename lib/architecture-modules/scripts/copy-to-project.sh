#!/bin/bash

# copy-to-project.sh - 将架构模块复制到新项目的脚本
# 用法: ./copy-to-project.sh /path/to/your/new/project

set -e

if [ $# -eq 0 ]; then
    echo "❌ 请提供目标项目路径"
    echo "用法: $0 /path/to/your/new/project"
    exit 1
fi

TARGET_DIR="$1"
MODULES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🚀 开始复制架构模块..."
echo "📁 源目录: $MODULES_DIR"
echo "📁 目标目录: $TARGET_DIR"

# 检查目标目录是否存在
if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ 目标目录不存在: $TARGET_DIR"
    exit 1
fi

# 检查目标是否为Node.js项目
if [ ! -f "$TARGET_DIR/package.json" ]; then
    echo "⚠️  目标目录似乎不是Node.js项目（未找到package.json）"
    read -p "是否继续？(y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "📋 复制文件..."

# 创建目标lib目录
mkdir -p "$TARGET_DIR/lib"

# 复制架构模块
if [ -d "$MODULES_DIR" ]; then
    cp -r "$MODULES_DIR" "$TARGET_DIR/lib/"
    echo "  ✅ 复制架构模块到 lib/architecture-modules/"
else
    echo "❌ 找不到架构模块目录: $MODULES_DIR"
    exit 1
fi

# 注意：IP检测库已包含在架构模块内部，无需额外复制

# 复制环境变量示例
if [ -f "$MODULES_DIR/.env.example" ]; then
    cp "$MODULES_DIR/.env.example" "$TARGET_DIR/"
    echo "  ✅ 复制环境变量示例到 .env.example"
fi

echo ""
echo "📦 安装依赖..."

# 进入目标目录安装依赖
cd "$TARGET_DIR"
if command -v npm &> /dev/null; then
    npm install
    echo "  ✅ 使用npm安装依赖"
elif command -v yarn &> /dev/null; then
    yarn install
    echo "  ✅ 使用yarn安装依赖"
else
    echo "⚠️  未找到npm或yarn，请手动安装依赖"
fi

echo ""
echo "📚 下一步操作:"
echo "1. 📝 配置环境变量（参考 .env.example）"
echo "2. 📖 阅读集成指南: lib/architecture-modules/INTEGRATION_GUIDE.md"
echo "3. 🧪 运行快速检查: cd lib/architecture-modules && npm run quick-start"
echo "4. 🔧 开始集成到你的项目中"

echo ""
echo "🎉 复制完成！开始你的多地区架构之旅吧！"