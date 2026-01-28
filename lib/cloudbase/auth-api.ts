/**
 * 国内用户认证API
 * 使用腾讯云 CloudBase Node.js SDK
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import cloudbase from '@cloudbase/node-sdk'
import bcrypt from 'bcryptjs'
import * as jwt from 'jsonwebtoken'

/**
 * 国内用户邮箱注册/登录 API
 * 使用腾讯云 CloudBase Node.js SDK 数据库集合
 */
export default async function authCnHandler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // ✅ 诊断日志 1: 打印完整请求体
  console.log("✅ [API Received]: ", JSON.stringify(req.body, null, 2))

  // 只接受 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const { email, password, action = 'signup' } = req.body

    // ✅ 诊断日志 2: 打印提取的 email 和 action
    console.log(`✅ [Action]: ${action}, [Email to Check]: ${email}`)

    // 验证请求参数
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: '请提供邮箱和密码'
      })
    }

    // 验证密码长度
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: '密码至少需要6位'
      })
    }

    // 初始化 CloudBase App 实例
    const app = cloudbase.init({
      env: process.env.TENCENT_ENV_ID || process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
      secretId: process.env.TENCENT_SECRET_ID || process.env.CLOUDBASE_SECRET_ID,
      secretKey: process.env.TENCENT_SECRET_KEY || process.env.CLOUDBASE_SECRET_KEY
    })

    const db = app.database()
    const usersCollection = db.collection('web_users')

    if (action === 'signup') {
      // 注册逻辑
      try {
        // ✅ 诊断日志 3: 在数据库查询之前打印即将查询的 email
        console.log(`🔍 [Querying Database For]: ${email}`)

        // 先检查邮箱是否已存在
        const existingUserResult = await usersCollection.where({ email }).get()
        console.log(`🔍 [Existing User Check]: Found ${existingUserResult.data?.length || 0} user(s)`)

        if (existingUserResult.data && existingUserResult.data.length > 0) {
          console.log(`⚠️ [Email Already Exists]: ${email}`)
          return res.status(400).json({
            success: false,
            message: '该邮箱已被注册'
          })
        }

        // 加密密码
        const hashedPassword = await bcrypt.hash(password, 10)

        // 创建新用户
        const newUser = {
          email: email,
          password: hashedPassword,
          name: email.includes('@') ? email.split('@')[0] : email,
          pro: false,
          region: 'china',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        console.log('✅ [Creating User]:', JSON.stringify(newUser, null, 2))
        const result = await usersCollection.add(newUser)
        console.log(`✅ [User Created Successfully]: ID=${result.id}, Email=${email}`)

        // 生成 JWT Token（注册成功后自动登录）
        const tokenPayload = {
          userId: result.id,
          email: email,
          region: 'china'
        }

        // ✅ 动态设置 Token 有效期：普通用户 30 天，高级会员 90 天
        const expiresIn = newUser.pro ? '90d' : '30d'

        const token = jwt.sign(
          tokenPayload,
          process.env.JWT_SECRET || 'fallback-secret-key-for-development-only',
          { expiresIn: expiresIn }
        )

        console.log(`✅ [JWT Token Generated]: For new user ${email}`)

        return res.status(200).json({
          success: true,
          message: '注册成功',
          user: {
            id: result.id,
            userId: result.id,
            email,
            name: newUser.name,
            pro: false,
            region: 'china'
          },
          token: token
        })
      } catch (error: any) {
        console.error('注册错误:', error)
        console.error('错误详情:', JSON.stringify(error, null, 2))

        if (error.message && (
          error.message.includes('duplicate') ||
          error.message.includes('E11000') ||
          error.message.includes('已存在')
        )) {
          return res.status(400).json({
            success: false,
            message: '该邮箱已被注册'
          })
        }

        return res.status(400).json({
          success: false,
          message: error.message || '注册失败，请稍后重试'
        })
      }
    } else if (action === 'login') {
      // 登录逻辑
      try {
        console.log(`🔍 [Login - Querying Database For]: ${email}`)

        // 查找用户
        const userResult = await usersCollection.where({ email }).get()
        console.log(`🔍 [Login - Found]: ${userResult.data?.length || 0} user(s)`)

        if (!userResult.data || userResult.data.length === 0) {
          return res.status(400).json({
            success: false,
            message: '用户不存在或密码错误'
          })
        }

        const user = userResult.data[0]

        // 验证密码
        const isPasswordValid = await bcrypt.compare(password, user.password)

        if (!isPasswordValid) {
          console.log(`❌ [Login Failed]: Password mismatch for email ${email}`)
          return res.status(400).json({
            success: false,
            message: '用户不存在或密码错误'
          })
        }

        console.log(`✅ [Login Success]: User ${email} logged in successfully`)

        // 生成 JWT Token
        const tokenPayload = {
          userId: user._id,
          email: user.email,
          region: 'china'
        }

        const expiresIn = user.pro ? '90d' : '30d'

        const token = jwt.sign(
          tokenPayload,
          process.env.JWT_SECRET || 'fallback-secret-key-for-development-only',
          { expiresIn: expiresIn }
        )

        console.log(`✅ [JWT Token Generated]: For user ${email}`)

        return res.status(200).json({
          success: true,
          message: '登录成功',
          user: {
            id: user._id,
            userId: user._id,
            email: user.email,
            name: user.name,
            pro: user.pro || false,
            region: 'china'
          },
          token: token
        })
      } catch (error: any) {
        console.error('登录错误:', error)
        return res.status(400).json({
          success: false,
          message: error.message || '邮箱或密码错误'
        })
      }
    } else if (action === 'refresh') {
      // Token刷新逻辑
      try {
        const { userId } = req.body

        if (!userId) {
          return res.status(400).json({
            success: false,
            message: '缺少 userId 参数'
          })
        }

        console.log(`🔄 [Token Refresh]: 开始刷新用户 ${userId} 的Token`)

        // 从CloudBase获取用户信息
        const cloudbaseDB = cloudbase.init({
          env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID!,
          secretId: process.env.CLOUDBASE_SECRET_ID!,
          secretKey: process.env.CLOUDBASE_SECRET_KEY!
        }).database()

        const userResult = await cloudbaseDB
          .collection('web_users')
          .doc(userId)
          .get()

        if (!userResult.data || userResult.data.length === 0) {
          return res.status(404).json({
            success: false,
            message: '用户不存在'
          })
        }

        const user = userResult.data[0]

        // 生成新的JWT Token
        const tokenPayload = {
          userId: user._id,
          email: user.email,
          region: 'china'
        }

        const expiresIn = user.pro ? '90d' : '30d'

        const newToken = jwt.sign(
          tokenPayload,
          process.env.JWT_SECRET || 'fallback-secret-key-for-development-only',
          { expiresIn: expiresIn }
        )

        console.log(`✅ [Token Refreshed]: For user ${user.email}, expires in ${expiresIn}`)

        return res.status(200).json({
          success: true,
          message: 'Token刷新成功',
          token: newToken,
          expiresIn: expiresIn
        })
      } catch (error: any) {
        console.error('Token刷新错误:', error)
        return res.status(400).json({
          success: false,
          message: error.message || 'Token刷新失败'
        })
      }
    } else {
      return res.status(400).json({
        success: false,
        message: '无效的 action 参数，请使用 signup, login 或 refresh'
      })
    }

  } catch (error: any) {
    console.error('API 错误:', error)
    return res.status(500).json({
      success: false,
      message: error.message || '服务器错误'
    })
  }
}