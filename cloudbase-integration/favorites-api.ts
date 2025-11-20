/**
 * 国内用户收藏API
 * 使用腾讯云 CloudBase 数据库
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import cloudbase from '@cloudbase/node-sdk'
import jwt from 'jsonwebtoken'

function verifyToken(token: string): any {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-for-development-only')
  } catch (error) {
    console.error('❌ [Favorites-CN] Token验证失败:', error)
    return null
  }
}

export async function favoritesCnHandler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: '未授权' })
    }

    const token = authHeader.substring(7)
    const decoded = verifyToken(token)

    console.log('🔍 [Favorites-CN] Token decoded:', decoded)

    if (!decoded?.userId) {
      console.error('❌ [Favorites-CN] Token无效或缺少userId')
      return res.status(401).json({ success: false, message: 'Token无效' })
    }

    const userId = decoded.userId
    console.log('✅ [Favorites-CN] Using userId from token:', userId)

    // 初始化 CloudBase
    const app = cloudbase.init({
      env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID!,
      secretId: process.env.CLOUDBASE_SECRET_ID!,
      secretKey: process.env.CLOUDBASE_SECRET_KEY!
    })

    const db = app.database()
    const collection = db.collection('web_favorites')

    // GET: 获取收藏列表
    if (req.method === 'GET') {
      console.log('📖 [Favorites-CN GET] Querying favorites for userId:', userId)
      const result = await collection.where({ user_id: userId }).get()
      console.log(`✅ [Favorites-CN GET] Found ${result.data?.length || 0} favorites`)
      console.log('📊 [Favorites-CN GET] Data:', JSON.stringify(result.data, null, 2))
      return res.status(200).json({
        success: true,
        favorites: result.data.map((f: any) => f.site_id)
      })
    }

    // POST: 添加收藏
    if (req.method === 'POST') {
      const { siteId } = req.body
      if (!siteId) {
        return res.status(400).json({ success: false, message: '缺少siteId' })
      }

      console.log('➕ [Favorites-CN POST] Adding favorite:', { userId, siteId })
      const addResult = await collection.add({
        user_id: userId,
        site_id: siteId,
        created_at: new Date()
      })
      console.log('✅ [Favorites-CN POST] Favorite added successfully:', addResult)

      return res.status(200).json({ success: true })
    }

    // DELETE: 删除收藏
    if (req.method === 'DELETE') {
      const { siteId } = req.body
      if (!siteId) {
        return res.status(400).json({ success: false, message: '缺少siteId' })
      }

      await collection.where({ user_id: userId, site_id: siteId }).remove()
      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' })
  } catch (error: any) {
    console.error('API错误:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}