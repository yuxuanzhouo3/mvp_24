// lib/architecture-modules/layers/data-storage/adapter.ts - 数据库连接适配器接口
import { DatabaseConfig } from "../../core/types";

/**
 * 数据库连接适配器接口
 * 只负责数据库连接的创建和管理，不负责具体的数据操作
 * 每个应用可以基于这个连接实现自己的数据访问层
 */
export interface DatabaseConnector {
  /**
   * 初始化数据库连接
   */
  initialize(config: DatabaseConfig): Promise<void>;

  /**
   * 获取数据库客户端实例
   * Supabase返回 supabase client
   * CloudBase返回 db 实例
   */
  getClient(): any;

  /**
   * 测试连接是否正常
   */
  testConnection(): Promise<boolean>;

  /**
   * 关闭连接
   */
  close(): Promise<void>;
}

/**
 * 创建数据库连接器工厂函数
 */
export function createDatabaseConnector(
  type: "supabase" | "cloudbase",
  config: DatabaseConfig
): DatabaseConnector {
  switch (type) {
    case "supabase":
      const { SupabaseConnector } = require("./supabase-connector");
      return new SupabaseConnector(config);
    case "cloudbase":
      const { CloudBaseConnector } = require("./cloudbase-connector");
      return new CloudBaseConnector(config);
    default:
      throw new Error(`Unsupported database type: ${type}`);
  }
}
