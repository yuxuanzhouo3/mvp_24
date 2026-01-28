#!/usr/bin/env node

/**
 * CloudBase连接测试脚本
 * 用于验证数据库连接和权限配置
 */

require('dotenv').config({ path: '.env.local' })
const cloudbase = require('@cloudbase/node-sdk')

async function testConnection() {
  // 延迟读取环境变量，防止构建时访问
  const envId = process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID
  const secretId = process.env.CLOUDBASE_SECRET_ID
  const secretKey = process.env.CLOUDBASE_SECRET_KEY

  console.log('=== CloudBase连接测试 ===')
  console.log('环境ID:', envId)
  console.log('SecretId:', secretId ? secretId.substring(0, 20) + '...' : '未配置')
  console.log('SecretKey:', secretKey ? '已配置' : '未配置')
  console.log('')

  if (!envId || !secretId || !secretKey) {
    console.error('❌ 环境变量未完整配置')
    process.exit(1)
  }
  try {
    console.log('🔄 正在初始化CloudBase...')
    const app = cloudbase.init({
      env: envId,
      secretId: secretId,
      secretKey: secretKey
    })

    const db = app.database()
    console.log('✅ CloudBase初始化成功')

    console.log('')
    console.log('🔄 正在测试数据库连接...')

    // 尝试读取web_users集合
    const result = await db.collection('web_users').limit(1).get()

    console.log('✅ 数据库连接成功！')
    console.log('📊 web_users集合记录数:', result.data.length)

    if (result.data.length > 0) {
      console.log('📝 示例记录:', JSON.stringify(result.data[0], null, 2))
    } else {
      console.log('📝 集合为空（正常，等待用户注册）')
    }

    console.log('')
    console.log('🎉 所有测试通过！CloudBase配置正确，可以正常使用。')

  } catch (error) {
    console.error('')
    console.error('❌ 测试失败:', error.message)
    console.error('')
    console.error('错误详情:', error)
    console.error('')

    if (error.message.includes('signature')) {
      console.error('💡 建议:')
      console.error('   1. 检查API密钥是否正确复制（没有多余空格）')
      console.error('   2. 确认密钥是否有云开发权限')
      console.error('   3. 尝试重新创建API密钥')
    } else if (error.message.includes('not authorized')) {
      console.error('💡 建议:')
      console.error('   1. 给主账号添加 QcloudTCBFullAccess 策略')
      console.error('   2. 或在云开发控制台 → 安全配置 中添加访问凭证')
    } else if (error.message.includes('collection')) {
      console.error('💡 建议:')
      console.error('   1. 确认 web_users 集合已创建')
      console.error('   2. 检查集合权限设置')
    }

    process.exit(1)
  }
}

testConnection()