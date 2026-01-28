# 腾讯云 CloudBase 官方登录演示

这个页面演示了如何按照腾讯云官方文档实现 CloudBase 登录流程。

## 访问方式

启动开发服务器后，访问：

```
http://localhost:3000/cloudbase-official-login
```

## 功能特性

- ✅ 完全按照腾讯云官方文档实现
- ✅ 直接使用 CloudBase JS SDK
- ✅ 标准的 `toDefaultLoginPage` 登录流程
- ✅ 自动回调地址配置
- ✅ 登录状态检查和显示
- ✅ 用户信息展示
- ✅ 登出功能

## 登录流程

1. 点击"去登录页"按钮
2. 跳转到腾讯云统一登录页面
3. 选择登录方式并完成验证
4. 自动跳转回演示页面
5. 显示登录成功状态和用户信息

## 注意事项

- 确保已配置 `NEXT_PUBLIC_WECHAT_CLOUDBASE_ID` 环境变量
- 回调地址会自动设置为当前页面 URL
- 登录状态通过 Cookie 维护

## 相关文档

- [腾讯云 CloudBase 登录文档](https://cloud.tencent.com/document/product/876/18442)
- [项目集成指南](./CLOUDBASE_LOGIN_INTEGRATION.md)
