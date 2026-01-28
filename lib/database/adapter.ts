/**
 * 数据库服务适配器
 *
 * 使用腾讯云 CloudBase 集合数据库（NoSQL）
 * 适配器模式用于支持多个数据库后端，但当前项目仅使用 CloudBase 集合数据库
 */

import { isChinaRegion } from "@/lib/config/region";
import { DataValidators } from "@/lib/models/database";

/**
 * 数据库适配器接口
 */
export interface DatabaseAdapter {
  /**
   * 查询数据
   * @param table 表名/集合名
   * @param filter 过滤条件
   * @returns 查询结果
   */
  query<T>(table: string, filter?: Record<string, any>): Promise<T[]>;

  /**
   * 插入数据
   * @param table 表名/集合名
   * @param data 数据对象
   * @returns 插入的数据（包含 ID）
   */
  insert<T>(table: string, data: T): Promise<T & { id: string }>;

  /**
   * 更新数据
   * @param table 表名/集合名
   * @param id 记录 ID
   * @param data 更新的数据
   * @returns 更新后的数据
   */
  update<T>(table: string, id: string, data: Partial<T>): Promise<T>;

  /**
   * 删除数据
   * @param table 表名/集合名
   * @param id 记录 ID
   */
  delete(table: string, id: string): Promise<void>;

  /**
   * 根据 ID 查询单条数据
   * @param table 表名/集合名
   * @param id 记录 ID
   * @returns 查询结果
   */
  getById<T>(table: string, id: string): Promise<T | null>;
}

/**
 * Supabase 数据库适配器（国际版）
 */
class SupabaseDatabaseAdapter implements DatabaseAdapter {
  private supabase: any;

  constructor() {
    // 动态导入 Supabase 客户端
    import("@/lib/supabase").then(({ supabase }) => {
      this.supabase = supabase;
    });
  }

