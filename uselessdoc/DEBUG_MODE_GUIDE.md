# 调试模式功能测试

## ✅ 调试模式已重新启用!

### 🎯 功能概述

调试模式允许你在本地开发环境中模拟不同地理区域的用户体验,无需 VPN 或更改实际 IP 地址。

### 🚀 如何使用

#### 1. 启动调试模式

在浏览器中访问以下任一 URL:

```
http://localhost:3000?debug=china
http://localhost:3000?debug=usa
http://localhost:3000?debug=europe
```

#### 2. 可视化指示器

启用调试模式后,页面右上角会显示彩色的调试面板:

- 🇨🇳 **中国模式** - 红色背景
- 🇺🇸 **美国模式** - 蓝色背景
- 🇪🇺 **欧洲模式** - 绿色背景

#### 3. 功能特性

- ✅ **自动持久化**: debug 参数在页面跳转时自动保留
- ✅ **实时切换**: 点击面板展开,可在不同区域间快速切换
- ✅ **一键退出**: 点击 X 按钮或"退出调试模式"按钮
- ✅ **完整模拟**: AI 列表、支付方式、登录选项都会根据区域改变

### 📝 测试步骤

#### 测试 1: 中国区域

```bash
# 1. 访问
http://localhost:3000?debug=china

# 2. 验证
- ✅ 右上角显示红色"🇨🇳 调试模式: 中国"指示器
- ✅ 只显示中国可用的AI模型
- ✅ 支付页面显示支付宝、微信支付选项
- ✅ 登录页面显示微信登录选项
```

#### 测试 2: 美国区域

```bash
# 1. 访问
http://localhost:3000?debug=usa

# 2. 验证
- ✅ 右上角显示蓝色"🇺🇸 调试模式: 美国"指示器
- ✅ 显示所有AI模型
- ✅ 支付页面显示Stripe、PayPal选项
- ✅ 登录页面显示Google登录选项
```

#### 测试 3: 欧洲区域 (GDPR)

```bash
# 1. 访问
http://localhost:3000?debug=europe

# 2. 验证
- ✅ 右上角显示绿色"🇪🇺 调试模式: 欧洲"指示器
- ✅ 支付功能被禁用(GDPR合规)
- ✅ 显示国际AI模型
```

#### 测试 4: 区域切换

```bash
# 1. 访问任意页面并启用调试模式
http://localhost:3000?debug=china

# 2. 点击右上角调试面板展开

# 3. 点击其他区域按钮(如"🇺🇸 美国")

# 4. 验证
- ✅ URL自动更新为?debug=usa
- ✅ 面板颜色改变为蓝色
- ✅ 页面内容相应更新
```

#### 测试 5: 支付流程

```bash
# 测试支付宝支付
http://localhost:3000/payment?debug=china
- ✅ 显示支付宝支付选项
- ✅ 可以创建支付订单

# 测试Stripe支付
http://localhost:3000/payment?debug=usa
- ✅ 显示Stripe支付选项
- ✅ 可以访问Stripe结账页面

# 测试欧洲限制
http://localhost:3000/payment?debug=europe
- ✅ 支付按钮被禁用
- ✅ 显示GDPR合规提示
```

### 🔒 安全特性

#### 生产环境保护

调试模式在生产环境中会被自动禁用:

```bash
# 生产环境访问
https://your-domain.com?debug=china

# 结果
- 🚫 返回403 Forbidden错误
- 🚫 显示 "Debug mode is not allowed in production"
- 🚫 调试面板不显示
```

#### 环境检测

```typescript
// middleware.ts中的检测逻辑
const isDevelopment = process.env.NODE_ENV === "development";

if (debugParam && !isDevelopment) {
  return new NextResponse(
    JSON.stringify({
      error: "Access Denied",
      message: "Debug mode is not allowed in production.",
      code: "DEBUG_MODE_BLOCKED",
    }),
    { status: 403 }
  );
}
```

### 📊 API 响应

调试模式会在 API 响应中添加特殊标识:

```bash
# 请求
GET /api/geo?debug=china

# 响应
{
  "region": "CHINA",
  "countryCode": "CN",
  "debug": true,
  "message": "Debug mode: forced CHINA region"
}

# 响应头
X-User-Region: CHINA
X-User-Country: CN
X-User-Currency: CNY
X-Debug-Mode: china
```

### 🎨 UI 组件

调试模式指示器组件 (`components/debug-mode-indicator.tsx`):

- 📍 位置: 固定在右上角
- 🎨 样式: 根据区域显示不同颜色
- 🔄 动画: Settings 图标旋转动画
- 📱 响应式: 自适应移动端和桌面端

### 💡 使用技巧

1. **快速测试支付**:

   ```
   http://localhost:3000/payment?debug=china
   ```

2. **测试 AI 模型过滤**:

   ```
   http://localhost:3000?debug=china  # 只看国内AI
   http://localhost:3000?debug=usa    # 看所有AI
   ```

3. **调试登录流程**:

   ```
   http://localhost:3000/auth?debug=china  # 微信登录
   http://localhost:3000/auth?debug=usa    # Google登录
   ```

4. **组合测试**:
   ```
   # 可以与其他参数组合
   http://localhost:3000/payment?debug=usa&plan=pro
   ```

### 🐛 故障排除

#### 问题 1: 调试面板不显示

**解决方案**:

- 确认 `NODE_ENV=development`
- 检查 URL 中是否有 `?debug=xxx` 参数
- 清除浏览器缓存并刷新

#### 问题 2: 区域切换无效

**解决方案**:

- 检查浏览器控制台是否有错误
- 确认路由器正确初始化
- 重启开发服务器

#### 问题 3: 生产环境仍可访问

**解决方案**:

- 检查 `process.env.NODE_ENV` 的值
- 确认 middleware.ts 中的安全检查已启用
- 查看服务器日志确认拦截

### 📚 相关文件

- `middleware.ts` - 调试模式检测和区域路由
- `components/debug-mode-indicator.tsx` - UI 组件
- `app/api/geo/route.ts` - 地理位置 API
- `app/layout.tsx` - 布局中包含调试指示器

---

## ✨ 新增功能

### v2.0 调试模式改进

1. ✅ **可视化指示器**: 右上角彩色面板
2. ✅ **实时切换**: 无需手动修改 URL
3. ✅ **安全加固**: 生产环境完全禁用
4. ✅ **更好的 UX**: 展开/折叠交互
5. ✅ **完整文档**: README 和测试指南

---

**状态**: ✅ 调试模式已重新启用并增强
**环境**: 仅开发环境可用
**安全**: 生产环境自动禁用
**最后更新**: 2025-11-05
