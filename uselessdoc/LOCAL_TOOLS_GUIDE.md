# 本地开发工具配置

## Supabase CLI

### 初始化本地 Supabase 项目

```bash
# 初始化Supabase（如果还没有的话）
npx supabase init

# 启动本地Supabase服务
npx supabase start

# 查看状态
npx supabase status
```

### 数据库迁移

```bash
# 创建新的迁移
npx supabase migration new create_users_table

# 应用迁移到本地数据库
npx supabase db push

# 重置本地数据库
npx supabase db reset
```

### 生成类型

```bash
# 生成TypeScript类型
npx supabase gen types typescript --local > lib/types/supabase.ts
```

## Vercel CLI

### 本地开发

```bash
# 登录Vercel（如果还没有的话）
npx vercel login

# 链接到Vercel项目
npx vercel link

# 本地开发（热重载）
npx vercel dev
```

### 部署

```bash
# 部署到生产环境
npx vercel --prod

# 查看部署状态
npx vercel ls
```

## 环境变量配置

### 本地开发环境变量 (.env.local)

```env
# Supabase本地开发
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_local_anon_key

# Vercel本地开发
VERCEL_URL=http://localhost:3000
```

### 生产环境变量 (Vercel Dashboard)

在 Vercel 项目设置中配置：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `STRIPE_SECRET_KEY`
- `DOMESTIC_SYSTEM_URL`
- `INTERNATIONAL_SYSTEM_URL`

## 工作流程

### 1. 本地开发设置

```bash
# 1. 启动Supabase本地服务
npx supabase start

# 2. 在新终端启动Next.js开发服务器
npm run dev

# 或者使用Vercel CLI进行本地开发
npx vercel dev
```

### 2. 数据库开发

```bash
# 1. 创建迁移文件
npx supabase migration new add_user_profiles

# 2. 编辑迁移文件 (supabase/migrations/xxx_add_user_profiles.sql)

# 3. 应用到本地数据库
npx supabase db push

# 4. 生成类型
npx supabase gen types typescript --local > lib/types/supabase.ts
```

### 3. 部署流程

```bash
# 1. 提交代码到Git
git add .
git commit -m "Add user profiles"

# 2. 推送到Vercel
npx vercel --prod

# 3. 或者推送到Git仓库，Vercel会自动部署
git push origin main
```

## 故障排除

### Supabase 问题

```bash
# 查看Supabase服务状态
npx supabase status

# 重启Supabase服务
npx supabase stop
npx supabase start

# 查看日志
npx supabase logs
```

### Vercel 问题

```bash
# 查看部署日志
npx vercel logs

# 重新链接项目
npx vercel link --force
```

## 推荐的项目结构

```
your-project/
├── supabase/
│   ├── config.toml          # Supabase配置
│   ├── migrations/          # 数据库迁移
│   ├── seed.sql            # 种子数据
│   └── types.ts            # 生成的类型
├── lib/
│   ├── types/
│   │   └── supabase.ts     # Supabase类型
│   └── architecture-modules/ # 架构模块
├── .env.local              # 本地环境变量
└── vercel.json            # Vercel配置（可选）
```
