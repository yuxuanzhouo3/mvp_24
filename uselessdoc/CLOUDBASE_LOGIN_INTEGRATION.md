# 腾讯云 CloudBase 登录集成指南

## 概述

本项目已更新为使用腾讯云 CloudBase 官方推荐的登录流程。该流程要求用户跳转到腾讯云的统一登录页面进行身份验证。

## 主要变更

### 1. 认证适配器更新

- 在 `AuthAdapter` 接口中添加了 `toDefaultLoginPage` 方法
- `CloudBaseAuthAdapter` 实现了官方的登录流程

### 2. 前端客户端更新

- `AuthClient` 接口添加了 `toDefaultLoginPage` 方法
- `CloudBaseAuthClient` 使用 `auth().toDefaultLoginPage()` 进行登录

### 3. 登录流程

新的登录流程如下：

1. **用户点击登录按钮**
2. **前端调用 `auth.toDefaultLoginPage()`**
3. **浏览器跳转到腾讯云统一登录页面**
4. **用户选择登录方式并完成登录**
5. **腾讯云验证后跳转回应用页面**
6. **应用检查登录状态并更新 UI**

## 使用方法

### 基本用法

```tsx
import { auth } from "@/lib/auth/client";

function LoginButton() {
  const handleLogin = () => {
    // 跳转到腾讯云登录页面
    auth.toDefaultLoginPage?.();
  };

  return <button onClick={handleLogin}>登录</button>;
}
```

### 自定义回调地址

```tsx
const handleLogin = () => {
  auth.toDefaultLoginPage?.("https://yourapp.com/dashboard");
};
```

### 检查登录状态

```tsx
import { auth } from "@/lib/auth/client";
import { useEffect, useState } from "react";

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await auth.getUser();
      setUser(data.user);
    };

    checkUser();
  }, []);

  return (
    <div>
      {user ? (
        <p>欢迎, {user.name}!</p>
      ) : (
        <button onClick={() => auth.toDefaultLoginPage?.()}>登录</button>
      )}
    </div>
  );
}
```

## 示例组件

项目中提供了一个完整的示例组件：`components/cloudbase-login-example.tsx`

该组件演示了：

- 如何检查当前登录状态
- 如何触发登录流程
- 如何处理登出
- 如何刷新认证状态

## 环境配置

确保在 `.env.local` 中配置了以下变量：

```bash
# 腾讯云 CloudBase 环境ID
NEXT_PUBLIC_WECHAT_CLOUDBASE_ID=your_env_id

# 腾讯云 API 密钥（服务器端必需）
TENCENTCLOUD_SECRET_ID=your_secret_id
TENCENTCLOUD_SECRET_KEY=your_secret_key
```

## 注意事项

1. **回调地址**: 确保回调地址与应用域名一致，否则可能出现跨域问题
2. **HTTPS**: 生产环境建议使用 HTTPS
3. **环境变量**: 服务器端需要配置腾讯云 API 密钥
4. **登录状态**: 登录状态通过 Cookie 维护，页面刷新后自动保持

## 故障排除

### 常见问题

1. **跳转后显示空白页面**

   - 检查环境 ID 是否正确
   - 确认回调地址格式正确

2. **登录后没有自动返回**

   - 检查回调地址是否与当前域名匹配
   - 确认没有跨域问题

3. **获取用户信息失败**
   - 确保服务器端配置了腾讯云 API 密钥
   - 检查 CloudBase 环境权限设置

### 调试建议

1. 在浏览器开发者工具中查看网络请求
2. 检查浏览器控制台的错误信息
3. 验证环境变量是否正确设置
4. 确认 CloudBase 环境配置正确

## 示例页面

项目提供了两个登录示例：

### 1. 官方登录演示页面

访问：`http://localhost:3000/cloudbase-official-login`

这个页面完全按照腾讯云官方文档实现，包含：

- 直接使用 CloudBase JS SDK
- 标准的 `toDefaultLoginPage` 流程
- 完整的用户界面
- 状态检查和错误处理

### 2. 抽象层示例组件

文件：`components/cloudbase-login-example.tsx`

这个组件展示了如何通过项目的认证抽象层使用登录功能。

## 相关文档

- [腾讯云 CloudBase 官方文档](https://cloud.tencent.com/document/product/876)
- [CloudBase Node.js SDK](https://docs.cloudbase.net/api-reference/server/node-sdk/initialization)
- [CloudBase JS SDK](https://docs.cloudbase.net/api-reference/webv2/authentication)
