'use server'

/**
 * CloudBase 认证服务函数
 * 仅在服务器端运行
 */

import cloudbase from '@cloudbase/node-sdk'
import bcrypt from 'bcryptjs'
import { signAccessToken } from "@/lib/security/jwt";

interface CloudBaseUser {
  _id?: string
  email: string
  password?: string
  name: string
  pro: boolean
  region: string
  createdAt?: string
  updatedAt?: string
}

/**
 * 初始化 CloudBase 应用
 */
function initCloudBase() {
  return cloudbase.init({
    env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
    secretId: process.env.CLOUDBASE_SECRET_ID,
    secretKey: process.env.CLOUDBASE_SECRET_KEY
  })
}

/**
 * 用户邮箱密码登录
 */
export async function cloudbaseSignInWithEmail(
  email: string,
  password: string
): Promise<{ success: boolean; user?: CloudBaseUser; message: string; token?: string }> {
  try {
    const app = initCloudBase()
    const db = app.database()
    const usersCollection = db.collection('web_users')

    // 查找用户
    const userResult = await usersCollection.where({ email }).get()

    if (!userResult.data || userResult.data.length === 0) {
      return { success: false, message: '用户不存在或密码错误' }
    }

    const user = userResult.data[0]

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password)

    if (!isPasswordValid) {
      return { success: false, message: '用户不存在或密码错误' }
    }

    const token = signAccessToken({
      userId: user._id,
      email: user.email,
      region: "CN",
      source: "legacy-cloudbase-auth",
    });

    return {
      success: true,
      message: '登录成功',
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        pro: user.pro || false,
        region: 'china'
      },
      token
    }
  } catch (error) {
    console.error('❌ [CloudBase Login] 错误:', error)
    return { success: false, message: error instanceof Error ? error.message : '登录失败' }
  }
}

/**
 * 用户邮箱密码注册
 */
export async function cloudbaseSignUpWithEmail(
  email: string,
  password: string
): Promise<{ success: boolean; user?: CloudBaseUser; message: string; token?: string }> {
  try {
    const app = initCloudBase()
    const db = app.database()
    const usersCollection = db.collection('web_users')

    // 检查邮箱是否已存在
    const existingUserResult = await usersCollection.where({ email }).get()

    if (existingUserResult.data && existingUserResult.data.length > 0) {
      return { success: false, message: '该邮箱已被注册' }
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10)

    // 创建新用户
    const newUser = {
      email,
      password: hashedPassword,
      name: email.includes('@') ? email.split('@')[0] : email,
      pro: false,
      region: 'china',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const result = await usersCollection.add(newUser)
    const newUserId = result.id
    if (!newUserId) {
      throw new Error("Failed to get created user id");
    }

    const token = signAccessToken({
      userId: newUserId,
      email,
      region: "CN",
      source: "legacy-cloudbase-auth",
    });

    return {
      success: true,
      message: '注册成功',
      user: {
        _id: newUserId,
        email,
        name: newUser.name,
        pro: false,
        region: 'china'
      },
      token
    }
  } catch (error) {
    console.error('❌ [CloudBase Signup] 错误:', error)
    return { success: false, message: error instanceof Error ? error.message : '注册失败' }
  }
}

/**
 * 刷新 Token
 */
export async function cloudbaseRefreshToken(
  userId: string
): Promise<{ success: boolean; token?: string; message: string }> {
  try {
    const app = initCloudBase()
    const db = app.database()
    const usersCollection = db.collection('web_users')

    // 获取用户信息
    const userResult = await usersCollection.doc(userId).get()

    if (!userResult.data || userResult.data.length === 0) {
      return { success: false, message: '用户不存在' }
    }

    const user = userResult.data[0]

    const token = signAccessToken({
      userId: user._id,
      email: user.email,
      region: "CN",
      source: "legacy-cloudbase-auth",
    });

    return { success: true, token, message: 'Token已刷新' }
  } catch (error) {
    console.error('❌ [CloudBase Refresh] 错误:', error)
    return { success: false, message: error instanceof Error ? error.message : 'Token刷新失败' }
  }
}
