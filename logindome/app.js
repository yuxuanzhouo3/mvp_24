// app.js
const { BASE_URL, request } = require('./utils/util')

App({
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 启动时尝试一次登录（不阻塞）
    this.login().catch(() => {})
  },

  login() {
    console.log('[app] login method called')
    return new Promise((resolve, reject) => {
      wx.login({
        success: async (res) => {
          if (!res.code) {
            reject(new Error('wx.login: missing code'))
            return
          }

          // 没有配置后端时，只把 code 返回给页面用于演示
          if (!BASE_URL) {
            const auth = { code: res.code, from: 'wx.login' }
            wx.setStorageSync('auth', auth)
            this.globalData.auth = auth
            resolve(auth)
            return
          }

          try {
            // 你的后端应当使用 code 调用 jscode2session 换取 openid/session_key
            // 并返回你自己的登录态（如 token / openid / expiresAt 等）
            const auth = await request({
              url: `${BASE_URL}/api/wx/login`,
              method: 'POST',
              data: { code: res.code },
            })

            wx.setStorageSync('auth', auth)
            this.globalData.auth = auth
            resolve(auth)
          } catch (e) {
            reject(e)
          }
        },
        fail: reject,
      })
    })
  },

  globalData: {
    userInfo: null,
    auth: null,
  }
})
