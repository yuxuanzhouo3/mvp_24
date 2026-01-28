// lib/architecture-modules/layers/data-storage/cloudbase-connector.ts - 腾讯云数据库连接器
import { DatabaseConnector } from "./adapter";
import { DatabaseConfig } from "../../core/types";

// 腾讯云SDK需要动态导入以支持跨平台
let tcb: any = null;

export class CloudBaseConnector implements DatabaseConnector {
  private db: any;

  async initialize(config: DatabaseConfig): Promise<void> {
    if (!config.envId) {
      throw new Error("CloudBase environment ID is required");
    }

    // 动态导入腾讯云SDK
    if (!tcb) {
      tcb = await import("@cloudbase/js-sdk");
    }

    const app = tcb.init({
      env: config.envId,
    });

    this.db = app.database();
  }

  getClient(): any {
    if (!this.db) {
      throw new Error(
        "CloudBase database not initialized. Call initialize() first."
      );
    }
    return this.db;
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.db) {
        return false;
      }

      // 尝试一个简单的查询来测试连接
      const result = await this.db.collection("china_favorites").limit(1).get();
      return true;
    } catch (error) {
      console.error("CloudBase connection test failed:", error);
      return false;
    }
  }

  async close(): Promise<void> {
    // CloudBase SDK 不需要显式关闭
    this.db = null;
  }
}
