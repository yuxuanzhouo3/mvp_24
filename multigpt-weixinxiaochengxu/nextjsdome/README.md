# WebView 套壳登录 Demo (Next.js)

基于 Next.js 14 实现的微信小程序 WebView 登录示例。

## 快速开始

### 安装依赖

```bash
cd web
npm install
```

### 开发模式

```bash
npm run dev
```

服务将在 http://localhost:5173 启动。

### 生产构建

```bash
npm run build
npm start
```

## 环境变量

复制 `.env.example` 为 `.env.local` 并填入真实的微信配置：

```bash
cp .env.example .env.local
```

| 变量名 | 说明 | 必填 |
|--------|------|------|
| WX_APPID | 微信小程序 AppID | 否（有默认测试值） |
| WX_SECRET | 微信小程序 AppSecret | 否（有默认测试值） |
| PUBLIC_URL | 公网访问地址 | 否 |
| PORT | 服务端口（默认 5173） | 否 |

## API 接口

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/state` | GET | 获取会话状态 |
| `/api/request-login` | POST | 请求登录 |
| `/api/submit-code` | POST | 提交 code |
| `/api/wxlogin` | POST | 用 code 换取 token |
| `/api/reset` | POST | 重置会话 |
| `/api/verify-token` | POST | 验证 token |

## 技术栈

- Next.js 14 (App Router)
- React 18
- TypeScript

## 注意事项

- 内存存储仅用于演示，生产环境请使用 Redis 或数据库
- 默认的 WX_APPID/WX_SECRET 仅用于测试
