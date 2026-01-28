# 国内版下载功能重构 - CloudBase 集成

## 📋 概述

将国内版应用下载功能从硬编码 CDN 链接升级为使用 CloudBase SDK，通过后端 API 端点安全地管理文件下载。

## 🎯 改动内容

### 1. 环境变量配置

#### 文件：`.env.example` 和 `.env.cn.local`

新增四个后端环境变量（不加 `NEXT_PUBLIC_` 前缀，仅后端可访问）：

```bash
# 国内版应用下载配置（CloudBase 文件）
CN_ANDROID_FILE_ID=cloud://your-bucket/downloads/multigpt-android-cn.apk
CN_IOS_FILE_ID=cloud://your-bucket/downloads/multigpt-ios-cn.ipa
CN_WINDOWS_FILE_ID=cloud://your-bucket/downloads/multigpt-windows-cn.exe
CN_MACOS_FILE_ID=cloud://your-bucket/downloads/multigpt-macos-cn.dmg
```

**特点：**
- 🔒 不暴露在前端（无 `NEXT_PUBLIC_` 前缀）
- 📦 使用 CloudBase 标准格式 `cloud://bucket/path`
- 🔄 支持轻松切换文件版本

### 2. CloudBase 服务扩展

#### 文件：`lib/cloudbase-service.ts`

新增 `downloadFileFromCloudBase()` 函数：

```typescript
export async function downloadFileFromCloudBase(fileID: string): Promise<Buffer | null>
```

**功能：**
- 调用 CloudBase SDK 的 `downloadFile()` 方法
- 返回文件内容的 Buffer
- 包含完整的错误处理和日志

### 3. 下载配置更新

#### 文件：`lib/config/download.config.ts`

**核心改动：**

```typescript
// 国内版现在使用 fileID
interface DownloadLink {
  platform: PlatformType;
  label: string;
  url?: string;     // 国际版使用
  fileID?: string;  // 国内版使用
}
```

国内版配置示例：
```typescript
const chinaDownloads: RegionDownloadConfig = {
  region: 'CN',
  downloads: [
    {
      platform: 'android',
      label: 'Android 应用',
      fileID: process.env.CN_ANDROID_FILE_ID || '...',
    },
    // 其他平台...
  ],
};
```

新增函数：
- `getDownloadInfo()` - 获取完整的下载链接信息（包括 fileID）

### 4. 后端 API 端点

#### 文件：`app/api/downloads/route.ts`

**请求方式：**
```
GET /api/downloads?platform=android&region=CN
```

**国内版处理流程：**
1. 接收平台参数 (android|ios|windows|macos)
2. 从环境变量获取对应的 fileID（仅后端可访问）
3. 调用 CloudBase SDK 的 `downloadFile()` 下载文件
4. 返回 Base64 编码的文件内容 + 文件名

**响应示例（国内版）：**
```json
{
  "success": true,
  "platform": "android",
  "region": "CN",
  "fileName": "multigpt-android-cn.apk",
  "downloadUrl": "data:application/octet-stream;base64,UEsDBAoAAA...",
  "fileSize": 45678900
}
```

**响应示例（国际版）：**
```
HTTP 302 Redirect
Location: https://github.com/your-org/multigpt/releases/download/v3.0.0/multigpt-android.apk
```

**特点：**
- ✅ 安全：fileID 永不暴露给前端
- 📊 完整日志：便于调试和监控
- 🛡️ 错误处理：友好的错误消息

### 5. 前端下载页面集成

#### 文件：`app/download/page.tsx`

**核心改动：**

```typescript
const handleDownload = async (platform: PlatformType) => {
  if (isChina) {
    // 国内版：通过 API 获取 Base64 文件
    const response = await fetch(`/api/downloads?platform=${platform}&region=CN`);
    const data = await response.json();

    // 创建临时链接并下载
    const link = document.createElement('a');
    link.href = data.downloadUrl;
    link.download = data.fileName;
    link.click();
  } else {
    // 国际版：直接重定向
    const response = await fetch(`/api/downloads?platform=${platform}&region=INTL`);
    window.location.href = response.url;
  }
};
```

