# 快速开始指南

## 环境要求

- Node.js 14+
- 微信开发者工具
- 已配置的小程序 AppID 和 Secret（可选，演示模式不需要）

## 启动步骤

### 1. 启动后端服务

```bash
cd /Users/8086k/WeChatProjects/miniprogram-3/web
node server.js
```

输出：
```
[testforlogin] H5 server running at https://expanded-colored-intellectual-ruby.trycloudflare.com/
```

### 2. 打开微信开发者工具

- 导入本项目文件夹
- 使用测试账号登录
- 选择小程序运行

### 3. 在小程序中打开 WebView

进入 `webshell` 页面（WebView 容器），会加载网页

### 4. 点击网页中的"登录"按钮

完整的登录流程会自动执行：
1. 网页发送登录请求到小程序
2. 小程序跳转到登录页面
3. 调用 `wx.login()` 获取 code
4. code 发送到后端交换 token
5. token 拼接到返回 URL 中
6. WebView 重新加载，自动登录
7. 页面显示 token、openid、expiresIn

## 验证接口

### 健康检查
```bash
curl https://expanded-colored-intellectual-ruby.trycloudflare.com/api/health
```

### 登录（获取 token）
```bash
curl -X POST https://expanded-colored-intellectual-ruby.trycloudflare.com/api/wxlogin \
  -H "Content-Type: application/json" \
  -d '{"code":"test_code"}'
```

返回示例：
```json
{
  "ok": true,
  "openid": "demo_22b630b47d89a78c2ff8e3a9",
  "token": "X_xMv8XVRD0rveL7n9ZrPiyd5Lwzav5ojx8I4p2z3a8",
  "expiresIn": 7200
}
```

### 验证 Token
```bash
curl -X POST https://expanded-colored-intellectual-ruby.trycloudflare.com/api/verify-token \
  -H "Content-Type: application/json" \
  -d '{"token":"X_xMv8XVRD0rveL7n9ZrPiyd5Lwzav5ojx8I4p2z3a8"}'
```

返回示例：
```json
{
  "ok": true,
  "openid": "demo_22b630b47d89a78c2ff8e3a9",
  "expiresAt": 1766803331895,
  "expiresIn": 7186
}
```

## 文件修改说明

### 修改的小程序文件

#### 1. `pages/webshell/login.js` - 登录页面
**改进点：**
- ✅ 接收 returnUrl 参数（当前网页 URL）
- ✅ 调用 wx.login() 获取 code
- ✅ 发送 code 到后端 `/api/wxlogin` 接口
- ✅ 获取 token 和 openid
- ✅ 构造返回 URL（带 token 参数）
- ✅ 重定向回 webshell，传递 skipProfile=1 标记

**核心逻辑：**
```javascript
async exchangeCodeForToken(code) {
  // POST /api/wxlogin 交换 token
  const response = await wx.request({
    url: `${baseUrl}/api/wxlogin`,
    method: 'POST',
    data: { code: code },
  })
  
  const { token, openid, expiresIn } = response.data
  
  // 构造返回 URL
  const finalUrl = `${returnUrl}?token=${token}&openid=${openid}&expiresIn=${expiresIn}`
  
  // 重定向回 webshell
  wx.redirectTo({ url: `/pages/webshell/webshell?h5Url=${encodeURIComponent(finalUrl)}` })
}
```

#### 2. `pages/webshell/webshell.js` - WebView 容器
**改进点：**
- ✅ 在 onLoad 中存储 apiBase 到全局，供 login.js 使用
- ✅ 在 onShow 中检查 skipProfile 标记，跳过头像选择
- ✅ 改进 REQUEST_WX_LOGIN 处理，直接导航到 login 页面并传递 returnUrl

**核心逻辑：**
```javascript
if (msg.type === 'REQUEST_WX_LOGIN') {
  const currentUrl = this.data.h5Url
  const loginUrl = `/pages/webshell/login?returnUrl=${encodeURIComponent(currentUrl)}`
  wx.navigateTo({ url: loginUrl })
}
```

### 修改的网页文件

#### 3. `web/public/app.js` - 网页应用
**新增函数：**
- ✅ `validateToken(tokenStr)` - 验证 token 格式（base64url）
- ✅ `syncLoginState(token, openid)` - 同步登录状态到本地存储

**改进点：**
- ✅ 登录请求中传递 `returnUrl: window.location.href`
- ✅ 增强 bootstrapFromQuery()，优先处理 token + openid 组合
- ✅ 添加 token 格式验证，防止注入

**核心逻辑：**
```javascript
function validateToken(tokenStr) {
  return /^[A-Za-z0-9_-]{40,50}$/.test(tokenStr)
}

function bootstrapFromQuery() {
  if (query.token && query.openid) {
    if (syncLoginState(query.token, query.openid)) {
      // 登录成功
      setStatus('登录成功')
    }
  }
}
```

