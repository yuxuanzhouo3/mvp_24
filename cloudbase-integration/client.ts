/**
 * CloudBase 客户端
 * 用于浏览器端初始化CloudBase SDK
 */

import cloudbase from '@cloudbase/js-sdk'

// 延迟初始化，避免SSR错误
let app: any = null
let db: any = null
let auth: any = null

// 初始化函数（仅在浏览器端初始化）
function initCloudBase() {
  if (app) return { app, db, auth } // 已初始化

  // 只在浏览器端初始化，避免SSR时window undefined错误
  if (typeof window === 'undefined') {
    return { app: null, db: null, auth: null }
  }

  try {
    const envId = process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID || 'cloudbase-1gnip2iaa08260e5'

    app = cloudbase.init({
      env: envId
    })

    db = app.database()
    auth = app.auth()

    console.log('✅ [CloudBase] 初始化成功:', envId)
  } catch (error) {
    console.error('❌ [CloudBase] 初始化失败:', error)
  }

  return { app, db, auth }
}

// 浏览器端立即初始化
if (typeof window !== 'undefined') {
  initCloudBase()
}

// 导出实例
export { db, auth }
export default app

// 辅助函数：获取集合引用
export function getCollection(collectionName: string) {
  if (!db) {
    initCloudBase()
  }
  return db?.collection(collectionName)
}

// 官网专用集合名称（带web_前缀）
export const COLLECTIONS = {
  USERS: 'web_users',
  FAVORITES: 'web_favorites',
  CUSTOM_SITES: 'web_custom_sites',
  SUBSCRIPTIONS: 'web_subscriptions',
  PAYMENT_TRANSACTIONS: 'web_payment_transactions'
}