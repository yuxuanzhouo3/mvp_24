# 部署配置指南

## 概述

部署配置系统用于管理应用在不同区域（中国/国际）的部署参数。这是一个纯 TypeScript 配置，**不依赖环境变量**，解决了腾讯云运行时的限制。

## 架构

```
lib/config/
├── deployment.config.ts    ← 核心配置文件（修改这个）
├── region.ts              ← 区域工具函数（读取上面的配置）
├── index.ts               ← 统一导出
└── DEPLOYMENT_CONFIG_GUIDE.md  ← 本文档
```

## 快速开始

### 1. 切换部署区域

编辑 `lib/config/deployment.config.ts`，修改第 104 行的 `DEPLOYMENT_REGION`：

```typescript
// 中国版本
const DEPLOYMENT_REGION: DeploymentRegion = "CN";

// 或国际版本
const DEPLOYMENT_REGION: DeploymentRegion = "INTL";
```

### 2. 在代码中使用

#### 方式一：使用新 API（推荐）

```typescript
import { isChinaDeployment, getAuthProvider, deploymentConfig } from "@/lib/config";

// 判断区域
if (isChinaDeployment()) {
  console.log("使用中国版本");
}

// 获取提供商
const authProvider = getAuthProvider(); // "cloudbase" | "supabase"

// 检查功能支持
import { isAuthFeatureSupported } from "@/lib/config";
if (isAuthFeatureSupported("wechatAuth")) {
  // 启用微信登录
}

// 获取完整配置
const config = deploymentConfig;
console.log(config.region); // "CN" | "INTL"
```

#### 方式二：使用旧 API（向后兼容）

```typescript
import { isChinaRegion, RegionConfig } from "@/lib/config";

// 判断区域
if (isChinaRegion()) {
  console.log("使用中国版本");
}

// 访问区域配置
console.log(RegionConfig.auth.provider);
```

## 配置结构

### DeploymentConfig 接口

```typescript
interface DeploymentConfig {
  region: "CN" | "INTL";           // 部署区域
  appName: string;                 // 应用名称
  version: string;                 // 应用版本

  auth: {
    provider: "cloudbase" | "supabase";
    features: {
      emailAuth: boolean;
      wechatAuth: boolean;
      googleAuth: boolean;
      githubAuth: boolean;
    };
  };

  database: {
    provider: "cloudbase" | "supabase";
  };

  payment: {
    providers: Array<"stripe" | "paypal" | "wechat" | "alipay">;
  };

  apis: {
    authCallbackPath: string;
  };

  logging: {
    level: "debug" | "info" | "warn" | "error";
    enableConsole: boolean;
  };
}
```

## 导出的工具函数

### 核心判断函数

| 函数 | 说明 | 返回值 |
|------|------|--------|
| `isChinaDeployment()` | 判断是否为中国版本 | `boolean` |
| `isInternationalDeployment()` | 判断是否为国际版本 | `boolean` |
| `getAuthProvider()` | 获取认证提供商 | `"cloudbase" \| "supabase"` |
| `getDatabaseProvider()` | 获取数据库提供商 | `"cloudbase" \| "supabase"` |

### 功能检查函数

```typescript
// 检查特定认证功能是否支持
isAuthFeatureSupported("wechatAuth") → boolean
isAuthFeatureSupported("googleAuth") → boolean

// 检查特定支付方式是否支持
isPaymentMethodSupported("wechat") → boolean
isPaymentMethodSupported("stripe") → boolean

// 获取支持的支付列表
getPaymentProviders() → ["stripe", "paypal"] | ["wechat", "alipay"]
```

## 部署场景

### 场景 1：本地开发中国版

```typescript
// lib/config/deployment.config.ts
const DEPLOYMENT_REGION: DeploymentRegion = "CN";
```

### 场景 2：腾讯云部署

```typescript
// lib/config/deployment.config.ts
const DEPLOYMENT_REGION: DeploymentRegion = "CN";
```

部署前构建应用：
```bash
npm run build
npm start
```

### 场景 3：Vercel 部署国际版

