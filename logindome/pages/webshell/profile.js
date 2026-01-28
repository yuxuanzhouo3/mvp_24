const defaultAvatarUrl = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

Page({
  data: {
    avatarUrl: defaultAvatarUrl,
    nickName: '',
    canSubmit: false,
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail || {}
    this.setData({
      avatarUrl: avatarUrl || defaultAvatarUrl,
      canSubmit: Boolean(this.data.nickName && avatarUrl && avatarUrl !== defaultAvatarUrl),
    })
  },

  onInputChange(e) {
    const nickName = (e && e.detail && e.detail.value) ? String(e.detail.value) : ''
    this.setData({
      nickName,
      canSubmit: Boolean(nickName && this.data.avatarUrl && this.data.avatarUrl !== defaultAvatarUrl),
    })
  },

  onSubmit() {
    console.log('[profile] onSubmit called')
    const { avatarUrl, nickName } = this.data
    if (!nickName || !avatarUrl || avatarUrl === defaultAvatarUrl) return

    wx.setStorageSync('mp_pending_profile', {
      userInfo: { avatarUrl, nickName },
      ts: Date.now(),
    })

    try {
      wx.showToast({ title: '已保存', icon: 'success', duration: 800 })
    } catch {
      // ignore
    }

    // 回到原来的 webshell 页面，触发 onShow 回传资料
    wx.navigateBack({ delta: 1 })
  },
})
