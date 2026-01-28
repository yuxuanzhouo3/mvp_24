# 快速开始指南

## 在新项目中使用架构模块

### 1. 复制模块到你的项目

```bash
# Windows用户
./scripts/copy-to-project.bat C:\path\to\your\new\project

# Linux/Mac用户
./scripts/copy-to-project.sh /path/to/your/new/project
```

### 2. 使用模板快速开始

复制模板文件到你的项目：

```bash
# 复制架构服务
cp lib/architecture-modules/templates/architecture-service.ts lib/architecture-service.ts

# 复制数据访问层
cp lib/architecture-modules/templates/user-repository.ts lib/data-access/user-repository.ts

# 复制API路由
cp lib/architecture-modules/templates/favorites-api.ts app/api/user/favorites/route.ts
```

### 3. 配置环境变量

创建 `.env.local` 文件（复制自 `.env.example`）并填入实际配置。

**重要**: 以下环境变量是必需的，每个项目必须配置不同的值：

```env
# 应用URL（必需）
# - 生产环境：设置你的实际域名，如 https://yourapp.com
# - Vercel部署：会自动使用 VERCEL_URL，无需手动设置
# - 开发环境：默认使用 http://localhost:3000
APP_URL=https://yourapp.com

# 应用名称（必需）
APP_NAME=YourAppName
```

**根据你的部署地区配置数据库**:

**中国用户**:

```env
NEXT_PUBLIC_WECHAT_CLOUDBASE_ID=your_cloudbase_env_id
```

**海外用户**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. 创建架构服务

创建 `lib/architecture-service.ts`：

```typescript
import { createDatabaseConnector, geoRouter } from "./architecture-modules";

export class ArchitectureService {
  private static instance: ArchitectureService;
  private connector: any = null;

  static getInstance() {
    if (!ArchitectureService.instance) {
      ArchitectureService.instance = new ArchitectureService();
    }
    return ArchitectureService.instance;
  }

  async initializeForUser(userIP: string) {
    // 1. 检测地理位置
    const geo = await geoRouter.detectRegion(userIP);

    // 2. 创建数据库连接器
    this.connector = createDatabaseConnector(geo.database, {
      type: geo.database,
      // 根据数据库类型配置连接参数
      connectionString: process.env.NEXT_PUBLIC_SUPABASE_URL,
      envId: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
    });

    // 3. 初始化连接
    await this.connector.initialize();

    return { geo, connector: this.connector };
  }

  getConnector() {
    return this.connector;
  }
}

export const architectureService = ArchitectureService.getInstance();
```

### 4. 创建数据访问层

创建 `lib/data-access/user-repository.ts`：

```typescript
export class UserRepository {
  constructor(private client: any) {}

  async getUserFavorites(userId: string) {
    // 使用连接器获取的客户端
    if (this.client.from) {
      // Supabase
      const { data } = await this.client
        .from("favorites")
        .select("*")
        .eq("user_id", userId);
      return data;
    } else {
      // CloudBase
      const db = this.client.database();
      return await db.collection("favorites").where({ user_id: userId }).get();
    }
  }

  async addFavorite(userId: string, siteId: string) {
    if (this.client.from) {
      // Supabase
      await this.client.from("favorites").insert({
        user_id: userId,
        site_id: siteId,
      });
    } else {
      // CloudBase
      const db = this.client.database();
      await db.collection("favorites").add({
        user_id: userId,
        site_id: siteId,
      });
    }
  }
}
```

### 5. 在 API 中使用

创建 `app/api/user/favorites/route.ts`：

```typescript
import { NextRequest } from "next/server";
import { architectureService } from "../../../../lib/architecture-service";
import { UserRepository } from "../../../../lib/data-access/user-repository";

export async function GET(request: NextRequest) {
  try {
    // 获取用户IP
    const clientIP = request.headers.get("x-forwarded-for") || "127.0.0.1";

    // 初始化架构服务
    const { geo, connector } = await architectureService.initializeForUser(
      clientIP
    );

    // 获取用户ID
    const userId = request.nextUrl.searchParams.get("userId");
    if (!userId) {
      return Response.json({ error: "Missing userId" }, { status: 400 });
    }

    // 使用数据访问层
    const client = connector.getClient();
    const repository = new UserRepository(client);
    const favorites = await repository.getUserFavorites(userId);

    return Response.json({
      success: true,
      data: favorites,
      region: geo.region,
    });
  } catch (error) {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
```

### 6. 在 React 组件中使用

创建 `hooks/use-architecture.ts`：

```typescript
import { useState, useEffect } from "react";
import { architectureService } from "../lib/architecture-service";

export function useArchitecture(userIP?: string) {
  const [geo, setGeo] = useState(null);
  const [connector, setConnector] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const ip = userIP || "127.0.0.1"; // 从API获取真实IP
      const result = await architectureService.initializeForUser(ip);
      setGeo(result.geo);
      setConnector(result.connector);
      setLoading(false);
    };
    init();
  }, [userIP]);

  return { geo, connector, loading };
}
```

### 7. 在组件中使用

```typescript
import { useArchitecture } from "../hooks/use-architecture";
import { UserRepository } from "../lib/data-access/user-repository";

export function UserFavorites({ userId }: { userId: string }) {
  const { connector, geo, loading } = useArchitecture();

  if (loading) return <div>Loading...</div>;

  const client = connector?.getClient();
  const repository = new UserRepository(client);

  // 使用repository获取数据
  // const favorites = await repository.getUserFavorites(userId);

  return (
    <div>
      <p>Region: {geo?.region}</p>
      {/* 渲染收藏列表 */}
    </div>
  );
}
```

## 核心概念

1. **连接器 (Connector)**: 只负责数据库连接，不包含业务逻辑
2. **数据访问层 (Repository)**: 你的应用负责实现具体的数据操作
3. **架构服务 (Service)**: 统一管理地理检测和连接器初始化
4. **地理路由**: 根据 IP 自动选择合适的数据库和支付方式

## 优势

- ✅ **自动地理分流**: 根据用户 IP 选择最佳的数据库和支付方式
- ✅ **灵活的数据模型**: 每个应用可以定义自己的数据结构
- ✅ **GDPR 合规**: 欧洲用户自动禁用支付功能
- ✅ **高可用**: 自动故障转移和错误恢复

## 常见问题

**Q: 如何添加新的数据库类型？**
A: 实现 `DatabaseConnector` 接口并在工厂函数中注册。

**Q: 如何处理数据库模式差异？**
A: 在你的数据访问层中处理不同数据库的差异。

**Q: 如何测试？**
A: 查看 `lib/architecture-modules/__tests__/` 中的测试示例。

更多详细信息请查看 `INTEGRATION_GUIDE.md` 和 `MIGRATION_GUIDE.md`。</content>
<parameter name="filePath">c:\Users\8086K\Downloads\mvp_8-main\lib\architecture-modules\QUICK_START.md
