// lib/data-access/user-repository.ts - 用户数据访问层
// 这个文件展示了如何在你的应用中实现数据访问逻辑

export class UserRepository {
  constructor(private client: any) {}

  // 获取用户收藏
  async getUserFavorites(userId: string) {
    try {
      if (this.client.from) {
        // Supabase 实现
        const { data, error } = await this.client
          .from("user_favorites")
          .select(
            `
            id,
            site_id,
            created_at,
            sites (
              id,
              name,
              url,
              category
            )
          `
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        return data;
      } else {
        // CloudBase 实现
        const db = this.client.database();
        const result = await db
          .collection("user_favorites")
          .where({ user_id: userId })
          .orderBy("created_at", "desc")
          .get();

        // 如果需要关联查询，需要额外处理
        return result.data;
      }
    } catch (error) {
      console.error("获取用户收藏失败:", error);
      throw new Error("获取收藏数据失败");
    }
  }

  // 添加收藏
  async addFavorite(userId: string, siteId: string) {
    try {
      if (this.client.from) {
        // Supabase 实现
        const { error } = await this.client.from("user_favorites").insert({
          user_id: userId,
          site_id: siteId,
          created_at: new Date().toISOString(),
        });

        if (error) throw error;
      } else {
        // CloudBase 实现
        const db = this.client.database();
        await db.collection("user_favorites").add({
          user_id: userId,
          site_id: siteId,
          created_at: new Date(),
        });
      }
    } catch (error) {
      console.error("添加收藏失败:", error);
      throw new Error("添加收藏失败");
    }
  }

  // 删除收藏
  async removeFavorite(userId: string, siteId: string) {
    try {
      if (this.client.from) {
        // Supabase 实现
        const { error } = await this.client
          .from("user_favorites")
          .delete()
          .eq("user_id", userId)
          .eq("site_id", siteId);

        if (error) throw error;
      } else {
        // CloudBase 实现
        const db = this.client.database();
        await db
          .collection("user_favorites")
          .where({ user_id: userId, site_id: siteId })
          .remove();
      }
    } catch (error) {
      console.error("删除收藏失败:", error);
      throw new Error("删除收藏失败");
    }
  }

  // 获取用户订阅信息
  async getUserSubscription(userId: string) {
    try {
      if (this.client.from) {
        // Supabase 实现
        const { data, error } = await this.client
          .from("user_subscriptions")
          .select("*")
          .eq("user_id", userId)
          .eq("status", "active")
          .single();

        if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
        return data;
      } else {
        // CloudBase 实现
        const db = this.client.database();
        const result = await db
          .collection("user_subscriptions")
          .where({ user_id: userId, status: "active" })
          .get();

        return result.data[0] || null;
      }
    } catch (error) {
      console.error("获取用户订阅失败:", error);
      throw new Error("获取订阅信息失败");
    }
  }
}

// 使用示例：
// import { architectureService } from '../architecture-service';
// import { UserRepository } from './user-repository';
//
// const { connector } = await architectureService.initializeForUser(userIP);
// const client = connector.getClient();
// const userRepo = new UserRepository(client);
// const favorites = await userRepo.getUserFavorites(userId);
