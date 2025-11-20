/**
 * CloudBase 数据库操作工具类
 * 提供通用的数据库 CRUD 操作封装
 */

import cloudbase from '@cloudbase/node-sdk'
import { CLOUDBASE_COLLECTIONS } from './cloudbase-schema'

interface CloudBaseConfig {
  envId: string
  secretId: string
  secretKey: string
}

/**
 * CloudBase 数据库操作类
 */
export class CloudBaseDB {
  private app: any
  private db: any

  constructor(config: CloudBaseConfig) {
    this.app = cloudbase.init({
      env: config.envId,
      secretId: config.secretId,
      secretKey: config.secretKey,
    })
    this.db = this.app.database()
  }

  /**
   * 添加文档
   */
  async insert(collectionName: string, data: any) {
    try {
      const collection = this.db.collection(collectionName)
      const result = await collection.add(data)
      return { success: true, id: result.id, data: result }
    } catch (error) {
      console.error(`❌ 插入到 ${collectionName} 失败:`, error)
      return { success: false, error }
    }
  }

  /**
   * 获取单个文档（通过 ID）
   */
  async getById(collectionName: string, docId: string) {
    try {
      const collection = this.db.collection(collectionName)
      const result = await collection.doc(docId).get()
      if (result.data && result.data.length > 0) {
        return { success: true, data: result.data[0] }
      }
      return { success: false, error: '文档不存在' }
    } catch (error) {
      console.error(`❌ 获取 ${collectionName} 失败:`, error)
      return { success: false, error }
    }
  }

  /**
   * 查询文档（支持条件查询）
   */
  async query(collectionName: string, where: Record<string, any>, options?: { limit?: number; skip?: number; orderBy?: string; orderDirection?: 'asc' | 'desc' }) {
    try {
      const collection = this.db.collection(collectionName)
      let query = collection.where(where)

      if (options?.orderBy) {
        query = query.orderBy(options.orderBy, options?.orderDirection === 'desc' ? 'desc' : 'asc')
      }

      if (options?.skip) {
        query = query.skip(options.skip)
      }

      if (options?.limit) {
        query = query.limit(options.limit)
      }

      const result = await query.get()
      return {
        success: true,
        data: result.data || [],
        count: (result.data || []).length,
      }
    } catch (error) {
      console.error(`❌ 查询 ${collectionName} 失败:`, error)
      return { success: false, error, data: [] }
    }
  }

  /**
   * 查询单条文档
   */
  async findOne(collectionName: string, where: Record<string, any>) {
    try {
      const result = await this.query(collectionName, where, { limit: 1 })
      if (result.success && result.data.length > 0) {
        return { success: true, data: result.data[0] }
      }
      return { success: false, error: '未找到匹配的文档' }
    } catch (error) {
      console.error(`❌ 查询单条 ${collectionName} 失败:`, error)
      return { success: false, error }
    }
  }

  /**
   * 更新文档
   */
  async update(collectionName: string, docId: string, data: Partial<any>) {
    try {
      const collection = this.db.collection(collectionName)
      const result = await collection.doc(docId).update(data)
      return { success: true, id: docId }
    } catch (error) {
      console.error(`❌ 更新 ${collectionName} 失败:`, error)
      return { success: false, error }
    }
  }

  /**
   * 更新多条文档
   */
  async updateMany(collectionName: string, where: Record<string, any>, data: Partial<any>) {
    try {
      const collection = this.db.collection(collectionName)
      const result = await collection.where(where).update(data)
      return { success: true, result }
    } catch (error) {
      console.error(`❌ 批量更新 ${collectionName} 失败:`, error)
      return { success: false, error }
    }
  }

  /**
   * 删除文档
   */
  async delete(collectionName: string, docId: string) {
    try {
      const collection = this.db.collection(collectionName)
      await collection.doc(docId).remove()
      return { success: true }
    } catch (error) {
      console.error(`❌ 删除 ${collectionName} 失败:`, error)
      return { success: false, error }
    }
  }

  /**
   * 删除多条文档
   */
  async deleteMany(collectionName: string, where: Record<string, any>) {
    try {
      const collection = this.db.collection(collectionName)
      const result = await collection.where(where).remove()
      return { success: true, result }
    } catch (error) {
      console.error(`❌ 批量删除 ${collectionName} 失败:`, error)
      return { success: false, error }
    }
  }

  /**
   * 统计文档数
   */
  async count(collectionName: string, where?: Record<string, any>) {
    try {
      const collection = this.db.collection(collectionName)
      const query = where ? collection.where(where) : collection
      const result = await query.count()
      return { success: true, count: result.total }
    } catch (error) {
      console.error(`❌ 统计 ${collectionName} 失败:`, error)
      return { success: false, error }
    }
  }

  /**
   * 批量插入
   */
  async insertMany(collectionName: string, dataArray: any[]) {
    try {
      const collection = this.db.collection(collectionName)
      const results = []

      for (const data of dataArray) {
        const result = await collection.add(data)
        results.push({ id: result.id, success: true })
      }

      return { success: true, results }
    } catch (error) {
      console.error(`❌ 批量插入 ${collectionName} 失败:`, error)
      return { success: false, error }
    }
  }

  /**
   * 事务操作（简化版）
   */
  async transaction(operations: Array<{ type: 'insert' | 'update' | 'delete'; collection: string; data?: any; id?: string; where?: any }>) {
    try {
      const results = []

      for (const op of operations) {
        let result

        switch (op.type) {
          case 'insert':
            result = await this.insert(op.collection, op.data)
            break
          case 'update':
            if (op.id) {
              result = await this.update(op.collection, op.id, op.data)
            } else {
              result = await this.updateMany(op.collection, op.where, op.data)
            }
            break
          case 'delete':
            if (op.id) {
              result = await this.delete(op.collection, op.id)
            } else {
              result = await this.deleteMany(op.collection, op.where)
            }
            break
        }

        results.push(result)

        // 如果任何操作失败，停止事务
        if (!result.success) {
          return { success: false, error: '事务中某个操作失败', results }
        }
      }

      return { success: true, results }
    } catch (error) {
      console.error('❌ 事务执行失败:', error)
      return { success: false, error }
    }
  }
}

/**
 * 获取全局 CloudBase 数据库实例
 */
let dbInstance: CloudBaseDB | null = null

export function getCloudBaseDB(): CloudBaseDB {
  if (!dbInstance) {
    const envId = process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID
    const secretId = process.env.CLOUDBASE_SECRET_ID
    const secretKey = process.env.CLOUDBASE_SECRET_KEY

    if (!envId || !secretId || !secretKey) {
      throw new Error('Missing CloudBase configuration in environment variables')
    }

    dbInstance = new CloudBaseDB({
      envId,
      secretId,
      secretKey,
    })
  }

  return dbInstance
}

/**
 * 重置数据库实例（主要用于测试）
 */
export function resetCloudBaseDB() {
  dbInstance = null
}
