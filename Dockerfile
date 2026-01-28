# 使用多阶段构建减小镜像大小
FROM node:20-alpine AS base

# 安装pnpm
RUN npm install -g pnpm

# 设置工作目录
WORKDIR /app

# ========== 构建时环境变量声明 ==========
# 只声明必须在构建时使用的变量
ARG NODE_ENV=production

# 将 ARG 转换为 ENV，使构建过程能访问这些变量
ENV NODE_ENV=$NODE_ENV

# ⚠️ 重要：移除所有其他 ARG 和 ENV 声明
# 所有与应用配置相关的变量（数据库、API密钥、认证等）
# 都应该在运行时由部署平台动态注入，不应该在构建时硬编码到镜像中

# 复制包管理文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建应用（此时环境变量已可用）
RUN pnpm build

# 生产阶段
FROM node:20-alpine AS production

# 安装pnpm
RUN npm install -g pnpm

# 设置工作目录
WORKDIR /app

# ========== 运行时环境变量声明 ==========
# 所有配置变量都应该在运行时由部署平台注入，不在 Dockerfile 中指定
#
# 部署平台（腾讯云、Vercel等）需要在运行时注入以下变量：
# 
# 前端配置（通过 /api/auth/config API 读取）：
# - MY_NEXT_PUBLIC_APP_URL
# - MY_NEXT_PUBLIC_SUPABASE_URL
# - MY_NEXT_PUBLIC_SUPABASE_ANON_KEY
# - MY_NEXT_PUBLIC_WECHAT_CLOUDBASE_ID
# - MY_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
# - MY_NEXT_PUBLIC_ALIPAY_APP_ID
#
# 后端密钥（服务端 API 使用）：
# - WECHAT_APP_SECRET
# - WECHAT_PAY_API_V3_KEY
# - WECHAT_PAY_PRIVATE_KEY
# - DEEPSEEK_API_KEY
# - OPENAI_API_KEY
# - ANTHROPIC_API_KEY
# - 等其他 API 密钥
#
# ⚠️ 关键原则：
# 1. 构建时不硬编码任何配置
# 2. 所有配置在运行时由部署环境提供
# 3. 这样同一个镜像可以用于不同的环境（开发、测试、生产等）

ARG PORT=3000
ENV PORT=$PORT

# 从构建阶段复制必要的文件
COPY --from=base /app/package.json /app/pnpm-lock.yaml ./
COPY --from=base /app/.next ./.next
COPY --from=base /app/public ./public
COPY --from=base /app/next.config.mjs ./

# 安装生产依赖
RUN pnpm install --frozen-lockfile --prod

# 创建非root用户
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# 更改文件所有权
RUN chown -R nextjs:nodejs /app
USER nextjs

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["pnpm", "start"]