### 修改的后端文件

#### 4. `web/server.js` - 后端服务
**新增机制：**
- ✅ `USED_CODES` Set - 跟踪已使用过的 code，防重放攻击
- ✅ 同一 code 使用后 1 小时自动清理
- ✅ 新增 `/api/verify-token` 端点 - 验证 token 有效性

**改进点：**
- ✅ `/api/wxlogin` 端点添加防重放检查
- ✅ token 生成时添加元数据（iss, aud 字段）
- ✅ 完善 token 存储结构

**核心逻辑：**
```javascript
const USED_CODES = new Set()

if (pathname === '/api/wxlogin' && req.method === 'POST') {
  const code = body.code
  
  // 防重放攻击
  if (USED_CODES.has(code)) {
    return json(res, 403, { ok: false, error: 'code already used' })
  }
  
  // 交换 token
  const { token, expiresIn } = mintToken(openid)
  
  // 标记 code 已使用
  USED_CODES.add(code)
  setTimeout(() => USED_CODES.delete(code), 3600 * 1000)
  
  return json(res, 200, { ok: true, openid, token, expiresIn })
}
```

## 安全特性

### 1. 防重放攻击
- ✅ 后端记录所有使用过的 code
- ✅ 同一 code 第二次提交时直接拒绝
- ✅ 已使用的 code 1 小时后自动清理

### 2. Token 验证
- ✅ 网页端验证 token 格式（base64url 字符）
- ✅ 长度检查（40-50 字符）
- ✅ 后端可通过 `/api/verify-token` 验证 token 有效性

### 3. Token 生命周期
- ✅ Token 生成时带有 issuedAt 和 expiresAt 时间戳
- ✅ 默认过期时间为 2 小时
- ✅ 可通过 expiresIn 字段获知剩余有效时间

### 4. URL 参数安全
- ✅ 所有 URL 参数使用 encodeURIComponent 编码
- ✅ 防止特殊字符注入和 URL 篡改

## 调试

### 启用详细日志
网页开发者工具 F12 → Console，可看到所有登录流程的日志：
```
[init] App initialized successfully
[wx] wx.miniProgram 已注入，可以使用
[postMessage] -> {"type":"REQUEST_WX_LOGIN","returnUrl":"..."}
[message] <- ... (接收来自小程序的消息)
[auth] login state synced: openid=...
[status] 登录成功
```

### 小程序调试
微信开发者工具 → Console，可看到小程序的日志：
```
[webshell] onWebMessage { type: 'REQUEST_WX_LOGIN', ... }
```

### 后端调试
启动服务器时查看请求日志：
```
POST /api/wxlogin - 200 OK
POST /api/verify-token - 200 OK
```

## 常见问题

### Q: 登录后网页没有显示 token？
A: 检查浏览器 F12 Console，查看是否有错误日志。可能原因：
- URL 参数编码错误
- token 格式不符合预期
- localStorage 被禁用

### Q: 同一 code 重复使用收到 403 错误？
A: 这是正常的。为了防止重放攻击，同一 code 只能使用一次。需要重新调用 `wx.login()` 获取新的 code。

### Q: Token 过期了怎么办？
A: 网页应监听 token 过期，主动调用登录流程重新获取新的 token。可定期检查 expiresIn 的值。

### Q: 能否禁用防重放攻击？
A: 不建议。防重放攻击是安全的必要措施。如确实需要调整，可修改 server.js 中的 USED_CODES 相关逻辑。

## 生产环境部署

### 1. 配置微信 AppID 和 Secret

```bash
export WX_APPID="your_appid"
export WX_SECRET="your_secret"
node server.js
```

### 2. 使用 HTTPS

生产环境必须使用 HTTPS。可以：
- 使用反向代理（nginx）
- 使用 PM2 + node-https
- 部署到云平台（腾讯云、阿里云等）

### 3. 数据库存储 Token

当前是内存存储，生产环境建议：
- 使用 Redis 存储 token
- 设置合理的过期时间
- 定期清理过期 token

### 4. 日志和监控

建议添加：
- 请求日志（请求时间、method、path）
- 错误追踪（错误堆栈、用户信息）
- 性能监控（响应时间、错误率）

## 相关文件

| 文件 | 描述 |
|------|------|
| `LOGIN_FLOW_DIAGRAM.md` | 详细的流程图和技术说明 |
| `pages/webshell/login.js` | 小程序登录页面 |
| `pages/webshell/webshell.js` | 小程序 WebView 容器 |
| `web/public/app.js` | 网页应用代码 |
| `web/server.js` | 后端服务器代码 |

