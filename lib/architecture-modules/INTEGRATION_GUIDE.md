# 架构模块接入指南

## 概述

本指南将帮助你在新项目中快速接入架构模块，实现多地区智能分流、数据库适配、支付路由等功能。

## 前置条件

- Node.js >= 18.0.0
- TypeScript 项目
- 支持 ES Modules

## 步骤 1：安装依赖

### 方式 1：从本地复制模块（推荐）

```bash
# 复制整个模块目录到你的项目
cp -r /path/to/source/lib/architecture-modules ./lib/

# 安装依赖
cd lib/architecture-modules
npm install
```

### 方式 2：发布到 npm 后安装

```bash
npm install @mornscience/architecture-modules
```

## 步骤 2：配置环境变量

在你的项目根目录创建 `.env.local` 文件：

```env
# 基础配置
APP_NAME=YourAppName
APP_URL=https://yourapp.com  # 应用URL：生产环境设置域名，Vercel部署自动检测，开发环境默认localhost

# Supabase 配置（海外用户）
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# 腾讯云 CloudBase 配置（中国用户）
NEXT_PUBLIC_WECHAT_CLOUDBASE_ID=your_cloudbase_env_id

# Stripe 配置（海外支付）
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_SECRET_KEY=sk_test_xxx

# PayPal 配置（海外支付）
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret

# 微信支付配置（中国支付）
WECHAT_PAY_APP_ID=your_wechat_app_id
WECHAT_PAY_MCH_ID=your_merchant_id
WECHAT_PAY_API_V3_KEY=your_api_key

# 支付宝配置（中国支付）
NEXT_PUBLIC_ALIPAY_APP_ID=your_alipay_app_id
ALIPAY_PRIVATE_KEY=your_private_key

# 认证配置
# Supabase 邮箱验证码 + OAuth（海外）- 在Supabase控制台配置，无需环境变量
WECHAT_APP_SECRET=your_wechat_app_secret
```

## 步骤 3：创建架构服务类

在你的项目中创建 `lib/architecture-service.ts`：

```typescript
// lib/architecture-service.ts
import {
  geoRouter,
  createEnvironmentLoader,
  createDatabaseConnector,
  paymentRouter,
  RegionType,
  GeoResult,
  EnvironmentConfig,
  DatabaseConnector,
} from "./architecture-modules";

export class ArchitectureService {
  private static instance: ArchitectureService;
  private geoCache = new Map<
    string,
    {
      geo: GeoResult;
      config: EnvironmentConfig;
      dbConnector: DatabaseConnector;
    }
  >();

  static getInstance(): ArchitectureService {
    if (!ArchitectureService.instance) {
      ArchitectureService.instance = new ArchitectureService();
    }
    return ArchitectureService.instance;
  }

  /**
   * 为用户初始化架构服务
   */
  async initializeForUser(userIP: string): Promise<{
    geo: GeoResult;
    config: EnvironmentConfig;
    dbConnector: DatabaseConnector;
  }> {
    // 检查缓存
    const cached = this.geoCache.get(userIP);
    if (cached) {
      return cached;
    }

    try {
      // 1. 地理位置检测
      const geo = await geoRouter.detect(userIP);

      // 2. 加载环境配置
      const envLoader = await createEnvironmentLoader(userIP);
      const config = envLoader.load();

      // 3. 创建数据库适配器
      const dbConnector = createDatabaseConnector(geo.database, {
        type: geo.database,
        connectionString: config.SUPABASE_URL,
        envId: config.WECHAT_CLOUDBASE_ID,
      });

      // 4. 初始化数据库
      await dbAdapter.initialize({
        type: geo.database,
        connectionString: config.SUPABASE_URL,
        envId: config.WECHAT_CLOUDBASE_ID,
      });

      // 缓存结果
      const result = { geo, config, dbConnector };
      this.geoCache.set(userIP, result);

      return result;
    } catch (error) {
      console.error("架构服务初始化失败:", error);
      throw error;
    }
  }

  /**
   * 获取用户地理信息
   */
  async getUserGeo(userIP: string): Promise<GeoResult> {
    return await geoRouter.detect(userIP);
  }

  /**
   * 创建支付订单
   */
  async createPayment(
    region: RegionType,
    order: {
      amount: number;
      currency: string;
      description: string;
      userId: string;
      planType: string;
      billingCycle: "monthly" | "yearly";
    }
  ) {
    return await paymentRouter.createPayment(region, order);
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.geoCache.clear();
    geoRouter.clearCache();
  }
}

// 导出单例实例
export const architectureService = ArchitectureService.getInstance();
```

## 步骤 4：集成到 Next.js API Routes

### 创建基础 API 中间件

创建 `lib/middleware/architecture.ts`：

