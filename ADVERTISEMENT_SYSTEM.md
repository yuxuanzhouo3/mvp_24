# 广告系统使用说明

## 概述
广告系统支持在首页的多个位置展示图片或视频广告，包括顶部、底部、左侧和右侧等位置。

## 系统组件

### 1. 后台管理 API (`actions/admin-ads.ts`)
- **需要权限**: 管理员权限
- **主要功能**:
  - `listAdvertisements()` - 获取广告列表（需要管理员权限）
  - `createAdvertisementWithUrl()` - 创建广告
  - `updateAdvertisement()` - 更新广告
  - `toggleAdvertisementStatus()` - 切换广告状态（启用/禁用）
  - `deleteAdvertisement()` - 删除广告

### 2. 公开 API (`app/api/advertisements/route.ts`)
- **访问权限**: 公开（无需认证）
- **功能**: 获取已启用的广告
- **端点**: `GET /api/advertisements`
- **参数**: 
  - `position` (可选): 广告位置，支持值：
    - `top` - 顶部横幅
    - `bottom` - 底部横幅
    - `left` - 输入框左侧
    - `right` - 输入框右侧
    - `sidebar` - 侧边栏
    - `bottom-left` - 底部左侧
    - `bottom-right` - 底部右侧

**示例请求**:
```bash
# 获取所有已启用的广告
curl http://localhost:3000/api/advertisements

# 获取顶部位置的广告
curl http://localhost:3000/api/advertisements?position=top
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "ad-1",
      "title": "促销活动",
      "position": "top",
      "media_type": "image",
      "media_url": "https://example.com/ad.jpg",
      "target_url": "https://example.com/promotion",
      "is_active": true,
      "priority": 100,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "count": 1
}
```

### 3. 前台显示组件 (`components/ad-display.tsx`)
- **用途**: 在主页上显示广告
- **Props**:
  - `position` (必需): 广告位置
  - `className` (可选): 自定义样式类

**使用示例**:
```tsx
import { AdDisplay } from "@/components/ad-display";

export function MyComponent() {
  return (
    <div>
      {/* 显示顶部位置的广告 */}
      <AdDisplay position="top" />
      
      {/* 显示右侧位置的广告 */}
      <AdDisplay position="right" />
    </div>
  );
}
```

### 4. 主页集成 (`app/page.tsx`)
广告已集成到主页的以下位置：
- 顶部: 在 Header 下方
- 左侧: 在聊天历史侧边栏下方（桌面端）
- 底部: 在聊天区域下方
- 右侧: 在聊天区域右侧（桌面端）

## 使用流程

### 第一步：创建广告
1. 访问后台管理界面: `http://localhost:3000/admin/ads`
2. 需要使用管理员账号登录
3. 点击"新建广告"按钮
4. 填写广告信息：
   - **标题**: 广告名称（用于管理）
   - **位置**: 选择广告显示位置
   - **类型**: 选择图片或视频
   - **文件**: 上传广告媒体文件
   - **链接**: (可选) 点击广告时打开的链接
   - **优先级**: 多个广告时的优先级（数字越大优先级越高）
5. 点击"创建"按钮

### 第二步：启用广告
创建后，广告默认处于禁用状态。需要手动启用：
1. 在广告列表中找到已创建的广告
2. 点击"状态"列中的开关按钮，将其从"已下架"变为"已上架"
3. 前台页面会自动加载并显示已启用的广告

### 第三步：检查前台显示
1. 访问首页: `http://localhost:3000`
2. 进入工作区视图
3. 根据广告位置检查广告是否正常显示
4. 可以点击广告来打开关联的链接（如果配置了链接）
5. 鼠标悬停时可以看到关闭按钮，点击可以关闭该广告（仅在当前会话有效）

## 支持的媒体格式

### 图片
- PNG (.png)
- JPEG (.jpg, .jpeg)
- WebP (.webp)
- GIF (.gif)

### 视频
- MP4 (.mp4)
- WebM (.webm)

**文件大小建议**: 不超过 10MB，建议 2-5MB

## 数据库架构

### Supabase (国际版)
表名: `advertisements`

```sql
CREATE TABLE advertisements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  position TEXT NOT NULL,
  media_type TEXT NOT NULL, -- 'image' or 'video'
  media_url TEXT NOT NULL,
  target_url TEXT,
  is_active BOOLEAN DEFAULT false,
  priority INTEGER DEFAULT 0,
  file_size INTEGER,
  source TEXT DEFAULT 'supabase',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### CloudBase (国内版)
集合名: `advertisements`

字段同上，使用 CloudBase 的时间戳格式

## 故障排查

### 问题 1: 后台无法保存广告
**可能原因**:
- 没有管理员权限
- 文件上传失败
- 数据库连接问题

**解决方案**:
1. 确认已使用管理员账号登录
2. 检查网络连接和文件大小
3. 查看浏览器控制台的错误信息
4. 检查后台服务器日志

### 问题 2: 广告无法显示
**可能原因**:
- 广告未启用（状态为禁用）
- 广告的 media_url 链接失效
- 位置参数不匹配

**解决方案**:
1. 确认广告已启用（状态为"已上架"）
2. 检查广告的媒体文件是否可以访问
3. 打开浏览器开发者工具，查看 Network 标签中的 `/api/advertisements` 请求
4. 检查返回的数据是否包含正确的广告

### 问题 3: 无法启用广告
**可能原因**:
- 数据库同步问题
- 权限问题

**解决方案**:
1. 刷新页面重试
2. 查看浏览器控制台错误
3. 检查数据库连接状态
4. 如果是国内版，确认 CloudBase 已正确配置

## 测试广告 API

运行测试脚本:
```bash
node test-advertisement.mjs
```

这将测试：
1. 获取所有广告
2. 按位置筛选广告
3. 显示数据库状态信息

## 最佳实践

1. **优先级设置**: 对于同一位置的多个广告，使用优先级来控制展示顺序
2. **文件优化**: 使用压缩的图片格式（WebP 最佳），视频使用 MP4 格式
3. **响应式设计**: 广告组件已支持响应式，在移动端会自动隐藏部分位置的广告
4. **定期检查**: 定期检查广告链接是否有效，过期广告应及时禁用或删除
5. **性能考虑**: API 使用 60 秒 ISR 缓存，新创建的广告最多需要 60 秒才能显示

## 开发者信息

### 关键文件
- 后台管理页面: `app/admin/ads/page.tsx`
- 后台 API: `actions/admin-ads.ts`
- 公开 API: `app/api/advertisements/route.ts`
- 显示组件: `components/ad-display.tsx`
- 主页集成: `app/page.tsx`

### 修改历史
- 创建公开 API: 允许前台获取已启用的广告
- 修复后台状态切换: 支持 CloudBase 数据库同步
- 创建前台显示组件: 支持多个广告位置
- 主页集成: 在合适位置显示广告

## 联系方式

如有问题，请检查代码注释或提交 Issue。
