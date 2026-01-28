/**
 * CloudBase 适配器和数据库适配器工厂
 * 提供统一的数据库操作接口
 */

import { db, COLLECTIONS, getCollection } from './client'

/**
 * CloudBase适配器类
 */
export class CloudBaseAdapter {
  private userId: string
  private db: any

  constructor(userId: string) {
    this.userId = userId
    // 确保db已初始化
    this.db = db
  }

  // 辅助方法：安全获取db实例
  private getDb() {
    if (!this.db && typeof window !== 'undefined') {
      // 重新尝试获取db
      const { db: freshDb } = require('./client')
      this.db = freshDb
    }
    return this.db
  }

  // ==========================================
  // 收藏功能
  // ==========================================

  async getFavorites(): Promise<string[]> {
    try {
      const database = this.getDb()
      if (!database) {
        console.warn('⚠️ [DB-腾讯云] 数据库未初始化')
        return []
      }

      const res = await database.collection(COLLECTIONS.FAVORITES)
        .where({ user_id: this.userId })
        .get()

      console.log('✅ [DB-腾讯云] 获取收藏:', res.data.length)
      return res.data.map((f: any) => f.site_id)
    } catch (error) {
      console.error('❌ [DB-腾讯云] 获取收藏失败:', error)
      return []
    }
  }

  async addFavorite(siteId: string): Promise<boolean> {
    try {
      const database = this.getDb()
      if (!database) {
        console.warn('⚠️ [DB-腾讯云] 数据库未初始化')
        return false
      }

      await database.collection(COLLECTIONS.FAVORITES).add({
        user_id: this.userId,
        site_id: siteId,
        created_at: new Date()
      })

      console.log('✅ [DB-腾讯云] 添加收藏成功:', siteId)
      return true
    } catch (error) {
      console.error('❌ [DB-腾讯云] 添加收藏失败:', error)
      return false
    }
  }

  async removeFavorite(siteId: string): Promise<boolean> {
    try {
      const database = this.getDb()
      if (!database) {
        console.warn('⚠️ [DB-腾讯云] 数据库未初始化')
        return false
      }

      await database.collection(COLLECTIONS.FAVORITES)
        .where({
          user_id: this.userId,
          site_id: siteId
        })
        .remove()

      console.log('✅ [DB-腾讯云] 删除收藏成功:', siteId)
      return true
    } catch (error) {
      console.error('❌ [DB-腾讯云] 删除收藏失败:', error)
      return false
    }
  }

  // ==========================================
  // 自定义网站功能
  // ==========================================

  async getCustomSites(): Promise<any[]> {
    try {
      const database = this.getDb()
      if (!database) {
        console.warn('⚠️ [DB-腾讯云] 数据库未初始化')
        return []
      }

      const res = await database.collection(COLLECTIONS.CUSTOM_SITES)
        .where({ user_id: this.userId })
        .orderBy('created_at', 'desc')
        .get()

      console.log('✅ [DB-腾讯云] 获取自定义网站:', res.data.length)
      return res.data
    } catch (error) {
      console.error('❌ [DB-腾讯云] 获取自定义网站失败:', error)
      return []
    }
  }

  async addCustomSite(site: any): Promise<boolean> {
    try {
      const database = this.getDb()
      if (!database) {
        console.warn('⚠️ [DB-腾讯云] 数据库未初始化')
        return false
      }

      await database.collection(COLLECTIONS.CUSTOM_SITES).add({
        user_id: this.userId,
        name: site.name,
        url: site.url,
        logo: site.logo,
        category: site.category,
        description: site.description || '',
        created_at: new Date(),
        updated_at: new Date()
      })

      console.log('✅ [DB-腾讯云] 添加自定义网站成功')
      return true
    } catch (error) {
      console.error('❌ [DB-腾讯云] 添加自定义网站失败:', error)
      return false
    }
  }

