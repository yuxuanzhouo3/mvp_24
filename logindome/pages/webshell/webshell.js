const DEFAULT_H5_URL = 'https://ways-block-tue-stability.trycloudflare.com'
function normalizeBaseUrl(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  return s.replace(/\/+$/g, '')
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function maybeDecodeUrlParam(raw) {
  const s = String(raw || '')
  // Only decode when it looks like an encoded URL param (avoid double-decoding real URLs containing %xx)
  if (/^https?%3A%2F%2F/i.test(s)) return safeDecode(s)
  return s
}

function parseQuery(qs) {
  const out = {}
  const raw = String(qs || '').replace(/^\?/, '')
  if (!raw) return out

  raw.split('&').forEach((part) => {
    if (!part) return
    const idx = part.indexOf('=')
    const k = idx >= 0 ? part.slice(0, idx) : part
    const v = idx >= 0 ? part.slice(idx + 1) : ''
    const key = safeDecode(k)
    if (!key) return
    out[key] = safeDecode(v)
  })
  return out
}

function buildUrlWithQuery(baseUrl, params) {
  const raw = String(baseUrl || '')
  if (!raw) return ''

  const hashSplit = raw.split('#')
  const beforeHash = hashSplit[0]
  const hash = hashSplit.length > 1 ? `#${hashSplit.slice(1).join('#')}` : ''

  const qIndex = beforeHash.indexOf('?')
  const path = qIndex >= 0 ? beforeHash.slice(0, qIndex) : beforeHash
  const qs = qIndex >= 0 ? beforeHash.slice(qIndex + 1) : ''

  const merged = {
    ...parseQuery(qs),
    ...(params || {}),
  }

  const pairs = []
  Object.keys(merged).forEach((k) => {
    const v = merged[k]
    if (v === undefined || v === null || v === '') return
    pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  })

  const nextQs = pairs.length ? `?${pairs.join('&')}` : ''
  return `${path}${nextQs}${hash}`
}

function buildH5Url({
  h5Url,
  apiBase,
  mpCode,
  mpOpenid,
  mpToken,
  mpNickName,
  mpAvatarUrl,
  mpProfileTs,
  token,
  openid,
} = {}) {
  const base = String(h5Url || DEFAULT_H5_URL)
  // IMPORTANT: only include defined/non-empty params.
  // Otherwise, we would overwrite existing query params (e.g. mpCode) with undefined
  // during a later refresh (like profile fallback), causing H5 to lose the code.
  const params = {}
  if (apiBase) params.apiBase = apiBase
  if (mpCode) params.mpCode = mpCode
  if (mpOpenid) params.mpOpenid = mpOpenid
  if (mpToken) params.mpToken = mpToken
  if (mpNickName) params.mpNickName = mpNickName
  if (mpAvatarUrl) params.mpAvatarUrl = mpAvatarUrl
  if (mpProfileTs) params.mpProfileTs = mpProfileTs
  if (token) params.token = token
  if (openid) params.openid = openid
  return buildUrlWithQuery(base, params)
}

Page({
  data: {
    src: DEFAULT_H5_URL,
    h5Url: DEFAULT_H5_URL,
    apiBase: '',
    lastPushedTs: 0,
    skipProfile: false,
  },

  _loggedNoWebViewContext: false,

  onReady() {
    // 由于部分基础库不存在 wx.createWebViewContext，无法走“小程序 -> H5 postMessage”。
    // 仅在这种兜底环境下才使用“追加 URL 参数触发刷新”的方式给 H5 一个已就绪信号。
    try {
      wx.showToast({ title: 'WebView Ready', icon: 'none', duration: 600 })
    } catch {
      // ignore
    }

    const canPostToH5 = typeof wx.createWebViewContext === 'function'
    if (canPostToH5) return

    setTimeout(() => {
      const current = this.data.src
      if (!current) return
      // Avoid reloading during auth payloads; reloading can trigger duplicate code exchange.
      if (/[?&](mpCode|token|openid)=/.test(current)) return
      const next = buildUrlWithQuery(current, { mpReadyTs: Date.now() })
      if (next && next !== current) this.setData({ src: next })
    }, 300)
  },

  postToH5(data) {
    if (typeof wx.createWebViewContext !== 'function') {
      if (!this._loggedNoWebViewContext) {
        this._loggedNoWebViewContext = true
        console.log('[webshell] wx.createWebViewContext is not available in this base library')
      }
      return false
    }

    try {
      let ctx = null
      try {
        ctx = wx.createWebViewContext('h5', this)
      } catch (e) {
        console.log('[webshell] createWebViewContext(id,this) failed', e)
      }

      if (!ctx) {
        try {
          ctx = wx.createWebViewContext('h5')
        } catch (e) {
          console.log('[webshell] createWebViewContext(id) failed', e)
        }
      }

      if (!ctx) {
        console.log('[webshell] createWebViewContext returned null')
        return false
      }

      if (typeof ctx.postMessage !== 'function') {
        console.log('[webshell] webViewContext.postMessage not available')
        return false
      }

      ctx.postMessage({ data })
      return true
    } catch (e) {
      console.log('[webshell] postToH5 failed', e)
      return false
    }
  },

  onLoad(options) {
    const h5Url = maybeDecodeUrlParam(options.h5Url || options.url || DEFAULT_H5_URL)
    const apiBase = normalizeBaseUrl(options.apiBase)
    const skipProfile = options.skipProfile === '1'
    const isPing = options.ping === '1'

    this.setData({
      h5Url,
      apiBase,
      skipProfile,
      src: buildH5Url({ h5Url, apiBase }),
    })

    // 兜底 Ping：当 H5->小程序 postMessage 无法稳定触发 bindmessage 时，
    // 允许 H5 通过 redirectTo 到本页并带 ping=1，再由小程序用 URL 参数回传 PONG。
    if (isPing) {
      setTimeout(() => {
        const next = buildUrlWithQuery(this.data.src, { mpPongTs: Date.now() })
        if (next && next !== this.data.src) this.setData({ src: next })
      }, 120)
    }

    // 保存 apiBase 到全局，供 login.js 使用
    const app = getApp()
    if (apiBase && !app.globalData) {
      app.globalData = {}
    }
    if (apiBase) {
      app.globalData.apiBase = apiBase
    }
  },

  onShow() {
    // 检查是否跳过了头像选择（登录后直接返回，skipProfile=1）
    const skipProfile = this.data.skipProfile
    if (skipProfile) {
      this.setData({ skipProfile: false })
      return
    }

    const pendingLogin = wx.getStorageSync('mp_pending_login')
    const pendingProfile = wx.getStorageSync('mp_pending_profile')

    const loginObj = pendingLogin && typeof pendingLogin === 'object' ? pendingLogin : null
    const profileObj = pendingProfile && typeof pendingProfile === 'object' ? pendingProfile : null

    const loginTs = loginObj ? Number(loginObj.ts || 0) : 0
    const loginCode = loginObj ? String(loginObj.code || '') : ''

    const profileTs = profileObj ? Number(profileObj.ts || 0) : 0
    const userInfo = profileObj && profileObj.userInfo && typeof profileObj.userInfo === 'object' ? profileObj.userInfo : null

    const hasLogin = Boolean(loginCode) && loginTs > this.data.lastPushedTs
    const hasProfile = Boolean(userInfo) && profileTs > this.data.lastPushedTs

    if (!hasLogin && !hasProfile) return

    // If mini program cannot postMessage back to H5, do ONE URL refresh containing both payloads.
    // This avoids the second refresh overwriting the first (e.g. dropping mpCode).
    if (typeof wx.createWebViewContext !== 'function') {
      const base = this.data.src || this.data.h5Url || DEFAULT_H5_URL
      const next = buildUrlWithQuery(base, {
        mpCode: hasLogin ? loginCode : undefined,
        mpNickName: hasProfile && userInfo && userInfo.nickName ? String(userInfo.nickName) : undefined,
        mpAvatarUrl: '',
        mpProfileTs: hasProfile ? profileTs : undefined,
      })

      if (hasLogin) wx.removeStorageSync('mp_pending_login')
      if (hasProfile) wx.removeStorageSync('mp_pending_profile')
      this.setData({ lastPushedTs: Math.max(this.data.lastPushedTs, loginTs, profileTs) })

      if (next && next !== this.data.src) this.setData({ src: next })
      return
    }

    // postMessage-capable: send code first, then profile
    if (hasLogin) {
      console.log('[webshell] pushing login code to H5')
      wx.removeStorageSync('mp_pending_login')
      this.setData({ lastPushedTs: loginTs })
      this.pushCodeToH5(loginCode)
    }
    if (hasProfile) {
      wx.removeStorageSync('mp_pending_profile')
      this.setData({ lastPushedTs: Math.max(this.data.lastPushedTs, profileTs) })
      this.pushUserInfoToH5(userInfo)
    }
  },

  async pushUserInfoToH5(userInfo) {
    if (this.postToH5({ type: 'PROFILE_RESULT', userInfo })) return

    // 兜底：刷新 web-view URL，把资料带给 H5
    const profileTs = Date.now()
    const base = this.data.src || this.data.h5Url || DEFAULT_H5_URL
    const next = buildUrlWithQuery(base, {
      apiBase: this.data.apiBase || undefined,
      mpNickName: userInfo && userInfo.nickName ? String(userInfo.nickName) : undefined,
      // 小程序 chooseAvatar 返回的通常是本地临时路径（如 wxfile://...），H5 无法直接访问。
      // 且把本地路径塞进 URL 可能导致 web-view 拒绝跳转/不刷新。
      // 因此兜底回传只传 nickName，avatar 先留空。
      mpAvatarUrl: '',
      mpProfileTs: profileTs,
    })
    console.log('[webshell] fallback profile via URL', { profileTs })
    try {
      wx.showToast({ title: '资料已回传', icon: 'success', duration: 800 })
    } catch {
      // ignore
    }
    this.setData({ src: next })
  },

  async pushCodeToH5(code) {
    console.log('[webshell] pushCodeToH5 called with code:', code)
    // 优先：尝试小程序 -> H5 postMessage（无需刷新）
    if (this.postToH5({ type: 'WX_LOGIN_CODE', code })) return

    // 兜底：刷新 web-view URL，把 mpCode 带给 H5
    const base = this.data.src || this.data.h5Url || DEFAULT_H5_URL
    const next = buildUrlWithQuery(base, {
      apiBase: this.data.apiBase || undefined,
      mpCode: code,
    })
    this.setData({ src: next })
  },

  async onWebMessage(e) {
    console.log('[webshell] onWebMessage raw', e && e.detail ? e.detail : e)
    const raw = e && e.detail && e.detail.data
    const last = Array.isArray(raw) ? raw[raw.length - 1] : raw
    const msg = last && typeof last === 'object' ? last : null
    if (!msg || typeof msg !== 'object') return

    // 兼容两种形态：
    // 1) H5 wx.miniProgram.postMessage({ data: {type: 'PING'} }) => e.detail.data: [{type:'PING'}]
    // 2) 个别环境可能变成 e.detail.data: [{data:{type:'PING'}}]
    const payload = msg && msg.data && typeof msg.data === 'object' ? msg.data : msg

    console.log('[webshell] onWebMessage', payload)

    // 便于肉眼确认是否真的进了 bindmessage
    try {
      const t = payload && payload.type ? String(payload.type) : 'UNKNOWN'
      wx.showToast({ title: `收到: ${t}`, icon: 'none', duration: 600 })
    } catch {
      // ignore
    }

    if (payload.type === 'PING') {
      try {
        wx.showToast({ title: '收到 PING', icon: 'none', duration: 800 })
      } catch {
        // ignore
      }

      // 优先走 postMessage（若基础库支持），否则用 URL 参数刷新方式回传
      const ok = this.postToH5({ type: 'PONG', ts: Date.now() })
      if (!ok) {
        const next = buildUrlWithQuery(this.data.src, { mpPongTs: Date.now() })
        if (next && next !== this.data.src) this.setData({ src: next })
      }
      return
    }

    if (payload.type === 'REQUEST_WX_LOGIN') {
      console.log('[webshell] REQUEST_WX_LOGIN triggered')
      try {
        try {
          wx.showToast({ title: '收到登录请求', icon: 'none', duration: 800 })
        } catch {
          // ignore
        }
        
        // 方案改进：优先使用 H5 传入的 returnUrl（更准确），兜底用 this.data.h5Url
        const returnUrl = payload && payload.returnUrl ? String(payload.returnUrl) : ''
        const currentUrl = returnUrl || this.data.h5Url
        const loginUrl = `/pages/webshell/login?returnUrl=${encodeURIComponent(currentUrl)}`
        
        wx.navigateTo({ url: loginUrl })
      } catch {
        // ignore
      }
      return
    }
  },
})