```typescript
// lib/config/deployment.config.ts
const DEPLOYMENT_REGION: DeploymentRegion = "INTL";
```

### 场景 4：CI/CD 自动切换

在构建脚本中动态修改 `deployment.config.ts`：

```bash
# 构建中国版
sed -i 's/const DEPLOYMENT_REGION.*/const DEPLOYMENT_REGION: DeploymentRegion = "CN";/' lib/config/deployment.config.ts
npm run build

# 构建国际版
sed -i 's/const DEPLOYMENT_REGION.*/const DEPLOYMENT_REGION: DeploymentRegion = "INTL";/' lib/config/deployment.config.ts
npm run build
```

## 扩展配置

### 添加新的区域配置

编辑 `lib/config/deployment.config.ts`，在 `generateConfig` 函数中添加：

```typescript
function generateConfig(region: DeploymentRegion): DeploymentConfig {
  const isChinaRegion = region === "CN";

  return {
    // ... 现有配置 ...

    // 新增配置项
    newFeature: {
      enabled: isChinaRegion,
      value: "something",
    },
  };
}
```

然后在接口定义中添加类型：

```typescript
export interface DeploymentConfig {
  // ... 现有字段 ...
  newFeature: {
    enabled: boolean;
    value: string;
  };
}
```

### 添加新的工具函数

在 `lib/config/deployment.config.ts` 中导出：

```typescript
export function isNewFeatureEnabled(): boolean {
  return deploymentConfig.newFeature.enabled;
}
```

## 最佳实践

### ✅ 推荐做法

1. **使用新 API**：优先使用 `isChinaDeployment()` 等新函数
2. **类型安全**：利用 TypeScript 类型检查
3. **配置集中**：所有部署配置都在 `deployment.config.ts` 中
4. **版本控制**：配置文件纳入 Git 追踪

### ❌ 避免做法

1. **不要硬编码区域判断**：
   ```typescript
   // 错误！
   if (process.env.REGION === "CN") { }

   // 正确
   if (isChinaDeployment()) { }
   ```

2. **不要依赖 .env 文件**：
   ```typescript
   // 错误！
   const region = process.env.DEPLOY_REGION;

   // 正确
   import { currentRegion } from "@/lib/config";
   ```

3. **不要在运行时修改配置**：配置应该在构建时确定

## 调试

### 打印当前配置

```typescript
import { getFullConfig, printRegionConfig } from "@/lib/config";

// 打印完整配置
console.log(getFullConfig());

// 打印格式化信息
printRegionConfig();
```

输出示例：
```
🌍 ========== 区域配置信息 ==========
📍 当前区域: 中国 🇨🇳
🔐 认证服务: cloudbase
💾 数据库服务: cloudbase
💰 支付服务: alipay
🤖 AI 服务: deepseek
========================================
```

### 验证配置

```typescript
import { validateRegionConfig } from "@/lib/config";

const validation = validateRegionConfig();
if (!validation.valid) {
  validation.errors.forEach(err => console.error(err));
}
```

## 常见问题

### Q: 如何在不同的部署中使用不同配置？

A: 在 CI/CD 流程中，通过构建脚本修改 `deployment.config.ts`，然后构建。

### Q: 能否在运行时切换区域？

A: 不建议。区域配置应该在构建时确定，以支持静态优化和 Tree Shaking。

### Q: 旧的 .env 变量还会被读取吗？

A: 不会。`deployment.config.ts` 完全替代了环境变量方式。

### Q: 如何迁移现有代码？

A: 逐步替换：
1. 用 `isChinaDeployment()` 替代 `isChinaRegion()`
2. 用 `isAuthFeatureSupported("wechatAuth")` 替代 `RegionConfig.auth.features.wechatAuth`
3. 删除对环境变量的依赖

## 相关文件

- `lib/config/deployment.config.ts` - 核心配置
- `lib/config/region.ts` - 区域工具函数
- `lib/config/index.ts` - 统一导出
- `.env.example` - 环境变量示例（仅供参考，部署配置不再依赖）