  async query<T>(table: string, filter?: Record<string, any>): Promise<T[]> {
    if (!this.supabase) {
      throw new Error("Supabase 客户端未初始化");
    }

    let query = this.supabase.from(table).select("*");

    if (filter) {
      Object.entries(filter).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询失败: ${error.message}`);
    }

    return data as T[];
  }

  async insert<T>(table: string, data: T): Promise<T & { id: string }> {
    if (!this.supabase) {
      throw new Error("Supabase 客户端未初始化");
    }

    // 数据验证（如果有对应的验证器）
    if (
      table === "user_profiles" &&
      !DataValidators.validateUserProfile(data as any)
    ) {
      throw new Error("用户资料数据格式无效");
    }
    if (
      table === "chat_sessions" &&
      !DataValidators.validateChatSession(data as any)
    ) {
      throw new Error("聊天会话数据格式无效");
    }
    if (
      table === "chat_messages" &&
      !DataValidators.validateChatMessage(data as any)
    ) {
      throw new Error("聊天消息数据格式无效");
    }
    if (
      table === "payment_records" &&
      !DataValidators.validatePaymentRecord(data as any)
    ) {
      throw new Error("支付记录数据格式无效");
    }

    const { data: result, error } = await this.supabase
      .from(table)
      .insert(data)
      .select()
      .single();

    if (error) {
      throw new Error(`插入失败: ${error.message}`);
    }

    return result as T & { id: string };
  }

  async update<T>(table: string, id: string, data: Partial<T>): Promise<T> {
    if (!this.supabase) {
      throw new Error("Supabase 客户端未初始化");
    }

    const { data: result, error } = await this.supabase
      .from(table)
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw new Error(`更新失败: ${error.message}`);
    }

    return result as T;
  }

  async delete(table: string, id: string): Promise<void> {
    if (!this.supabase) {
      throw new Error("Supabase 客户端未初始化");
    }

    const { error } = await this.supabase.from(table).delete().eq("id", id);

    if (error) {
      throw new Error(`删除失败: ${error.message}`);
    }
  }

  async getById<T>(table: string, id: string): Promise<T | null> {
    if (!this.supabase) {
      return null;
    }

    const { data, error } = await this.supabase
      .from(table)
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // 记录不存在
        return null;
      }
      throw new Error(`查询失败: ${error.message}`);
    }

    return data as T;
  }
}

/**
 * 内存数据库适配器（降级方案）
 * 当 CloudBase 不可用时使用，用于开发和测试
 */
class MemoryDatabaseAdapter implements DatabaseAdapter {
  private data: Map<string, Map<string, any>> = new Map();

  constructor() {
    console.warn("⚠️ 使用内存数据库适配器（降级模式）- 数据不会持久化");
  }

  async query<T>(table: string, filter?: Record<string, any>): Promise<T[]> {
    const tableData = this.data.get(table) || new Map();
    let results = Array.from(tableData.values()) as T[];

    if (filter) {
      results = results.filter((item: any) =>
        Object.entries(filter).every(([key, value]) => item[key] === value)
      );
    }

    return results;
  }

  async insert<T>(table: string, data: T): Promise<T & { id: string }> {
    if (!this.data.has(table)) {
      this.data.set(table, new Map());
    }

    const tableData = this.data.get(table)!;
    const id =
      (data as any).id ||
      `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const item = { ...data, id };

    tableData.set(id, item);
    return item as T & { id: string };
  }

  async update<T>(table: string, id: string, data: Partial<T>): Promise<T> {
    const tableData = this.data.get(table);
    if (!tableData || !tableData.has(id)) {
      throw new Error(`记录不存在: ${table}/${id}`);
    }

    const existing = tableData.get(id);
    const updated = { ...existing, ...data };
    tableData.set(id, updated);

    return updated as T;
  }

  async delete(table: string, id: string): Promise<void> {
    const tableData = this.data.get(table);
    if (tableData) {
      tableData.delete(id);
    }
  }

  async getById<T>(table: string, id: string): Promise<T | null> {
    const tableData = this.data.get(table);
    if (!tableData) {
      return null;
    }

    return (tableData.get(id) as T) || null;
  }
}

/**
 * 创建数据库适配器实例
 *
 * 注意：此函数已弃用。新代码应直接使用 CloudBase SDK 的集合数据库 API
 *
 * 示例：
 * ```typescript
 * import cloudbase from "@cloudbase/node-sdk";
 *
 * const app = cloudbase.init({
 *   env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
 *   secretId: process.env.CLOUDBASE_SECRET_ID,
 *   secretKey: process.env.CLOUDBASE_SECRET_KEY,
 * });
 *
 * const db = app.database();
 * const collection = db.collection("web_users");
 *
 * // Query
 * const result = await collection.where({ name: "test" }).get();
 *
 * // Insert
 * const insertResult = await collection.add({ name: "test" });
 *
 * // Update
 * await collection.doc(id).update({ name: "updated" });
 *
 * // Delete
 * await collection.doc(id).delete();
 * ```
 *
 * @deprecated 使用 CloudBase SDK 的集合数据库 API，见注释中的示例
 */
export function createDatabaseAdapter(): DatabaseAdapter {
  throw new Error(
    "❌ createDatabaseAdapter() 已弃用。请直接使用 CloudBase SDK 的集合数据库 API。" +
    "参考：lib/database/adapter.ts 中的注释或 app/api/auth/wechat/route.ts 中的实现"
  );
}

/**
 * 全局数据库实例（单例模式）
 * @deprecated 使用 CloudBase SDK 的集合数据库 API，不再需要此实例
 */
let dbInstance: DatabaseAdapter | null = null;

/**
 * 获取数据库实例
 * @deprecated 使用 CloudBase SDK 的集合数据库 API，见 createDatabaseAdapter() 中的示例
 */
export function getDatabase(): DatabaseAdapter {
  throw new Error(
    "❌ getDatabase() 已弃用。请直接使用 CloudBase SDK 的集合数据库 API。" +
    "参考：lib/database/adapter.ts 中 createDatabaseAdapter() 的注释或 app/api/auth/wechat/route.ts 中的实现"
  );
}
