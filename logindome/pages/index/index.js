// index.js
const defaultAvatarUrl = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

Page({
  data: {
    motto: 'Hello World',
    userInfo: {
      avatarUrl: defaultAvatarUrl,
      nickName: '',
    },
    hasUserInfo: false,
    canIUseGetUserProfile: wx.canIUse('getUserProfile'),
    canIUseNicknameComp: wx.canIUse('input.type.nickname'),

    // 原生登录状态
    auth: null,
    authText: '',
    loginLoading: false,
    loginError: '',
  },

  onLoad() {
    const auth = wx.getStorageSync('auth') || null
    if (auth) {
      this.setData({
        auth,
        authText: JSON.stringify(auth, null, 2),
      })
    }
  },

  bindViewTap() {
    wx.navigateTo({
      url: '../logs/logs'
    })
  },
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    const { nickName } = this.data.userInfo
    this.setData({
      "userInfo.avatarUrl": avatarUrl,
      hasUserInfo: nickName && avatarUrl && avatarUrl !== defaultAvatarUrl,
    })
  },
  onInputChange(e) {
    const nickName = e.detail.value
    const { avatarUrl } = this.data.userInfo
    this.setData({
      "userInfo.nickName": nickName,
      hasUserInfo: nickName && avatarUrl && avatarUrl !== defaultAvatarUrl,
    })
  },
  getUserProfile(e) {
    // 推荐使用wx.getUserProfile获取用户信息，开发者每次通过该接口获取用户个人信息均需用户确认，开发者妥善保管用户快速填写的头像昵称，避免重复弹窗
    wx.getUserProfile({
      desc: '展示用户信息', // 声明获取用户个人信息后的用途，后续会展示在弹窗中，请谨慎填写
      success: (res) => {
        console.log(res)
        this.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        })
      }
    })
  },

  async onWxLogin() {
    if (this.data.loginLoading) return

    this.setData({ loginLoading: true, loginError: '' })
    try {
      const app = getApp()
      const auth = await app.login()
      this.setData({
        auth,
        authText: JSON.stringify(auth, null, 2),
      })
    } catch (e) {
      this.setData({ loginError: e?.message || String(e) })
    } finally {
      this.setData({ loginLoading: false })
    }
  },

  onLogout() {
    wx.removeStorageSync('auth')
    const app = getApp()
    app.globalData.auth = null
    this.setData({ auth: null, authText: '', loginError: '' })
  },
})
