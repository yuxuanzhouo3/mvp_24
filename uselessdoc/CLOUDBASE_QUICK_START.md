# CloudBase 快速开始指南

⚡ 5 分钟快速上手 CloudBase 国内版集成

## 1️⃣ 环境变量配置（2 分钟）

创建或编辑 `.env.local`：

```bash
# 必需配置
NEXT_PUBLIC_WECHAT_CLOUDBASE_ID=your_cloudbase_env_id
DEPLOY_REGION=CN
NEXT_PUBLIC_WECHAT_APP_ID=your_wechat_app_id
NEXT_PUBLIC_APP_URL=https://localhost:3000  # 开发环境

# 可选配置（服务端操作）
TENCENTCLOUD_SECRET_ID=your_secret_id
TENCENTCLOUD_SECRET_KEY=your_secret_key
```

### 获取这些值

| 变量 | 获取方式 |
|------|--------|
| `CLOUDBASE_ENV_ID` | 腾讯云 CloudBase 控制台 → 环境 ID |
| `WECHAT_APP_ID` | 微信开放平台 → 应用 ID |
| `WECHAT_APP_SECRET` | 微信开放平台 → 应用密钥（不需要放在前端） |

## 2️⃣ 启动应用（1 分钟）

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 打开浏览器
# http://localhost:3000/auth
```

## 3️⃣ 测试邮箱登录（1 分钟）

### 注册新账户

1. 访问 http://localhost:3000/auth
2. 切换到 "注册" 标签页
3. 填写信息：
   - 邮箱：`test@example.com`
   - 密码：`Test@123456`
   - 确认密码：`Test@123456`
4. 点击 "注册"
5. 看到成功消息 ✅

### 使用邮箱登录

1. 切换到 "登录" 标签页
2. 输入邮箱和密码
3. 点击 "登录"
4. 自动跳转到首页 ✅

## 4️⃣ 测试微信扫码登录（1 分钟）

### 显示微信二维码

1. 在 `app/auth/page.tsx` 中添加微信按钮（已实现）
2. 访问登录页面，看到"微信扫码登录"按钮
3. 点击按钮 → 显示二维码
4. 使用微信扫描二维码 → 自动登录 ✅

### 测试模式（无真实微信）

在 URL 添加 `debug=true` 参数：
```
http://localhost:3000/auth?debug=true
```

## 📊 关键文件位置

```
项目根目录
├── lib/
│   ├── auth/
│   │   ├── adapter.ts          ← CloudBase 认证
│   │   └── client.ts            ← 前端认证
│   ├── database/
│   │   └── adapter.ts           ← CloudBase 数据库
│   ├── models/
│   │   └── user.ts              ← 用户数据模型
│   ├── config/
│   │   └── region.ts            ← 区域配置
│   └── wechat/
│       └── oauth.ts             ← 微信 OAuth
├── app/api/auth/
│   ├── login/route.ts           ← 邮箱登录 API
│   ├── register/route.ts        ← 邮箱注册 API
│   └── cloudbase-wechat/route.ts ← 微信登录 API
├── components/
│   └── wechat-qrcode-login.tsx  ← 微信扫码组件
└── CLOUDBASE_INTEGRATION_GUIDE.md ← 完整文档
```

## 🔄 核心流程

### 邮箱登录流程

```
用户输入邮箱密码
    ↓
POST /api/auth/login
    ↓
CloudBase 验证凭证
    ↓
成功 → 保存用户资料到数据库
    ↓
返回用户信息和 session
    ↓
前端保存 session
    ↓
自动跳转到首页
```

### 微信登录流程

```
用户点击微信登录
    ↓
显示二维码（或跳转）
    ↓
用户扫描二维码并授权
    ↓
微信回调 /auth/callback?code=xxx
    ↓
POST /api/auth/cloudbase-wechat { code }
    ↓
CloudBase 验证 code
    ↓
获取用户信息
    ↓
保存用户资料到数据库
    ↓
返回登录成功
    ↓
