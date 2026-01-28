# 微信原生登录端到端说明（App ⇄ 后端）

## 场景
- Android 原生使用 WeChat SDK 拿到 `code` 后调用后端 `/api/wxlogin`。
- 后端优先按小程序 `jscode2session` 尝试；失败则用原生 AppID，再失败才用网页 OAuth AppID。

## 后端要求
1) 三套独立凭证（互不混用）：
   - 小程序：`WECHAT_MINIPROGRAM_APP_ID`、`WECHAT_MINIPROGRAM_APP_SECRET`
   - 原生 App（Android/iOS 开放平台）：`WECHAT_APP_ID_NATIVE`、`WECHAT_APP_SECRET_NATIVE`
   - 网页 OAuth（公众号/网站）：`NEXT_PUBLIC_WECHAT_APP_ID`、`WECHAT_APP_SECRET`
2) 部署区域须为 CN（已在 deployment.config.ts 确认）；非 CN 请求会被拒绝。
3) 修改 `.env.local` 后必须重启后端，让新凭证生效。
4) CloudBase 集合：`web_users`，先用 `unionid` 合并账号，再用 `openid`。
5) App 调用的接口：`/api/wxlogin`（内部转发到 `/api/wechat/miniprogram/login`）。

## App（Android）要求
1) 使用原生开放平台 AppID：
   - `gradle.properties`/构建配置内：`WECHAT_APP_ID=wx51c333e8f95e4e45`（示例，需与真实原生 AppID 一致）。
   - Manifest 已有 `WXEntryActivity`（包名 `com.multigpt.android.app.wxapi`）及 `com.tencent.mm` 查询权限。
2) 状态栏底色已设为白色：`res/values/colors.xml` 中 `statusBarBackground=#ffffff`。若需深色图标，可在主题加 `android:windowLightStatusBar=true`。
3) AppConfig 保持内链策略；`wechat-login://start` 自定义 scheme 触发原生登录。

## 登录流程（后端）
1) 用 `WECHAT_MINIPROGRAM_*` 调 `jscode2session`。
2) 若 code 无效或小程序配置缺失，改用原生 AppID（`WECHAT_APP_ID_NATIVE` / `WECHAT_APP_SECRET_NATIVE`）。
3) 若原生未配，再兜底网页 OAuth AppID/Secret。
4) 按 `unionid` > `openid` 查/建用户，签发 access token + refresh token。

## 常见错误
- `40029 invalid code`：code 不是小程序的；回退逻辑会继续尝试原生/网页，只要对应凭证正确即可成功。
- `40125 invalid appsecret`：原生 AppID/Secret 不匹配。请把 `WECHAT_APP_SECRET_NATIVE` 改成与 `WECHAT_APP_ID_NATIVE` 精确匹配的开放平台 Secret。

## 发布前最小检查清单
- [ ] `.env.local` 正确填好三套凭证。
- [ ] 修改环境后已重启后端。
- [ ] 原生包使用匹配的原生 AppID 构建。
- [ ] 设备已安装微信，签名与开放平台登记一致。
- [ ] 实机跑一遍登录，接口 200 返回 token（而非 `MINIPROGRAM_LOGIN_FAILED`）。
