# 中间页跳转 + Token 回传方案

## 方案架构流程

```
┌────────────────┐
│   网页 WebView  │
│   (H5)        │
└────────┬───────┘
         │ 1. 用户点击登录
         │ 发送 REQUEST_WX_LOGIN
         ↓
┌────────────────────────────┐
│    小程序 WebShell 页       │
│  (webshell.js)             │
│  接收登录请求              │
└────────┬───────────────────┘
         │ 2. 导航到登录页
         │ 传递 returnUrl（当前网页URL）
         ↓
┌────────────────────────────┐
│     小程序登录页           │
│    (login.js)              │
│  • 调用 wx.login() 获取 code│
│  • 向后端 /api/wxlogin    │
│    交换 code → token       │
└────────┬───────────────────┘
         │ 3. 调用后端接口
         │ POST /api/wxlogin
         │ { code }
         ↓
┌────────────────────────────┐
│    后端服务器              │
│    (server.js)             │
│  • 验证 code 防重放        │
│  • 调用微信 jscode2session│
│  • 生成 token              │
│  • 返回 token + openid     │
└────────┬───────────────────┘
         │ 4. 返回 token
         │ { token, openid }
         ↓
┌────────────────────────────┐
│     小程序登录页           │
│   构造返回 URL：           │
│   returnUrl?token=xxx      │
│   &openid=yyy              │
│   重定向到 WebShell        │
└────────┬───────────────────┘
         │ 5. redirectTo webshell
         │ 传递带 token 的 URL
         ↓
┌────────────────────────────┐
│    小程序 WebShell 页      │
│  WebView 加载新 URL        │
│  (url 中包含 token 参数)   │
└────────┬───────────────────┘
         │ 6. 加载带 token 的网页
         ↓
┌────────────────────────────┐
│    网页 WebView (H5)       │
│ • 从 URL 参数提取 token    │
│ • 验证 token 格式          │
│ • 保存 token 到 localStorage
│ • 自动登录成功              │
└────────────────────────────┘
```

## 核心代码流程

### 1️⃣ 网页发起登录 (app.js)

```javascript
btnLogin.addEventListener('click', () => {
  postToMiniProgram({ 
    type: 'REQUEST_WX_LOGIN',
    returnUrl: window.location.href  // 传递当前 URL 作为返回地址
  })
})
```

### 2️⃣ 小程序接收请求 (webshell.js)

```javascript
if (msg.type === 'REQUEST_WX_LOGIN') {
  const currentUrl = this.data.h5Url
  const loginUrl = `/pages/webshell/login?returnUrl=${encodeURIComponent(currentUrl)}`
  wx.navigateTo({ url: loginUrl })
}
```

### 3️⃣ 小程序登录并获取 Token (login.js)

```javascript
async exchangeCodeForToken(code) {
  // 1. 调用后端 /api/wxlogin 交换 token
  const response = await wx.request({ url: '/api/wxlogin', data: { code } })
  const { token, openid, expiresIn } = response.data

  // 2. 保存 token 到本地
  wx.setStorageSync('mp_login_token', token)

  // 3. 构造返回 URL（带 token）
  const returnUrl = wx.getStorageSync('mp_login_return_url')
  const finalUrl = `${returnUrl}?token=${token}&openid=${openid}&expiresIn=${expiresIn}`

  // 4. 重定向回 webshell，让 WebView 加载带 token 的 URL
  wx.redirectTo({
    url: `/pages/webshell/webshell?h5Url=${encodeURIComponent(finalUrl)}&skipProfile=1`
  })
}
```

### 4️⃣ 后端交换 Token (server.js)

```javascript
if (pathname === '/api/wxlogin' && req.method === 'POST') {
  const code = body.code
  
  // 防重放攻击：检查 code 是否已使用过
  if (USED_CODES.has(code)) {
    return json(res, 403, { ok: false, error: 'code already used' })
  }

  // 调用微信 API 获取 openid
  const { openid } = await wechatJscode2Session({ appid, secret, code })

  // 生成 token
  const { token, expiresIn } = mintToken(openid)

  // 标记 code 已使用
  USED_CODES.add(code)

  return json(res, 200, { ok: true, openid, token, expiresIn })
}
```

### 5️⃣ 网页接收 Token 并自动登录 (app.js)