```typescript
// lib/middleware/architecture.ts
import { NextRequest, NextResponse } from "next/server";
import { architectureService } from "../architecture-service";

export interface ArchitectureContext {
  geo: import("../architecture-modules").GeoResult;
  config: import("../architecture-modules").EnvironmentConfig;
  dbConnector: import("../architecture-modules").DatabaseConnector;
}

/**
 * 架构中间件 - 为每个请求注入地理和数据库上下文
 */
export async function withArchitecture(
  request: NextRequest,
  handler: (context: ArchitectureContext) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    // 获取客户端IP
    const clientIP = getClientIP(request);

    // 初始化架构服务
    const { geo, config, dbAdapter } =
      await architectureService.initializeForUser(clientIP);

    // 创建上下文
    const context: ArchitectureContext = {
      geo,
      config,
      dbAdapter,
    };

    // 调用处理器
    return await handler(context);
  } catch (error) {
    console.error("架构中间件错误:", error);
    return NextResponse.json({ error: "服务暂时不可用" }, { status: 500 });
  }
}

/**
 * 获取客户端真实IP
 */
function getClientIP(request: NextRequest): string {
  // 优先级：x-forwarded-for > x-real-ip > 默认
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for 可能包含多个IP，取第一个
    return forwarded.split(",")[0].trim();
  }

  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  // 本地开发环境
  return "127.0.0.1";
}
```

### 使用中间件的 API Route 示例

创建 `app/api/user/data/route.ts`：

```typescript
// app/api/user/data/route.ts
import { NextRequest } from "next/server";
import { withArchitecture } from "../../../../lib/middleware/architecture";

export async function GET(request: NextRequest) {
  return withArchitecture(request, async (context) => {
    const { geo, dbAdapter } = context;

    try {
      // 获取用户ID（从认证中间件或参数中获取）
      const userId = request.nextUrl.searchParams.get("userId");
      if (!userId) {
        return Response.json({ error: "Missing userId" }, { status: 400 });
      }

      // 使用数据库适配器获取数据
      const favorites = await dbAdapter.getFavorites(userId);
      const subscription = await dbAdapter.getSubscription(userId);

      return Response.json({
        success: true,
        data: {
          favorites,
          subscription,
          region: geo.region,
          currency: geo.currency,
          availablePayments: geo.paymentMethods,
        },
      });
    } catch (error) {
      console.error("获取用户数据失败:", error);
      return Response.json({ error: "获取数据失败" }, { status: 500 });
    }
  });
}
```

## 步骤 5：集成到 React 组件

### 创建 React Hook

创建 `hooks/use-architecture.ts`：

```typescript
// hooks/use-architecture.ts
import { useState, useEffect } from "react";
import { architectureService } from "../lib/architecture-service";
import {
  GeoResult,
  EnvironmentConfig,
  DatabaseConnector,
} from "../lib/architecture-modules";

export function useArchitecture(userIP?: string) {
  const [geo, setGeo] = useState<GeoResult | null>(null);
  const [config, setConfig] = useState<EnvironmentConfig | null>(null);
  const [dbConnector, setDbConnector] = useState<DatabaseConnector | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);
        const ip = userIP || (await fetch("/api/ip").then((r) => r.json())).ip;
        const result = await architectureService.initializeForUser(ip);

        setGeo(result.geo);
        setConfig(result.config);
        setDbConnector(result.dbConnector);
      } catch (err) {
        setError(err instanceof Error ? err.message : "初始化失败");
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [userIP]);

  return {
    geo,
    config,
    dbAdapter,
    loading,
    error,
  };
}
```

### 在组件中使用

```typescript
// components/UserDashboard.tsx
import { useArchitecture } from "../hooks/use-architecture";

export function UserDashboard({ userId }: { userId: string }) {
  const { geo, dbConnector, loading, error } = useArchitecture();

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error}</div>;
  if (!geo || !dbConnector) return <div>初始化失败</div>;

  return (
    <div>
      <h2>用户面板</h2>
      <p>地区: {geo.region}</p>
      <p>货币: {geo.currency}</p>
      <p>可用支付方式: {geo.paymentMethods.join(", ") || "无（GDPR限制）"}</p>

      {/* 根据地区显示不同内容 */}
      {geo.region === "europe" && (
        <div className="gdpr-notice">根据GDPR规定，此地区不支持在线支付。</div>
      )}
    </div>
  );
}
```

## 步骤 6：集成支付功能

### 创建支付 API Route

创建 `app/api/payment/create/route.ts`：

```typescript
// app/api/payment/create/route.ts
import { NextRequest } from "next/server";
import { withArchitecture } from "../../../../lib/middleware/architecture";

export async function POST(request: NextRequest) {
  return withArchitecture(request, async (context) => {
    const { geo, dbAdapter } = context;

    try {
      const { userId, planType, billingCycle } = await request.json();

      // 检查是否可以支付
      if (geo.paymentMethods.length === 0) {
        return Response.json(
          {
            error: "此地区不支持在线支付",
            reason: "GDPR合规要求",
          },
          { status: 403 }
        );
      }

      // 获取订阅计划价格
      const subscription = await dbAdapter.getSubscription(userId);
      if (subscription) {
        return Response.json({ error: "用户已有订阅" }, { status: 400 });
      }

      // 创建支付订单
      const paymentResult = await architectureService.createPayment(
        geo.region,
        {
          amount: planType === "pro" ? 168 : 2520, // 根据billingCycle调整
          currency: geo.currency,
          description: `${planType} Plan ${billingCycle}`,
          userId,
          planType,
          billingCycle,
        }
      );

      if (!paymentResult.success) {
        return Response.json(
          {
            error: "创建支付订单失败",
            details: paymentResult.error,
          },
          { status: 500 }
        );
      }

      return Response.json({
        success: true,
        paymentId: paymentResult.paymentId,
        paymentUrl: paymentResult.paymentUrl,
        qrCode: paymentResult.qrCode,
      });
    } catch (error) {
      console.error("创建支付订单失败:", error);
      return Response.json({ error: "创建支付失败" }, { status: 500 });
    }
  });
}
```

