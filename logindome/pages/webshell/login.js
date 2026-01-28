Page({
  data: {
    loading: false,
  },

  async onLoad(options) {
    console.log('[login] onLoad called with options:', options)
    const returnUrl = options.returnUrl ? decodeURIComponent(options.returnUrl) : ''
    if (returnUrl) {
      wx.setStorageSync('mp_login_return_url', returnUrl)
    }

    // 启动登录流程
    await this.startWxLogin()
  },

  async startWxLogin() {
    console.log('[login] startWxLogin called')
    this.setData({ loading: true })
    try {
      const app = getApp()
      const auth = await app.login()
      const code = auth && auth.code ? String(auth.code) : ''

      if (!code) {
        wx.showToast({ title: '获取 code 失败', icon: 'error', duration: 2000 })
        this.setData({ loading: false })
        return
      }

      // 兼容方案：不要在小程序侧用 wx.request 调后端（会受 request 合法域名限制）。
      // 只把 code 回传给 H5，让 H5 用同源 fetch(/api/wxlogin) 去换 token。
      await this.redirectBackWithCode(code)
    } catch (e) {
      wx.showToast({ title: '登录异常', icon: 'error', duration: 2000 })
      this.setData({ loading: false })
    }
  },

  async redirectBackWithCode(code) {
    console.log('[login] redirectBackWithCode called with code:', code)
    try {
      wx.showLoading({ title: '登录中…' })

      const returnUrl = wx.getStorageSync('mp_login_return_url') || ''
      wx.removeStorageSync('mp_login_return_url')

      wx.hideLoading()

      // 保存 code 到 storage，供 webshell 回传
      wx.setStorageSync('mp_pending_login', {
        code,
        ts: Date.now(),
      })

      // 直接跳转到 profile 页面
      wx.redirectTo({
        url: `/pages/webshell/profile`,
      })
    } catch (e) {
      wx.hideLoading()
      const errMsg = e && e.errMsg ? e.errMsg : String(e)
      wx.showToast({ title: `跳转失败: ${errMsg}`, icon: 'error', duration: 2000 })
      this.setData({ loading: false })
    }
  },
})