前端自动跳转到首页
```

## 🧪 快速测试

### 测试邮箱注册

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@123456",
    "confirmPassword": "Test@123456",
    "fullName": "Test User"
  }'
```

**预期响应**：
```json
{
  "success": true,
  "user": { "id": "xxx", "email": "test@example.com" },
  "message": "Registration successful. You can now log in.",
  "region": "CN"
}
```

### 测试邮箱登录

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@123456"
  }'
```

**预期响应**：
```json
{
  "success": true,
  "user": { "id": "xxx", "email": "test@example.com" },
  "session": { "access_token": "present" }
}
```

### 测试微信二维码 API

```bash
curl http://localhost:3000/api/auth/cloudbase-wechat/qrcode
```

**预期响应**：
```json
{
  "supported": true,
  "appId": "your_wechat_app_id",
  "qrcodeUrl": "https://open.weixin.qq.com/connect/qrconnect?...",
  "redirectUri": "http://localhost:3000/auth/callback"
}
```

## ⚠️ 常见问题解决

### 问题 1: "未配置微信应用 ID"

**解决方案**：
```bash
# 检查 .env.local
echo $NEXT_PUBLIC_WECHAT_APP_ID  # 应该显示你的 APP ID

# 如果为空，编辑 .env.local 并重启应用
npm run dev
```

### 问题 2: 邮箱注册返回 "EMAIL_EXISTS"

**解决方案**：
- 使用不同的邮箱地址测试
- 或在 CloudBase 控制台删除该用户后重试

### 问题 3: 登录返回 "ACCOUNT_LOCKED"

**解决方案**：
- 等待 15 分钟后重试
- 或重启应用（在开发环境中）

### 问题 4: 微信二维码无法显示

**解决方案**：
1. 检查 `NEXT_PUBLIC_APP_URL` 是否正确设置
2. 在微信开放平台配置回调 URL
3. 检查浏览器控制台错误

## 📈 下一步

### 1. 完整测试（5-10 分钟）

参考 [CLOUDBASE_IMPLEMENTATION_CHECKLIST.md](./CLOUDBASE_IMPLEMENTATION_CHECKLIST.md) 的测试清单

### 2. 自定义集成（按需）

- 修改登录页面样式
- 添加额外的登录方式
- 自定义用户资料字段

### 3. 部署到生产环境（20-30 分钟）

参考 [CLOUDBASE_INTEGRATION_GUIDE.md](./CLOUDBASE_INTEGRATION_GUIDE.md) 的部署部分

## 🔐 安全清单

在上线前：

- [ ] 检查所有环境变量已设置
- [ ] 确认微信回调 URL 配置正确
- [ ] 启用 HTTPS（生产环境）
- [ ] 配置 CloudBase 数据库权限
- [ ] 启用安全日志记录
- [ ] 测试账户锁定功能
- [ ] 验证密码强度要求

## 📚 完整文档

- **详细指南**：[CLOUDBASE_INTEGRATION_GUIDE.md](./CLOUDBASE_INTEGRATION_GUIDE.md)
- **实现清单**：[CLOUDBASE_IMPLEMENTATION_CHECKLIST.md](./CLOUDBASE_IMPLEMENTATION_CHECKLIST.md)
- **完成总结**：[CLOUDBASE_COMPLETION_SUMMARY.md](./CLOUDBASE_COMPLETION_SUMMARY.md)

## 💡 提示

- 开发环境可用 `localhost:3000`
- 生产环境需使用真实域名和 HTTPS
- CloudBase 免费额度通常足以支持个人开发
- 定期备份 CloudBase 数据

## 🎉 成功标志

完成以下操作表示集成成功：

- ✅ 邮箱注册成功
- ✅ 邮箱登录成功
- ✅ 微信扫码登录显示二维码
- ✅ 用户资料保存到数据库
- ✅ 浏览器控制台无错误
- ✅ CloudBase 控制台看到用户记录

---

**祝贺！** 你已经成功配置了 CloudBase 国内版。

**需要帮助？** 查看完整文档或检查常见问题部分。🚀

