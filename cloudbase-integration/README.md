# CloudBase 集成实现

## 📁 文件结构说明

本文件夹包含了项目中所有与腾讯云CloudBase相关的代码实现，按功能分类组织。

```
cloudbase-integration/
├── client.ts              # CloudBase客户端（浏览器端）
├── adapter.ts             # CloudBase适配器和工厂函数
├── auth-api.ts            # 认证API（服务端）
├── favorites-api.ts       # 收藏API（服务端）
├── custom-sites-api.ts    # 自定义网站API（服务端）
├── auth-client.ts         # 前端认证客户端
├── schemas.ts             # 数据库集合结构定义
├── config.ts              # 配置和环境变量说明
├── test-connection.ts     # 连接测试脚本
└── README.md              # 本文档
```

## 📋 各文件功能详解

### 1. `client.ts` - CloudBase客户端
**作用**: 初始化CloudBase SDK，仅在浏览器端工作
**功能**:
- 延迟初始化，避免SSR错误
- 提供数据库和认证实例
- 定义集合名称常量
- 导出辅助函数

**使用场景**: 前端代码需要访问CloudBase数据库时

### 2. `adapter.ts` - CloudBase适配器
**作用**: 实现统一的数据库操作接口
**功能**:
- `CloudBaseAdapter` 类：封装所有数据库操作
- `IDatabaseAdapter` 接口：定义标准数据库操作方法
- `createDatabaseAdapter` 工厂函数：根据地区选择数据库
- 收藏、自定义网站、订阅的增删改查操作

**使用场景**: 业务逻辑层需要数据库操作时，通过适配器接口调用

### 3. `auth-api.ts` - 认证API
**作用**: 处理国内用户的注册、登录、Token刷新
**功能**:
- 用户注册 (`action: 'signup'`)
- 用户登录 (`action: 'login'`)
- Token刷新 (`action: 'refresh'`)
- 密码bcrypt加密
- JWT Token生成和管理

**使用场景**: API路由 `/api/auth-cn` 的处理逻辑

### 4. `favorites-api.ts` - 收藏API
**作用**: 处理用户的收藏操作
**功能**:
- 获取用户收藏列表 (GET)
- 添加收藏 (POST)
- 删除收藏 (DELETE)
- JWT Token验证

**使用场景**: API路由 `/api/favorites-cn` 的处理逻辑

### 5. `custom-sites-api.ts` - 自定义网站API
**作用**: 处理用户的自定义网站管理
**功能**:
- 获取自定义网站列表 (GET)
- 添加自定义网站 (POST)
- 删除自定义网站 (DELETE)
- JWT Token验证和权限检查

**使用场景**: API路由 `/api/custom-sites-cn` 的处理逻辑

### 6. `auth-client.ts` - 前端认证客户端
**作用**: 前端调用认证API的客户端代码
**功能**:
- `signupWithEmailCN()`: 注册函数
- `loginWithEmailCN()`: 登录函数
- 类型定义和错误处理

**使用场景**: 前端组件需要用户注册/登录时

### 7. `schemas.ts` - 数据库集合结构
**作用**: 定义CloudBase数据库集合的结构和示例数据
**功能**:
- 5个集合的JSON Schema定义
- 示例数据（JSON Lines格式）
- 字段说明文档

**使用场景**: 数据库初始化和文档参考

### 8. `config.ts` - 配置说明
**作用**: 环境变量和配置的完整说明
**功能**:
- 环境变量配置说明
- 权限配置建议
- 依赖包说明

**使用场景**: 项目配置和部署参考

### 9. `test-connection.ts` - 连接测试
**作用**: 验证CloudBase连接和配置是否正确
**功能**:
- 环境变量检查
- CloudBase初始化测试
- 数据库连接测试
- 错误诊断和建议

**使用场景**: 部署后验证配置，或排查连接问题

## 🚀 快速开始

### 1. 环境配置
复制 `config.ts` 中的环境变量到你的 `.env.local` 文件：

```bash
# 腾讯云CloudBase配置 (国内用户)
NEXT_PUBLIC_WECHAT_CLOUDBASE_ID=cloudbase-1gnip2iaa08260e5
CLOUDBASE_SECRET_ID=your_secret_id
CLOUDBASE_SECRET_KEY=your_secret_key
```

### 2. 安装依赖
```bash
npm install @cloudbase/js-sdk @cloudbase/node-sdk bcryptjs jsonwebtoken
```

### 3. 测试连接
```bash
node cloudbase-integration/test-connection.ts
```

### 4. 使用示例

#### 前端使用适配器：
```typescript
import { createDatabaseAdapter } from './cloudbase-integration/adapter'

// 根据用户IP选择数据库
const adapter = await createDatabaseAdapter(isChina, userId)

// 获取收藏
const favorites = await adapter.getFavorites()

// 添加收藏
await adapter.addFavorite('site_001')
```

#### API路由使用：
```typescript
import { authCnHandler } from './cloudbase-integration/auth-api'

export default authCnHandler
```

## 📊 数据库集合说明

| 集合名称 | 用途 | 权限建议 |
|---------|------|---------|
| `web_users` | 用户信息存储 | 仅管理端可读写 |
| `web_favorites` | 用户收藏记录 | 所有用户可读，仅创建者可写 |
| `web_custom_sites` | 自定义网站 | 所有用户可读，仅创建者可写 |
| `web_subscriptions` | 订阅信息 | 仅管理端可读写 |
| `web_payment_transactions` | 支付记录 | 仅管理端可读写 |

## 🔧 核心特性

- **双数据库架构**: 根据用户IP自动选择CloudBase或Supabase
- **SSR兼容**: 客户端代码避免SSR错误
- **类型安全**: 完整的TypeScript类型定义
- **错误处理**: 完善的错误处理和日志记录
- **权限控制**: 基于JWT Token的用户认证和授权
- **数据合规**: 国内用户数据存储在腾讯云，符合合规要求

## 🐛 常见问题

### 连接失败
运行测试脚本检查配置：
```bash
node cloudbase-integration/test-connection.ts
```

### 权限错误
检查CloudBase控制台的集合权限设置

### SSR错误
确保客户端代码只在浏览器端执行，使用 `typeof window !== 'undefined'` 检查

## 📝 更新日志

- **2025-11-07**: 创建分类文件结构，重构代码组织
- **2025-01-23**: 初始CloudBase集成实现

## 📞 技术支持

如有问题，请检查：
1. 环境变量配置是否正确
2. 依赖包是否已安装
3. CloudBase控制台权限设置
4. 网络连接是否正常