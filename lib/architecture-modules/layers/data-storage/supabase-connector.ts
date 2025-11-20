// lib/architecture-modules/layers/data-storage/supabase-connector.ts - Supabase数据库连接器
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { DatabaseConnector } from "./adapter";
import { DatabaseConfig } from "../../core/types";

export class SupabaseConnector implements DatabaseConnector {
  private supabase: any;

  async initialize(config: DatabaseConfig): Promise<void> {
    if (!config.connectionString) {
      throw new Error("Supabase URL is required");
    }

    // 从环境变量获取密钥（实际使用时会从config传入）
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || config.connectionString;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase configuration missing");
    }

    this.supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);
  }

  getClient(): any {
    if (!this.supabase) {
      throw new Error(
        "Supabase client not initialized. Call initialize() first."
      );
    }
    return this.supabase;
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.supabase) {
        return false;
      }

      // 尝试一个简单的查询来测试连接
      const { error } = await this.supabase
        .from("user_favorites")
        .select("count")
        .limit(1);
      return !error;
    } catch (error) {
      console.error("Supabase connection test failed:", error);
      return false;
    }
  }

  async close(): Promise<void> {
    // Supabase client doesn't need explicit closing
    this.supabase = null;
  }
}
