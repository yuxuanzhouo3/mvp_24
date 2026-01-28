# 数据库层重构迁移指南

## 概述

架构模块的数据库层已从 `DatabaseAdapter` 重构为 `DatabaseConnector`，以实现更好的关注点分离。新的设计将基础设施（连接管理）与业务逻辑（数据操作）分离，为不同应用提供更大的灵活性。

## 主要变化

### 1. 接口变更

**旧接口 (DatabaseAdapter):**

```typescript
interface DatabaseAdapter {
  initialize(config: DatabaseConfig): Promise<void>;
  getFavorites(userId: string): Promise<Favorite[]>;
  addFavorite(userId: string, siteId: string): Promise<void>;
  // ... 其他业务方法
}
```

**新接口 (DatabaseConnector):**

```typescript
interface DatabaseConnector {
  initialize(): Promise<void>;
  getClient(): SupabaseClient | CloudBase;
  testConnection(): Promise<boolean>;
  close(): Promise<void>;
}
```

### 2. 职责分离

- **DatabaseConnector**: 仅负责数据库连接管理
- **应用层**: 负责实现具体的数据访问逻辑

### 3. 创建方式变更

**旧方式:**

```typescript
const adapter = createDatabaseAdapter("supabase", config);
await adapter.initialize(config);
const favorites = await adapter.getFavorites(userId);
```

**新方式:**

```typescript
const connector = createDatabaseConnector("supabase", config);
await connector.initialize();
const client = connector.getClient();
// 在应用中实现数据访问:
// const favorites = await client.from('favorites').select('*').eq('user_id', userId);
```

## 迁移步骤

### 步骤 1: 更新导入

```typescript
// 旧代码
import { createDatabaseAdapter, DatabaseAdapter } from "./architecture-modules";

// 新代码
import {
  createDatabaseConnector,
  DatabaseConnector,
} from "./architecture-modules";
```

### 步骤 2: 更新类型定义

```typescript
// 旧代码
private databaseAdapter: DatabaseAdapter | null = null;

// 新代码
private databaseConnector: DatabaseConnector | null = null;
```

### 步骤 3: 更新初始化逻辑

```typescript
// 旧代码
this.databaseAdapter = createDatabaseAdapter(geo.database, {
  type: geo.database,
  connectionString: config.SUPABASE_URL,
  envId: config.WECHAT_CLOUDBASE_ID,
});
await this.databaseAdapter.initialize({
  type: geo.database,
  connectionString: config.SUPABASE_URL,
  envId: config.WECHAT_CLOUDBASE_ID,
});

// 新代码
this.databaseConnector = createDatabaseConnector(geo.database, {
  type: geo.database,
  connectionString: config.SUPABASE_URL,
  envId: config.WECHAT_CLOUDBASE_ID,
});
await this.databaseConnector.initialize();
```

### 步骤 4: 创建应用层数据访问类

为每个应用创建专门的数据访问层：

```typescript
// lib/data-access/user-data-access.ts
import { SupabaseClient } from "@supabase/supabase-js";
import { CloudBase } from "@cloudbase/node-sdk";

export class UserDataAccess {
  constructor(private client: SupabaseClient | CloudBase) {}

  async getFavorites(userId: string) {
    if (this.client instanceof SupabaseClient) {
      const { data, error } = await this.client
        .from("favorites")
        .select("*")
        .eq("user_id", userId);
      if (error) throw error;
      return data;
    } else {
      // CloudBase 实现
      const db = this.client.database();
      return await db.collection("favorites").where({ user_id: userId }).get();
    }
  }

  async addFavorite(userId: string, siteId: string) {
    if (this.client instanceof SupabaseClient) {
      const { error } = await this.client
        .from("favorites")
        .insert({ user_id: userId, site_id: siteId });
      if (error) throw error;
    } else {
      // CloudBase 实现
      const db = this.client.database();
      await db
        .collection("favorites")
        .add({ user_id: userId, site_id: siteId });
    }
  }
}
```

### 步骤 5: 更新业务逻辑

```typescript
// 旧代码
const favorites = await this.databaseAdapter.getFavorites(userId);

// 新代码
const client = this.databaseConnector.getClient();
const dataAccess = new UserDataAccess(client);
const favorites = await dataAccess.getFavorites(userId);
```

## 完整迁移示例

### 旧的架构服务类

```typescript
export class ArchitectureService {
  private databaseAdapter: DatabaseAdapter | null = null;

  async initializeForUser(userIP: string) {
    const geo = await geoRouter.detect(userIP);
    const envLoader = await createEnvironmentLoader(userIP);
    const config = envLoader.load();

    this.databaseAdapter = createDatabaseAdapter(geo.database, {
      type: geo.database,
      connectionString: config.SUPABASE_URL,
      envId: config.WECHAT_CLOUDBASE_ID,
    });

    await this.databaseAdapter.initialize({
      type: geo.database,
      connectionString: config.SUPABASE_URL,
      envId: config.WECHAT_CLOUDBASE_ID,
    });

    return { geo, config, dbAdapter: this.databaseAdapter };
  }

  async getUserFavorites(userId: string) {
    return await this.databaseAdapter!.getFavorites(userId);
  }
}
```

### 新的架构服务类

```typescript
export class ArchitectureService {
  private databaseConnector: DatabaseConnector | null = null;

  async initializeForUser(userIP: string) {
    const geo = await geoRouter.detect(userIP);
    const envLoader = await createEnvironmentLoader(userIP);
    const config = envLoader.load();

    this.databaseConnector = createDatabaseConnector(geo.database, {
      type: geo.database,
      connectionString: config.SUPABASE_URL,
      envId: config.WECHAT_CLOUDBASE_ID,
    });

    await this.databaseConnector.initialize();

    return { geo, config, dbConnector: this.databaseConnector };
  }

  async getUserFavorites(userId: string) {
    const client = this.databaseConnector!.getClient();
    const dataAccess = new UserDataAccess(client);
    return await dataAccess.getFavorites(userId);
  }
}
```

## 优势

1. **灵活性**: 每个应用可以定义自己的数据模型和业务逻辑
2. **可维护性**: 基础设施与业务逻辑分离，更易维护
3. **可扩展性**: 更容易添加新的数据库类型或修改现有逻辑
4. **类型安全**: 更好的类型检查和 IDE 支持

## 注意事项

1. **向后兼容**: 新接口不向后兼容旧代码，需要手动迁移
2. **测试更新**: 需要更新所有使用数据库适配器的测试
3. **文档更新**: 更新 API 文档和集成指南
4. **培训**: 团队成员需要了解新的架构模式

## 常见问题

### Q: 为什么需要这个重构？

A: 原来的设计将基础设施和业务逻辑耦合在一起，导致不同应用无法灵活定义自己的数据操作。这个重构实现了关注点分离，使架构模块更通用。

### Q: 我需要为每个应用创建数据访问层吗？

A: 是的，每个应用应该有自己的数据访问层来处理特定的业务逻辑和数据模型。

### Q: 如何处理数据库模式差异？

A: 每个应用的数据访问层负责处理特定数据库的模式差异。架构模块只提供连接，不假设任何模式。

### Q: 测试需要如何更新？

A: 测试需要使用新的 DatabaseConnector 接口，并为应用层数据访问类编写单独的测试。</content>
<parameter name="filePath">c:\Users\8086K\Downloads\mvp_8-main\lib\architecture-modules\MIGRATION_GUIDE.md