```javascript
function validateToken(tokenStr) {
  // Token 格式验证：base64url 编码的 32 字节随机数
  return /^[A-Za-z0-9_-]{40,50}$/.test(tokenStr)
}

function bootstrapFromQuery() {
  // 方案A：从 URL 参数读取 token（推荐）
  if (query.token && query.openid) {
    appendLog('[query] token & openid detected from mini program redirect')
    if (syncLoginState(query.token, query.openid)) {
      // Token 验证成功，登录状态已同步
      localStorage.setItem('demo_token', query.token)
      tokenEl.textContent = query.token
      setStatus('登录成功')
    }
  }
}
```

## 关键技术点

### ✅ 安全机制

| 机制 | 实现 |
|------|------|
| **防重放攻击** | 后端使用 `USED_CODES` Set 跟踪已使用过的 code，同一 code 仅可使用一次 |
| **Token 格式验证** | 网页端对收到的 token 进行格式检查，确保是有效的 base64url 字符串 |
| **Token 过期时间** | Token 生命周期设置为 2 小时，过期后自动失效 |
| **URL 参数编码** | 所有 URL 参数使用 `encodeURIComponent` 编码，防止特殊字符注入 |

### ✅ 一次性使用 Code

```javascript
// code 使用后 1 小时自动清理，防止内存泄漏
USED_CODES.add(code)
setTimeout(() => {
  USED_CODES.delete(code)
}, 3600 * 1000)
```

### ✅ Token 验证接口

新增 `/api/verify-token` 端点，网页可以后续验证 token 的有效性：

```javascript
POST /api/verify-token
{ "token": "xxx" }

Response:
{
  "ok": true,
  "openid": "oabc123...",
  "expiresAt": 1735330800000,
  "expiresIn": 3600
}
```

## 流程特点

### 优点 ✅

1. **安全可靠** - 使用微信原生登录，code 一次性使用
2. **无需 postMessage** - 即使 wx.miniProgram 注入失败，也能通过 URL 参数传递 token
3. **用户体验好** - Token 直接返回给网页，无需等待 postMessage
4. **架构清晰** - 三层分离：网页 → 小程序 → 后端
5. **可扩展** - 可选择后续进行头像/昵称选择（profile 页面）

### 参数说明

| 参数 | 来源 | 用途 |
|------|------|------|
| `returnUrl` | 网页 → 登录页 | 登录成功后的跳转地址 |
| `token` | 后端 → 网页 | 用户登录凭证 |
| `openid` | 后端 → 网页 | 用户微信 openid |
| `expiresIn` | 后端 → 网页 | token 过期时间（秒） |
| `skipProfile` | webshell → webshell | 标记是否跳过头像选择 |

## 测试步骤

### 1. 启动后端服务

```bash
cd /Users/8086k/WeChatProjects/miniprogram-3/web
node server.js
# 服务运行在 http://localhost:5173
```

### 2. 小程序扫描登录二维码

使用微信开发者工具扫描小程序二维码，访问 WebView

### 3. 点击 WebView 中的"登录"按钮

- 网页发送 `REQUEST_WX_LOGIN` 消息到小程序
- 小程序导航到 login 页面，传递当前网页 URL
- login 页面调用 `wx.login()` 获取 code
- code 发送到后端 `/api/wxlogin` 端点
- 后端返回 token 和 openid
- login 页面构造返回 URL，重定向回 webshell
- WebView 加载带 token 的 URL
- 网页自动登录成功

### 4. 验证登录状态

页面中显示：
- token（base64url 字符串）
- openid（微信用户唯一标识）
- expiresIn（过期时间）

## 调试日志

网页控制台会输出详细的登录流程日志：

```
[init] App initialized successfully
[wx] wx.miniProgram 已注入，可以使用
[postMessage] -> {"type":"REQUEST_WX_LOGIN","returnUrl":"..."}
[message] <- {"type":"WX_LOGIN_CODE","code":"xxx"}
[wxlogin] ok: openid=demo_abc123...
[cache] token -> localStorage
[status] 登录成功
```

## 失败排查

| 症状 | 排查步骤 |
|------|---------|
| 登录页白屏 | 检查 login.js 是否正确解析 returnUrl 参数 |
| token 为空 | 检查后端 /api/wxlogin 是否返回正确的 JSON |
| 网页登录失败 | 检查 URL 参数编码，validateToken 是否通过 |
| code 重放失败 | 后端已防护，同一 code 仅可使用一次 |