## 步骤 7：添加错误处理和监控

### 创建错误处理工具

创建 `lib/error-handler.ts`：

```typescript
// lib/error-handler.ts
import { RegionType } from "./architecture-modules";

export class ArchitectureError extends Error {
  constructor(message: string, public region: RegionType, public code: string) {
    super(message);
    this.name = "ArchitectureError";
  }
}

export function handleArchitectureError(error: unknown, region: RegionType) {
  if (error instanceof ArchitectureError) {
    // 记录到监控系统
    console.error(`[${region}] ${error.code}: ${error.message}`);

    // 根据错误类型返回用户友好的消息
    switch (error.code) {
      case "PAYMENT_DISABLED":
        return "此地区不支持在线支付服务";
      case "DATABASE_UNAVAILABLE":
        return "数据服务暂时不可用，请稍后重试";
      case "GEO_DETECTION_FAILED":
        return "无法确定您的地区信息";
      default:
        return "服务暂时不可用，请稍后重试";
    }
  }

  // 未知错误
  console.error(`[${region}] 未知错误:`, error);
  return "发生未知错误，请联系客服";
}
```

## 步骤 8：部署配置

### Vercel 部署配置

创建 `vercel.json`：

```json
{
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 30
    }
  },
  "regions": ["sin1", "hnd1", "iad1", "fra1"]
}
```

### 腾讯云部署配置

创建 `serverless.yml`：

```yaml
component: "@serverless/tencent-scf"
inputs:
  name: your-app
  src: ./
  runtime: Nodejs18.15
  region: ap-shanghai
  environment:
    variables:
      NODE_ENV: production
```

## 步骤 9：测试和验证

### 创建测试脚本

创建 `scripts/test-integration.js`：

```javascript
// scripts/test-integration.js
const { architectureService } = require("../lib/architecture-service");

async function testIntegration() {
  console.log("🧪 开始集成测试...\n");

  // 测试不同地区的IP
  const testIPs = {
    china: "223.5.5.5", // 阿里DNS
    usa: "8.8.8.8", // Google DNS
    europe: "194.2.0.1", // Swisscom
  };

  for (const [region, ip] of Object.entries(testIPs)) {
    console.log(`🌍 测试 ${region} 地区 (IP: ${ip})`);

    try {
      const result = await architectureService.initializeForUser(ip);
      console.log(`  ✅ 地区: ${result.geo.region}`);
      console.log(`  ✅ 货币: ${result.geo.currency}`);
      console.log(
        `  ✅ 支付方式: ${result.geo.paymentMethods.join(", ") || "无"}`
      );
      console.log(`  ✅ 数据库: ${result.geo.database}`);
      console.log(`  ✅ GDPR合规: ${result.geo.gdprCompliant}`);
    } catch (error) {
      console.log(`  ❌ 错误: ${error.message}`);
    }

    console.log("");
  }

  console.log("✅ 集成测试完成");
}

testIntegration().catch(console.error);
```

运行测试：

```bash
node scripts/test-integration.js
```

## 注意事项

1. **环境变量安全**: 敏感信息（如 API 密钥）不要提交到版本控制
2. **缓存策略**: 地理检测结果有 1 小时缓存，避免频繁 API 调用
3. **错误处理**: 欧洲地区支付被禁用是正常行为（GDPR 合规）
4. **性能优化**: 考虑在 CDN 层面做地理分流，减少服务器压力
5. **合规要求**: 欧洲用户数据必须存储在欧盟境内或获得用户同意

## 常见问题

### Q: 为什么欧洲用户无法支付？

A: 这是 GDPR 合规要求，欧洲地区默认禁用在线支付功能。

### Q: 如何添加新的支付方式？

A: 实现 `PaymentProvider` 接口，然后在支付路由器中注册。

### Q: 如何支持新的地区？

A: 修改 `ip-detection.ts` 中的地区分类逻辑。

### Q: 数据库连接失败怎么办？

A: 检查对应地区的环境变量配置是否正确。

## 技术支持

如果遇到问题，请：

1. 检查控制台错误信息
2. 验证环境变量配置
3. 查看网络连接状态
4. 联系技术支持团队</content>
   <parameter name="filePath">c:\Users\8086K\Downloads\mvp_8-main\lib\architecture-modules\INTEGRATION_GUIDE.md