**UI 改进：**
- 🔄 加载状态显示（旋转动画）
- ❌ 错误提示（3秒自动消除）
- 🎯 下载中文本国际化

## 🔒 安全性考虑

### 1. **FileID 隐藏**
- ✅ 环境变量不加 `NEXT_PUBLIC_` 前缀
- ✅ 仅在服务器端读取和使用
- ✅ 前端完全无法访问 fileID

### 2. **API 端点保护**
- ✅ 参数验证（平台、区域检查）
- ✅ 完整的错误处理
- ✅ 日志记录便于审计

### 3. **文件访问控制**
- CloudBase 可配置上传/下载权限
- 支持版本管理和灰度发布

## 📊 工作流对比

### 之前（硬编码 CDN）
```
前端 → 直接访问 CDN URL
问题：URL 硬编码，版本更新需要改代码
```

### 现在（CloudBase 集成）
```
前端 → 调用 /api/downloads → 后端读取 fileID → CloudBase SDK → 返回文件
优势：
  • 动态管理文件版本
  • 完整的访问日志
  • 支持权限控制
  • 便于灰度发布
```

## 🚀 使用指南

### 部署检查列表

1. **更新环境变量**
   ```bash
   # 在 .env.cn.local 中设置实际的 fileID
   CN_ANDROID_FILE_ID=cloud://your-bucket/downloads/app-v1.0.0.apk
   CN_IOS_FILE_ID=cloud://your-bucket/downloads/app-v1.0.0.ipa
   CN_WINDOWS_FILE_ID=cloud://your-bucket/downloads/app-v1.0.0.exe
   CN_MACOS_FILE_ID=cloud://your-bucket/downloads/app-v1.0.0.dmg
   ```

2. **验证 CloudBase 权限**
   - 确保 CloudBase 存储桶中有对应的文件
   - 检查下载权限配置

3. **测试下载**
   - 访问 `/download` 页面
   - 点击对应平台的下载按钮
   - 观察浏览器开发者工具中的网络请求

### 故障排查

**问题：404 错误 "无法获取文件内容"**
- 检查 fileID 格式是否正确
- 验证 CloudBase 中文件是否存在

**问题：下载失败 "从云存储读取文件失败"**
- 检查 CloudBase 权限配置
- 查看服务器日志中的详细错误信息

**问题：国际版重定向失败**
- 验证 GitHub Releases URL 是否正确
- 检查文件是否已发布

## 📝 相关文件清单

| 文件 | 改动 | 说明 |
|------|------|------|
| `.env.example` | ✏️ 新增 | 添加 CN_*_FILE_ID 变量 |
| `.env.cn.local` | ✏️ 修改 | 设置实际的 fileID |
| `lib/cloudbase-service.ts` | ✏️ 扩展 | 新增 downloadFileFromCloudBase() |
| `lib/config/download.config.ts` | ✏️ 重构 | 支持 fileID，新增 getDownloadInfo() |
| `app/api/downloads/route.ts` | ✨ 新建 | 下载 API 端点 |
| `app/download/page.tsx` | ✏️ 更新 | 集成新 API，改进 UI |

## 🔄 未来改进

1. **文件大小优化**
   - 对于大文件，改用流式传输而非 Base64
   - 实现分片下载和断点续传

2. **版本管理**
   - 支持多个应用版本
   - 自动选择最新版本

3. **下载统计**
   - 记录下载次数和用户信息
   - 用于数据分析

4. **CDN 加速**
   - 集成 CloudBase CDN
   - 自动地理分流

## 📞 技术支持

如有问题，请检查：
1. 服务器日志（`[Download API]` 和 `[CloudBase Service]` 前缀）
2. 浏览器控制台（`[Download]` 前缀）
3. 环境变量配置

---

**最后更新：** 2025-11-20
**实现方案：** CloudBase Node SDK + Next.js API Routes
