# testforlogin

用于验证「小程序 web-view 套壳 H5」与「小程序原生登录（wx.login）」的兼容测试 Demo。

## 1) 启动 H5（本地静态服务）

在该目录下运行：

```bash
node server.js
```

可选：接入真实微信 `jscode2session`（不设置则走 Demo 模式，openid/token 为本地生成，仅用于联调）

```bash
export WX_APPID="你的小程序appid"
export WX_SECRET="你的小程序secret"
node server.js
```

默认监听：
- http://localhost:5173

如果你通过 Cloudflare Tunnel / ngrok 等把本机端口映射到公网，建议设置 `PUBLIC_URL` 让启动日志直接打印公网地址：

```bash
export PUBLIC_URL="https://expanded-colored-intellectual-ruby.trycloudflare.com"
node server.js
```

打开浏览器访问：
- http://localhost:5173

## 2) 在小程序里打开套壳页

小程序新增页面：`pages/webshell/webshell`

开发者工具里：
- 详情 -> 本地设置：勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」
- 然后运行并打开 `webshell` 页面

如果你要在真机上测：需要把域名配置到小程序的 **业务域名（web-view）** 且必须 HTTPS。

## 3) 验证点

- H5 页面里的「用小程序原生登录」按钮会向小程序发消息
- 小程序收到后调用 `wx.login()` 拿到 `code`
- 小程序把 `code` 通过 `postMessage` 回传给 H5（类型：`WX_LOGIN_CODE`）
- H5 调用后端 `/api/wxlogin` 进行换取（真实模式会调用微信 `jscode2session`）并生成业务 `token`

## 4) 常见坑：为什么“只有 code 没有 token/openid”

如果你的 H5 是线上域名（不是 `http://localhost:5173`），但后端 `/api/wxlogin` 只在你本机跑：

- 小程序侧 `wx.request` **访问不到你的本机 localhost**
- H5 侧 `fetch('/api/wxlogin')` 会请求 **H5 自己的线上域名**，如果线上没有部署该接口，就会失败

解决方式：把后端部署到一个线上可访问域名，并通过 `apiBase` 参数告诉 H5/小程序去哪里请求。

### apiBase（推荐）

H5 支持在 URL 上指定后端基址：

- `https://your-h5-domain.com/?apiBase=https%3A%2F%2Fyour-api-domain.com`

这样 H5 会请求：

- `https://your-api-domain.com/api/wxlogin`

同时，H5 触发小程序登录中转页时也会携带同一个 `apiBase`，让小程序侧也能正确调用后端。

### 后端部署与域名配置

- 需要把 `server.js` 部署到一个 HTTPS 域名（Docker 或任意 Node 托管都可以）
- 真机环境：小程序后台需要配置
	- web-view 业务域名（用于加载 H5）
	- request 合法域名（用于请求你的 `/api/wxlogin` 后端）
