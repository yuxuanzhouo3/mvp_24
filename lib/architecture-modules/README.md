# Architecture Modules

一套可复用的架构模块系统，支持多地区智能分流、数据库适配、支付路由等功能。

## 特性

- 🌍 **智能地理分流**：根据 IP 自动选择数据库、支付方式和部署环境
- 💾 **数据库适配器**：支持 Supabase 和腾讯云 CloudBase
- 💰 **支付路由器**：自动选择地区合适的支付方式
- 🔧 **配置管理**：环境变量智能加载和验证
- 📱 **跨平台支持**：支持 Next.js、小程序、React Native 等

## 快速开始

### 方式 1：复制到新项目（推荐）

```bash
# Windows用户
./scripts/copy-to-project.bat C:\path\to\your\new\project

# Linux/Mac用户
./scripts/copy-to-project.sh /path/to/your/new/project
```

### 方式 2：手动集成

```bash
# 1. 复制模块文件
cp -r /path/to/source/lib/architecture-modules ./lib/

# 2. 安装依赖
cd lib/architecture-modules
npm install

# 3. 配置环境变量（见 .env.example）
```

### 方式 3：查看完整指南

- 📖 **[快速开始](QUICK_START.md)** - 5 分钟上手指南
- 📚 **[集成指南](INTEGRATION_GUIDE.md)** - 详细集成说明
- 🔄 **[迁移指南](MIGRATION_GUIDE.md)** - 从旧版本升级

## 安装

```bash
npm install @your-org/architecture-modules
# 或
yarn add @your-org/architecture-modules
```

## 快速开始

```typescript
import {
  geoRouter,
  createEnvironmentLoader,
  createDatabaseConnector,
} from "@your-org/architecture-modules";

// 1. 检测用户地理位置
const geoResult = await geoRouter.detect(userIP);
console.log(geoResult);
// {
//   region: 'china',
//   currency: 'CNY',
//   paymentMethods: ['wechat', 'alipay'],
//   database: 'cloudbase',
//   deployment: 'tencent'
// }

// 2. 加载环境配置
const envLoader = await createEnvironmentLoader(userIP);
const config = envLoader.load();

// 3. 创建数据库连接器
const dbConnector = createDatabaseConnector(geoResult.database, {
  type: geoResult.database,
  envId: config.WECHAT_CLOUDBASE_ID,
});

// 4. 初始化连接
await dbConnector.initialize();

// 5. 获取数据库客户端
const client = dbConnector.getClient();

// 6. 在你的应用中使用客户端进行数据操作
// 注意：数据操作逻辑由你的应用实现
```

## 核心模块

### 地理路由器 (GeoRouter)

```typescript
import { geoRouter } from "@your-org/architecture-modules";

const result = await geoRouter.detect("8.8.8.8");
// 返回地区信息、货币、支付方式等
```

### 环境配置加载器 (EnvironmentLoader)

```typescript
import { createEnvironmentLoader } from "@your-org/architecture-modules";

const loader = await createEnvironmentLoader(userIP);
const config = loader.load();
// 自动加载对应地区的环境变量
```

### 数据库连接器 (DatabaseConnector)

```typescript
import { createDatabaseConnector } from "@your-org/architecture-modules";

const connector = createDatabaseConnector("supabase", config);
// 或
const connector = createDatabaseConnector("cloudbase", config);

// 初始化连接
await connector.initialize();

// 获取数据库客户端
const client = connector.getClient();

// 在你的应用中实现数据访问层
// 例如：
// const favorites = await client.from('favorites').select('*').eq('user_id', userId);
```

### 支付路由器 (PaymentRouter)

```typescript
import { paymentRouter } from "@your-org/architecture-modules";

// 注册支付提供商
paymentRouter.registerProvider("stripe", stripeProvider);
paymentRouter.registerProvider("wechat", wechatProvider);

// 创建支付
const result = await paymentRouter.createPayment(region, {
  amount: 168,
  currency: "CNY",
  description: "Pro Plan",
  userId,
  planType: "pro",
  billingCycle: "yearly",
});
```

## 地区支持

| 地区 | 数据库    | 支付方式         | 货币 | 认证方式     |
| ---- | --------- | ---------------- | ---- | ------------ |
| 中国 | CloudBase | 微信支付、支付宝 | CNY  | 微信、邮箱   |
| 美国 | Supabase  | Stripe、PayPal   | USD  | Google、邮箱 |
| 欧洲 | Supabase  | 🚫 (GDPR)        | EUR  | 邮箱         |
| 其他 | Supabase  | Stripe、PayPal   | USD  | Google、邮箱 |

## 项目结构

```
lib/architecture-modules/
├── core/                          # 核心工具
│   ├── geo-router.ts             # 地理路由器
│   ├── types.ts                  # 类型定义
│   └── context.ts                # 请求上下文
├── config/                        # 配置管理
│   ├── env-loader.ts             # 环境变量加载器
│   └── subscription-config.ts    # 订阅配置
├── layers/                        # 架构层
│   ├── data-storage/             # 数据存储层
│   │   ├── adapter.ts            # 连接器接口
│   │   ├── supabase-connector.ts # Supabase连接器
│   │   └── cloudbase-connector.ts # CloudBase连接器
│   └── third-party/              # 第三方服务层
│       └── payment/              # 支付模块
│           └── router.ts         # 支付路由器
├── services/                      # 业务服务
├── utils/                         # 工具函数
└── index.ts                       # 主入口
```

## 环境变量配置

### 基础配置

```env
APP_NAME=YourApp
APP_URL=https://yourapp.com
NODE_ENV=production
```

### Supabase 配置（海外）

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### CloudBase 配置（国内）

```env
NEXT_PUBLIC_WECHAT_CLOUDBASE_ID=cloudbase-xxx
```

### 支付配置

```env
# Stripe
STRIPE_PUBLIC_KEY=pk_live_xxx
STRIPE_SECRET_KEY=sk_live_xxx

# PayPal
PAYPAL_CLIENT_ID=xxx
PAYPAL_CLIENT_SECRET=xxx

# 微信支付
WECHAT_APP_ID=wxf1aca21b5b79581d
WECHAT_MCH_ID=1694786758
WECHAT_API_KEY=your_api_key

# 支付宝
ALIPAY_APP_ID=2021005199628151
ALIPAY_PRIVATE_KEY=your_private_key
```

## 开发指南

### 添加新的支付方式

1. 实现`PaymentProvider`接口
2. 在支付路由器中注册
3. 更新地区配置

### 添加新的数据库支持

1. 实现`DatabaseConnector`接口
2. 在连接器工厂中添加支持
3. 更新地区配置

### 自定义地区规则

修改`geo-router.ts`中的地区分类逻辑。

## 测试

```bash
npm test
```

## 许可证

MIT