  async removeCustomSite(siteId: string): Promise<boolean> {
    try {
      const database = this.getDb()
      if (!database) {
        console.warn('⚠️ [DB-腾讯云] 数据库未初始化')
        return false
      }

      await database.collection(COLLECTIONS.CUSTOM_SITES)
        .doc(siteId)
        .remove()

      console.log('✅ [DB-腾讯云] 删除自定义网站成功')
      return true
    } catch (error) {
      console.error('❌ [DB-腾讯云] 删除自定义网站失败:', error)
      return false
    }
  }

  // ==========================================
  // 订阅功能
  // ==========================================

  async getSubscription(): Promise<any | null> {
    try {
      const database = this.getDb()
      if (!database) {
        console.warn('⚠️ [DB-腾讯云] 数据库未初始化')
        return null
      }

      const res = await database.collection(COLLECTIONS.SUBSCRIPTIONS)
        .where({ user_id: this.userId })
        .orderBy('created_at', 'desc')
        .limit(1)
        .get()

      const subscription = res.data[0] || null
      console.log('✅ [DB-腾讯云] 获取订阅状态:', subscription ? '有订阅' : '无订阅')
      return subscription
    } catch (error) {
      console.error('❌ [DB-腾讯云] 获取订阅失败:', error)
      return null
    }
  }

  async upsertSubscription(subscription: any): Promise<boolean> {
    try {
      const database = this.getDb()
      if (!database) {
        console.warn('⚠️ [DB-腾讯云] 数据库未初始化')
        return false
      }

      // 先查询是否存在
      const existing = await this.getSubscription()

      if (existing && existing._id) {
        // 更新现有订阅
        await database.collection(COLLECTIONS.SUBSCRIPTIONS)
          .doc(existing._id)
          .update({
            ...subscription,
            updated_at: new Date()
          })
      } else {
        // 创建新订阅
        await database.collection(COLLECTIONS.SUBSCRIPTIONS).add({
          user_id: this.userId,
          ...subscription,
          created_at: new Date(),
          updated_at: new Date()
        })
      }

      console.log('✅ [DB-腾讯云] 更新订阅成功')
      return true
    } catch (error) {
      console.error('❌ [DB-腾讯云] 更新订阅失败:', error)
      return false
    }
  }
}

/**
 * 数据库适配器接口
 */
export interface IDatabaseAdapter {
  // 收藏功能
  getFavorites(): Promise<string[]>
  addFavorite(siteId: string): Promise<boolean>
  removeFavorite(siteId: string): Promise<boolean>

  // 自定义网站功能
  getCustomSites(): Promise<any[]>
  addCustomSite(site: any): Promise<boolean>
  removeCustomSite(siteId: string): Promise<boolean>

  // 订阅功能
  getSubscription(): Promise<any | null>
  upsertSubscription(subscription: any): Promise<boolean>
}

/**
 * 创建数据库适配器工厂函数
 *
 * @param isChina - 是否国内IP用户
 * @param userId - 用户ID
 * @returns 数据库适配器实例
 */
export async function createDatabaseAdapter(
  isChina: boolean,
  userId: string
): Promise<IDatabaseAdapter> {
  if (isChina) {
    console.log('🇨🇳 [DB] 使用腾讯云数据库（国内IP）')
    return new CloudBaseAdapter(userId)
  } else {
    console.log('🌍 [DB] 使用Supabase数据库（海外IP）')
    // 这里应该动态导入Supabase适配器，但为了演示我们直接返回null
    // const { SupabaseAdapter } = await import('./supabase-adapter')
    // return new SupabaseAdapter(userId)
    throw new Error('Supabase适配器暂未实现，请使用CloudBase')
  }
}

/**
 * 获取数据库名称（用于日志）
 */
export function getDatabaseName(isChina: boolean): string {
  return isChina ? '腾讯云CloudBase' : 'Supabase'
}

/**
 * 获取用户所在数据库的类型
 */
export function getDatabaseType(isChina: boolean): 'cloudbase' | 'supabase' {
  return isChina ? 'cloudbase' : 'supabase'
}