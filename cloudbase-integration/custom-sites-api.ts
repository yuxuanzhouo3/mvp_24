/**
 * 国内用户自定义网站API
 * 使用腾讯云 CloudBase 数据库
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import cloudbase from '@cloudbase/node-sdk'
import jwt from 'jsonwebtoken'

function verifyToken(token: string): any {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-for-development-only')
  } catch (error) {
    console.error('❌ [Custom-Sites-CN] Token验证失败:', error)
    return null
  }
}

export async function customSitesCnHandler(req: NextApiRequest, res: NextApiResponse) {
  // 验证JWT Token
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '未授权' })
  }

  const token = authHeader.substring(7)
  const decoded = verifyToken(token)

  console.log('🔍 [Custom-Sites-CN] Token decoded:', decoded)

  if (!decoded?.userId) {
    console.error('❌ [Custom-Sites-CN] Token无效或缺少userId')
    return res.status(401).json({ success: false, message: 'Token无效' })
  }

  const userId = decoded.userId
  console.log('✅ [Custom-Sites-CN] Using userId from token:', userId)

  // 初始化 CloudBase
  const app = cloudbase.init({
    env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID!,
    secretId: process.env.CLOUDBASE_SECRET_ID!,
    secretKey: process.env.CLOUDBASE_SECRET_KEY!
  })

  const db = app.database()
  const collection = db.collection('web_custom_sites')

  try {
    // GET: 获取自定义网站列表
    if (req.method === 'GET') {
      console.log('📖 [Custom-Sites-CN GET] Querying custom sites for userId:', userId)
      const result = await collection
        .where({ user_id: userId })
        .orderBy('created_at', 'desc')
        .get()

      console.log(`✅ [Custom-Sites-CN GET] Found ${result.data?.length || 0} custom sites`)
      console.log('📊 [Custom-Sites-CN GET] Data:', JSON.stringify(result.data, null, 2))

      return res.status(200).json({
        success: true,
        sites: result.data || []
      })
    }

    // POST: 添加自定义网站
    if (req.method === 'POST') {
      const { name, url, logo, category, description } = req.body

      if (!name || !url) {
        return res.status(400).json({ success: false, message: '缺少name或url' })
      }

      console.log('➕ [Custom-Sites-CN POST] Adding custom site:', { userId, name, url })

      const addResult = await collection.add({
        user_id: userId,
        name,
        url,
        logo: logo || '',
        category: category || 'custom',
        description: description || '',
        created_at: new Date(),
        updated_at: new Date()
      })

      console.log('✅ [Custom-Sites-CN POST] Custom site added successfully:', addResult)

      return res.status(200).json({
        success: true,
        site: {
          id: addResult.id,
          user_id: userId,
          name,
          url,
          logo,
          category,
          description
        }
      })
    }

    // DELETE: 删除自定义网站
    if (req.method === 'DELETE') {
      const { siteId } = req.body

      if (!siteId) {
        return res.status(400).json({ success: false, message: '缺少siteId' })
      }

      console.log('🗑️ [Custom-Sites-CN DELETE] Deleting custom site:', { userId, siteId })

      // 先验证这个网站是否属于当前用户
      const checkResult = await collection
        .where({
          _id: siteId,
          user_id: userId
        })
        .get()

      if (!checkResult.data || checkResult.data.length === 0) {
        return res.status(404).json({ success: false, message: '网站不存在或无权删除' })
      }

      await collection.doc(siteId).remove()

      console.log('✅ [Custom-Sites-CN DELETE] Custom site deleted successfully')

      return res.status(200).json({ success: true })
    }

    // 不支持的方法
    return res.status(405).json({ success: false, message: '方法不支持' })

  } catch (error: any) {
    console.error('❌ [Custom-Sites-CN] Error:', error)
    return res.status(500).json({
      success: false,
      message: error.message || '服务器错误'
    })
  }
}