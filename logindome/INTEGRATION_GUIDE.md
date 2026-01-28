# 集成文档（把本 Demo 接入真实业务）

> 目标读者：接手集成的 AI/工程师。
>
> 目标：把「小程序 WebView 承载 H5」+「小程序原生 wx.login」的登录能力，接入你们真实后端（用户体系、会话、权限）。

## 1. 本 Demo 里有哪些角色

- **H5 页面（web/public）**：展示按钮与状态；在拿到 `mpCode` 后调用后端换取业务 `token`。
- **小程序 WebView 容器（pages/webshell/webshell）**：承载 H5；在 postMessage 不可用时用“刷新 URL 参数”的方式把数据回传给 H5。
- **小程序登录页（pages/webshell/login）**：调用 `wx.login()` 拿到一次性 `code`。
- **小程序资料页（pages/webshell/profile）**：可选，收集昵称/头像并回传给 H5（目前头像多为 `wxfile://` 临时路径，H5 通常不可直接访问）。
- **后端（web/server.js，仅用于演示）**：提供 `/api/wxlogin`（用 code 换 openid 并签发 token）等接口。

## 2. 核心链路（你要在真实业务里复刻什么）

### 2.1 登录链路（推荐理解为：H5 发起 → 小程序拿 code → H5 换 token）

1) H5 在小程序 WebView 中，用户点击“登录”。
2) H5 通过 `wx.miniProgram.navigateTo(...)` 跳转小程序登录页（不依赖 H5→小程序 bindmessage）。
3) 小程序登录页调用 `wx.login()` 获得一次性 `code`。
4) 小程序把 `code` 带回 WebView（优先 postMessage；不支持时用 URL 参数刷新把 `mpCode` 写回 H5 地址）。
5) H5 收到 `mpCode` 后调用后端：`POST /api/wxlogin { code }`。
6) 后端调用微信 `jscode2session` 拿 `openid`，再签发你们业务 token（JWT/Session/自定义 token 均可）。
7) H5 保存 token（示例里用 localStorage），进入“已登录状态”。

### 2.2 资料链路（可选）

- 小程序 profile 页把 `nickName/avatarUrl` 写入 storage（`mp_pending_profile`）。
- WebView 容器回到前台时把 profile 回传给 H5（优先 postMessage；兜底用 URL 参数 `mpNickName/mpProfileTs`）。

> 注意：`chooseAvatar` 返回的 `avatarUrl` 多是 `wxfile://` 临时路径，H5 不可直接访问。真实业务若要 H5 展示头像，需要“上传到你们后端/对象存储后回传 https URL”，或“转 base64（不推荐，体积大）”。

## 3. H5 与小程序的协议约定

### 3.1 URL 参数（小程序 → H5 的兜底回传）

- `mpCode`：小程序 `wx.login()` 返回的 code（一次性）。
- `mpNickName`：昵称（可选）。
- `mpProfileTs`：资料回传时间戳（可选，用于标识一次回传）。
- `apiBase`：可选，H5 后端基址（跨域部署时使用）；示例里默认同源 `/api/...`。

### 3.2 postMessage 消息类型（如果环境支持）

H5 监听 `wx.miniProgram.onMessage` 或 `window.message`，消息 payload 形如：

- `REQUEST_WX_LOGIN`（H5→小程序）：请求跳转登录页
  - `{ type: 'REQUEST_WX_LOGIN', returnUrl: string }`
- `WX_LOGIN_CODE`（小程序→H5）：回传 code
  - `{ type: 'WX_LOGIN_CODE', code: string }`
- `PROFILE_RESULT`（小程序→H5）：回传资料
  - `{ type: 'PROFILE_RESULT', userInfo: { nickName?: string, avatarUrl?: string } }`

## 4. 真实后端需要提供什么接口

你们真实系统不需要照搬 `web/server.js`，但需要提供“等价能力”。最小必需接口只有一个：`/api/wxlogin`。

### 4.1 必需：用 code 换取业务登录态

**HTTP**：`POST /api/wxlogin`

**Request JSON**：
```json
{ "code": "wx.login 返回的 code" }
```

**Response JSON（建议）**：
```json
{
  "ok": true,
  "openid": "o_xxx...",
  "token": "<你们的业务 token>",
  "expiresIn": 7200
}
```

**后端实现要点**：
- 调用微信接口：`https://api.weixin.qq.com/sns/jscode2session?appid=...&secret=...&js_code=...&grant_type=authorization_code`
- 用返回的 `openid` 作为用户标识（或映射你们内部 userId）。
- 签发 token：
  - 可以是 JWT（推荐）
  - 或服务端 session（返回 sessionId）
  - 或你们已有的 access_token
- **防重放**：同一个 `code` 只能成功兑换一次（Demo 用内存 Set 做了演示；真实服务建议用 Redis/DB 幂等）。
- 错误返回建议：
  - `400`：缺少 code
  - `502`：微信接口错误（errcode/errmsg）
  - `403`：检测到 replay（可选）

### 4.2 可选：token 校验（调试/联调用）

**HTTP**：`POST /api/verify-token`

**Request JSON**：
```json
{ "token": "..." }
```

**Response JSON（示例）**：
```json
{ "ok": true, "openid": "...", "expiresAt": 1766803331895, "expiresIn": 7186 }
```

> 真实业务里通常用你们已有的鉴权中间件/网关来校验 token，这个接口不是必需。

## 5. 部署与域名/安全注意

- 真机测试必须 **HTTPS** 且配置到小程序后台：
  - **业务域名（web-view）**：H5 域名
  - 如果小程序端需要直接请求你后端（本 Demo 主要是 H5 fetch），还要配置 **request 合法域名**
- H5 与后端分离部署时：
  - H5 需要知道后端基址（建议用 `apiBase` 参数或在 H5 配置文件里写死）
  - 后端需要正确的 CORS（至少允许 H5 域名）
- 生产建议把 token 放在 `HttpOnly` Cookie（更安全）；本 Demo 用 localStorage 仅为演示。

## 6. 你交给“其他 AI”集成时建议的任务拆分

1) 在真实后端实现 `POST /api/wxlogin`（接微信 jscode2session → 绑定用户 → 签发业务 token）。
2) 在 H5 里把“收到 mpCode 后调用 /api/wxlogin 并保存登录态”的逻辑对接到你们登录体系。
3) 如果需要头像：增加“上传头像到后端/OSS → 返回 https URL”能力，再让 H5 显示该 URL。
4) （可选）把 Demo 的 URL 参数回传改为只用于兜底，优先走 postMessage（减少 WebView 刷新）。

## 7. 关键文件索引（方便 AI 搜代码）

- 小程序容器页：pages/webshell/webshell.js
- 小程序登录页：pages/webshell/login.js
- 小程序资料页：pages/webshell/profile.js
- H5 主逻辑：web/public/app.js
- Demo 后端：web/server.js

