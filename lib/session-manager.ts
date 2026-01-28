/**
 * 会话管理器
 * 统一管理 CloudBase 和 Supabase 的会话操作
 * 屏蔽底层数据库差异，提供统一接口
 */

import { isChinaRegion } from "@/lib/config/region";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getGptSessions as getCloudBaseSessions,
  createGptSession as createCloudBaseSession,
  deleteGptSession as deleteCloudBaseSession,
  updateGptSession as updateCloudBaseSession,
} from "@/lib/cloudbase-db";

export interface Session {
  id: string;
  userId: string;
  title: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount?: number;
}

/**
 * Session 管理器 - 统一接口
 */
export class SessionManager {
  /**
   * 创建新会话
   */
  static async createSession(
    userId: string,
    data: { title: string; model: string }
  ): Promise<Session> {
    if (isChinaRegion()) {
      // CloudBase
      const result = await createCloudBaseSession(
        userId,
        data.title,
        data.model
      );
      if (result.error) {
        throw new Error(`Failed to create session: ${String(result.error)}`);
      }
      return this.mapCloudBaseSession(result.data);
    } else {
      // Supabase
      const { data: session, error } = await supabaseAdmin
        .from("gpt_sessions")
        .insert([
          {
            user_id: userId,
            title: data.title,
            model: data.model,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create session: ${error.message}`);
      }

      return this.mapSupabaseSession(session);
    }
  }

  /**
   * 获取单个会话
   */
  static async getSession(
    sessionId: string,
    userId: string
  ): Promise<Session | null> {
    if (isChinaRegion()) {
      // CloudBase
      const result = await getCloudBaseSessions(userId);
      if (result.error) {
        throw new Error(`Failed to get session: ${String(result.error)}`);
      }

      const session = result.data?.find((s: any) => s._id === sessionId);
      if (!session) return null;

      return this.mapCloudBaseSession(session);
    } else {
      // Supabase
      const { data, error } = await supabaseAdmin
        .from("gpt_sessions")
        .select()
        .eq("id", sessionId)
        .eq("user_id", userId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // Not found
          return null;
        }
        throw new Error(`Failed to get session: ${error.message}`);
      }

      return this.mapSupabaseSession(data);
    }
  }

  /**
   * 获取用户的所有会话
   */
  static async getSessions(userId: string): Promise<Session[]> {
    if (isChinaRegion()) {
      // CloudBase
      const result = await getCloudBaseSessions(userId);
      if (result.error) {
        throw new Error(`Failed to get sessions: ${String(result.error)}`);
      }

      return (result.data || []).map((s: any) => this.mapCloudBaseSession(s));
    } else {
      // Supabase
      const { data, error } = await supabaseAdmin
        .from("gpt_sessions")
        .select()
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (error) {
        throw new Error(`Failed to get sessions: ${error.message}`);
      }

      return (data || []).map((s: any) => this.mapSupabaseSession(s));
    }
  }

  /**
   * 更新会话
   */
  static async updateSession(
    sessionId: string,
    userId: string,
    updates: Partial<{ title: string; model: string }>
  ): Promise<Session> {
    if (isChinaRegion()) {
      // CloudBase
      const result = await updateCloudBaseSession(userId, sessionId, updates);
      if (result.error) {
        throw new Error(`Failed to update session: ${String(result.error)}`);
      }
      return this.mapCloudBaseSession(result.data);
    } else {
      // Supabase
      const { data, error } = await supabaseAdmin
        .from("gpt_sessions")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update session: ${error.message}`);
      }

      return this.mapSupabaseSession(data);
    }
  }

  /**
   * 删除会话
   */
  static async deleteSession(sessionId: string, userId: string): Promise<void> {
    if (isChinaRegion()) {
      // CloudBase
      const result = await deleteCloudBaseSession(userId, sessionId);
      if (result.error) {
        throw new Error(`Failed to delete session: ${String(result.error)}`);
      }
    } else {
      // Supabase
      const { error } = await supabaseAdmin
        .from("gpt_sessions")
        .delete()
        .eq("id", sessionId)
        .eq("user_id", userId);

      if (error) {
        throw new Error(`Failed to delete session: ${error.message}`);
      }
    }
  }

  /**
   * 检查用户是否拥有该会话
   */
  static async userOwnsSession(
    sessionId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId, userId);
      return session !== null;
    } catch {
      return false;
    }
  }

  /**
   * CloudBase 会话对象映射到标准格式
   */
  private static mapCloudBaseSession(data: any): Session {
    return {
      id: data._id,
      userId: data.user_id,
      title: data.title,
      model: data.model,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      messageCount: (data.messages || []).length,
    };
  }

  /**
   * Supabase 会话对象映射到标准格式
   */
  private static mapSupabaseSession(data: any): Session {
    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      model: data.model,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }
}
