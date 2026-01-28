(() => {
  const BUILD_ID = '2025-12-27-1'
  const $ = (id) => document.getElementById(id)

  // DOM 初始化检查
  const requiredElements = {
    envEl: 'env', apiBaseEl: 'apiBase', statusEl: 'status', codeEl: 'code',
    openidEl: 'openid', tokenEl: 'token', expiresInEl: 'expiresIn',
    logEl: 'log', avatarEl: 'avatar', nickNameEl: 'nickName',
    btnLogin: 'btnLogin', btnPing: 'btnPing', btnClear: 'btnClear'
  }

  const envEl = $('env')
  const apiBaseEl = $('apiBase')
  const statusEl = $('status')
  const codeEl = $('code')
  const openidEl = $('openid')
  const tokenEl = $('token')
  const expiresInEl = $('expiresIn')
  const logEl = $('log')
  const avatarEl = $('avatar')
  const nickNameEl = $('nickName')

  const btnLogin = $('btnLogin')
  const btnPing = $('btnPing')
  const btnClear = $('btnClear')

  // 检查必要元素是否存在
  const missingElements = []
  for (const [varName, elementId] of Object.entries(requiredElements)) {
    if (!$(elementId)) {
      missingElements.push(elementId)
    }
  }
  if (missingElements.length > 0) {
    console.error('[init] Missing DOM elements:', missingElements)
    throw new Error(`Missing required DOM elements: ${missingElements.join(', ')}`)
  }

  function appendLog(line) {
    console.log('[fn] appendLog called')
    const ts = new Date().toISOString()
    logEl.textContent = `${ts} ${line}\n${logEl.textContent || ''}`
  }

  // 一些 WebView 环境下看不到控制台；把运行时错误也写到页面日志里。
  try {
    window.addEventListener('error', (ev) => {
      const msg = ev && ev.message ? String(ev.message) : 'unknown error'
      const src = ev && ev.filename ? String(ev.filename) : ''
      const line = ev && typeof ev.lineno === 'number' ? String(ev.lineno) : ''
      const col = ev && typeof ev.colno === 'number' ? String(ev.colno) : ''
      appendLog(`[window.error] ${msg} ${src ? `@${src}` : ''}${line ? `:${line}` : ''}${col ? `:${col}` : ''}`)
    })

    window.addEventListener('unhandledrejection', (ev) => {
      const reason = ev && ev.reason ? ev.reason : ''
      const text = reason && reason.message ? String(reason.message) : String(reason)
      appendLog(`[unhandledrejection] ${text}`)
    })
  } catch {
    // ignore
  }

  // 便于确认当前页面是否为最新版本（排查缓存/部署没更新）
  try {
    appendLog(`[build] ${BUILD_ID}`)
    // 在能看到控制台的环境里也打印一份
    try { console.log('[build]', BUILD_ID) } catch {}
  } catch {
    // ignore
  }

  function setStatus(text) {
    appendLog('[fn] setStatus called')
    statusEl.textContent = text
    appendLog(`[status] ${text}`)
  }

  function parseQuery() {
    appendLog('[fn] parseQuery called')
    const out = {}
    const qs = window.location.search.replace(/^\?/, '')
    if (!qs) return out
    qs.split('&').forEach((part) => {
      if (!part) return
      const idx = part.indexOf('=')
      const k = idx >= 0 ? part.slice(0, idx) : part
      const v = idx >= 0 ? part.slice(idx + 1) : ''
      if (!k) return
      try {
        out[decodeURIComponent(k)] = decodeURIComponent(v)
      } catch {
        out[k] = v
      }
    })
    return out
  }

  const query = parseQuery()
  const apiBase = typeof query.apiBase === 'string' && query.apiBase.trim() ? query.apiBase.trim() : ''
  apiBaseEl.textContent = apiBase || '(same-origin)'

  function inferMiniProgramEnvFromGlobalsOrQuery() {
    appendLog('[fn] inferMiniProgramEnvFromGlobalsOrQuery called')
    const q = query._wxjs_environment
    if (typeof q === 'string' && q.toLowerCase() === 'miniprogram') return true

    // In some WeChat runtimes this global may exist.
    const g = window.__wxjs_environment
    if (typeof g === 'string' && g.toLowerCase() === 'miniprogram') return true

    return false
  }

  const storageKeys = {
    token: 'demo_token',
    openid: 'demo_openid',
    expiresIn: 'demo_expiresIn',
    nickName: 'demo_nickName',
    avatarUrl: 'demo_avatarUrl',
  }

  function loadCachedAuth() {
    appendLog('[fn] loadCachedAuth called')
    const token = localStorage.getItem(storageKeys.token) || ''
    const openid = localStorage.getItem(storageKeys.openid) || ''
    const expiresIn = localStorage.getItem(storageKeys.expiresIn) || ''
    const nickName = localStorage.getItem(storageKeys.nickName) || ''
    const avatarUrl = localStorage.getItem(storageKeys.avatarUrl) || ''

    if (token) tokenEl.textContent = token
    if (openid) openidEl.textContent = openid
    if (expiresIn) expiresInEl.textContent = expiresIn

    if (nickName) nickNameEl.textContent = nickName
    if (avatarUrl) {
      avatarEl.src = avatarUrl
      avatarEl.style.display = 'block'
    }
  }

  function clearCache() {
    appendLog('[fn] clearCache called')
    Object.values(storageKeys).forEach((k) => localStorage.removeItem(k))
    codeEl.textContent = '-'
    openidEl.textContent = '-'
    tokenEl.textContent = '-'
    expiresInEl.textContent = '-'
    appendLog('[cache] cleared')
    setStatus('已清空')
  }

  let cachedMiniProgram = null

  let cachedEnvIsMiniProgram = null
  let loggedEnvDetails = false

  function getWxObject() {
    appendLog('[fn] getWxObject called')
    return window.wx
  }


  // 已移除: detectMiniProgramEnvBySdk (unused at runtime)

  async function isMiniProgramEnv() {
    appendLog('[fn] isMiniProgramEnv called')
    if (cachedEnvIsMiniProgram !== null) return cachedEnvIsMiniProgram

    // Fast path: query/global hints
    if (inferMiniProgramEnvFromGlobalsOrQuery()) {
      cachedEnvIsMiniProgram = true
      return true
    }

    // Fallback: ask JS-SDK
    const bySdk = await detectMiniProgramEnvBySdk()
    cachedEnvIsMiniProgram = bySdk
    return bySdk
  }

  function logEnvDetailsOnce() {
    appendLog('[fn] logEnvDetailsOnce called')
    if (loggedEnvDetails) return
    loggedEnvDetails = true

    const q = query._wxjs_environment
    const g = window.__wxjs_environment
    const wxObj = getWxObject()
    const mp = wxObj && wxObj.miniProgram
    appendLog(
      `[env] _wxjs_environment=${String(q || '')} __wxjs_environment=${String(g || '')} ` +
        `wx=${wxObj ? typeof wxObj : 'none'} miniProgram=${mp ? 'yes' : 'no'} ` +
        `postMessage=${mp && typeof mp.postMessage === 'function' ? 'yes' : 'no'} ` +
        `navigateTo=${mp && typeof mp.navigateTo === 'function' ? 'yes' : 'no'} ` +
        `getEnv=${mp && typeof mp.getEnv === 'function' ? 'yes' : 'no'}`,
    )
  }

  function getWxMiniProgram() {
    appendLog('[fn] getWxMiniProgram called')
    // In WeChat web-view, wx.miniProgram is injected.
    const wxObj = getWxObject()
    // Note: after loading jweixin JS-SDK, typeof window.wx is often 'function'.
    if (!wxObj || (typeof wxObj !== 'object' && typeof wxObj !== 'function')) return cachedMiniProgram
    const mp = wxObj.miniProgram
    if (!mp || (typeof mp !== 'object' && typeof mp !== 'function')) return cachedMiniProgram

    cachedMiniProgram = mp
    return mp
  }

  // 启动定时器等待 wx 注入（最多检查 12 秒）
  let wxCheckTimer = null
  let wxCheckCount = 0
  let wxNotifiedAsReady = false
  
  function startWxCheckTimer() {
    appendLog('[fn] startWxCheckTimer called')
    if (wxCheckTimer) return
    
    wxCheckCount = 0
    wxCheckTimer = window.setInterval(() => {
      wxCheckCount++
      const mp = getWxMiniProgram()
      if (mp && typeof mp.postMessage === 'function') {
        // 用于接收小程序 -> H5 的 postMessage
        tryBindMiniProgramOnMessage()

        // 还需要确认当前页面确实处于小程序 WebView 环境，否则可能是假阳性
        isMiniProgramEnv().then((ok) => {
          if (!ok) return
          if (!wxCheckTimer) return
          window.clearInterval(wxCheckTimer)
          wxCheckTimer = null
          wxNotifiedAsReady = true
          appendLog('[wx] wx.miniProgram 已注入（耗时 ' + (wxCheckCount * 0.5).toFixed(1) + 's）')
          setStatus('已连接到小程序环境（postMessage 模式）')
        })
        return
      }
      // 12 秒后停止检测
      if (wxCheckCount >= 24) {
        window.clearInterval(wxCheckTimer)
        wxCheckTimer = null
        if (!wxNotifiedAsReady) {
          appendLog('[wx] wx.miniProgram 未能注入（推荐使用小程序跳转登录流程）')
          setStatus('已就绪（将使用 URL 参数回传方案）')
        }
      }
    }, 500)
  }

  async function detectEnv() {
    appendLog('[fn] detectEnv called')
    const isMp = await isMiniProgramEnv()
    envEl.textContent = isMp ? '小程序 WebView' : '普通 H5 / 微信浏览器'
    btnLogin.disabled = false
    btnPing.disabled = false

    logEnvDetailsOnce()

    if (!isMp) {
      setStatus('未检测到小程序 WebView（Ping/登录需要在小程序 WebView 打开）')
      appendLog('[env] 当前不在 miniprogram 环境（__wxjs_environment/_wxjs_environment/getEnv 均未命中）')
    } else {
      setStatus('已就绪，等待 wx.miniProgram 注入…')
    }
    appendLog('[init] 环境已就绪。点击登录按钮开始流程。')
    appendLog('[info] 方案说明：网页 → 小程序登录页 → 后端交换 token → WebView 重新加载')
    
    // 启动定时检测 wx 注入
    startWxCheckTimer()
  }

  // 已移除: postToMiniProgram (unused at runtime)

  // 已移除: getEnvViaSdk (unused at runtime)

  // 已移除: sendToMiniProgram (unused at runtime)

  // 已移除: stripQueryParams (unused at runtime)

  // 已移除: pingViaMiniProgramNavigation (unused at runtime)

  async function exchangeCode(code) {
    appendLog('[fn] exchangeCode called')
    const trimmed = String(code || '').trim()
    if (!trimmed) return

    codeEl.textContent = trimmed
    setStatus('正在用 code 换取 token…')

    const url = `${apiBase}/api/wxlogin`
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      })
      const data = await resp.json().catch(() => ({}))

      if (!resp.ok || !data || data.ok !== true) {
        // If the same mpCode is exchanged twice (e.g. due to reload), server may reject as replay.
        // In that case, prefer existing cached token to avoid confusing “failed” state.
        if (
          resp.status === 403 &&
          data &&
          typeof data.error === 'string' &&
          data.error.indexOf('code already used') >= 0
        ) {
          const cachedToken = localStorage.getItem(storageKeys.token) || ''
          const cachedOpenid = localStorage.getItem(storageKeys.openid) || ''
          if (cachedToken && cachedOpenid) {
            appendLog('[wxlogin] replay detected; using cached token/openid')
            setStatus('登录成功（已使用缓存）')
            // Also strip mpCode to prevent repeated exchanges on refresh.
            try {
              const u = new URL(window.location.href)
              u.searchParams.delete('mpCode')
              window.history.replaceState({}, '', u.toString())
            } catch {
              // ignore
            }
            return
          }
        }

        appendLog(`[wxlogin] failed: http=${resp.status} body=${JSON.stringify(data)}`)
        setStatus('换取失败（请看日志）')
        return
      }

      openidEl.textContent = String(data.openid || '-')
      tokenEl.textContent = String(data.token || '-')
      expiresInEl.textContent = String(data.expiresIn || '-')

      if (data.token) localStorage.setItem(storageKeys.token, String(data.token))
      if (data.openid) localStorage.setItem(storageKeys.openid, String(data.openid))
      if (data.expiresIn) localStorage.setItem(storageKeys.expiresIn, String(data.expiresIn))

      // Strip mpCode after success to avoid replay on subsequent reloads.
      try {
        const u = new URL(window.location.href)
        u.searchParams.delete('mpCode')
        window.history.replaceState({}, '', u.toString())
      } catch {
        // ignore
      }

      appendLog(`[wxlogin] ok: openid=${String(data.openid || '')}`)
      setStatus('登录成功')
    } catch (e) {
      appendLog(`[wxlogin] error: ${String(e && e.message ? e.message : e)}`)
      setStatus('换取异常（请看日志）')
    }
  }

  function applyProfile(userInfo) {
    appendLog('[fn] applyProfile called')
    if (!userInfo || typeof userInfo !== 'object') return
    const nickName = userInfo.nickName ? String(userInfo.nickName) : ''
    const avatarUrl = userInfo.avatarUrl ? String(userInfo.avatarUrl) : ''

    if (nickName) nickNameEl.textContent = nickName
    if (avatarUrl) {
      avatarEl.src = avatarUrl
      avatarEl.style.display = 'block'
    }

    try {
      if (nickName) localStorage.setItem(storageKeys.nickName, nickName)
      if (avatarUrl) localStorage.setItem(storageKeys.avatarUrl, avatarUrl)
    } catch {
      // ignore
    }
  }

  // 已移除: normalizeIncomingMessage, onWindowMessage, onMiniProgramMessage (unused at runtime)

  function tryBindMiniProgramOnMessage() {
    appendLog('[fn] tryBindMiniProgramOnMessage called')
    const mp = getWxMiniProgram()
    if (!mp || typeof mp.onMessage !== 'function') return false
    try {
      // 绑定一个轻量级的匿名处理器，仅用于记录消息到日志（复杂处理已移除）
      mp.onMessage((res) => {
        try { appendLog(`[mp.onMessage] <- ${JSON.stringify(res || {})}`) } catch { /* ignore */ }
      })
      appendLog('[wx] 已绑定 wx.miniProgram.onMessage (simple logger)')
      return true
    } catch (e) {
      appendLog(`[wx] 绑定 onMessage 失败: ${String(e && e.message ? e.message : e)}`)
      return false
    }
  }

  // 已移除: validateToken (unused at runtime)

  // 已移除: syncLoginState (unused at runtime)

  function bootstrapFromQuery() {
    appendLog('[fn] bootstrapFromQuery called')
    // 基础自检：确认 H5 真实拿到了哪些 query 参数
    try {
      appendLog(`[url] ${window.location.href}`)
      appendLog(`[queryKeys] ${Object.keys(query).join(',')}`)
    } catch {
      // ignore
    }

    // 小程序侧兜底回传：当基础库不支持 createWebViewContext/postMessage 时，使用 URL 参数刷新回传信号
    if (query.mpReadyTs) {
      appendLog(`[query] mpReadyTs detected: ${String(query.mpReadyTs)}`)
      setStatus('已连接到小程序环境（URL 回传）')
    }

    if (query.mpPongTs) {
      appendLog(`[query] mpPongTs detected: ${String(query.mpPongTs)}`)
      setStatus(`收到 PONG：${String(query.mpPongTs)}`)
    }

    if (query.mpProfileTs) {
      appendLog(`[query] mpProfileTs detected: ${String(query.mpProfileTs)}`)
      setStatus('收到头像昵称（URL 回传）')

      if (!query.mpNickName && !query.mpAvatarUrl) {
        appendLog('[warn] mpProfileTs present but mpNickName/mpAvatarUrl missing')
      }
    }

    // 先处理头像昵称（避免被 token/mpCode 分支提前 return 影响）
    const userInfo = {
      nickName: query.mpNickName || '',
      avatarUrl: query.mpAvatarUrl || '',
    }
    if (userInfo.nickName || userInfo.avatarUrl) {
      appendLog('[query] profile detected')
      applyProfile(userInfo)
    }

    // 方案A：从 URL 参数读取 token（推荐）
    // 这是中间页跳转方案的核心：登录成功后，小程序携带 token 回到网页
    if (query.token && query.openid) {
      appendLog('[query] token & openid detected from mini program redirect')
      try {
        localStorage.setItem(storageKeys.token, String(query.token))
        localStorage.setItem(storageKeys.openid, String(query.openid))
        if (query.expiresIn) {
          localStorage.setItem(storageKeys.expiresIn, String(query.expiresIn))
          expiresInEl.textContent = String(query.expiresIn)
        }
        tokenEl.textContent = String(query.token)
        openidEl.textContent = String(query.openid)
        appendLog(`[auth] login state synced (inline): openid=${String(query.openid)}`)
        setStatus('登录成功')
        return
      } catch (e) {
        appendLog(`[auth] inline sync failed: ${String(e && e.message ? e.message : e)}`)
      }
    }

    // Fallback path: 如果 token 和 openid 都不存在，尝试使用旧方案（mpCode）
    if (query.mpCode) {
      appendLog('[query] mpCode detected (fallback)')
      exchangeCode(query.mpCode)
      return
    }
  }

  // 事件监听器（带错误边界）
  if (btnLogin) {
    btnLogin.addEventListener('click', async () => {
      try {
        setStatus('正在发起登录请求…')
        const returnUrl = window.location.href
        const mp = getWxMiniProgram()

        // 优先：直接让网页调用小程序 API 跳转到登录页（更可靠，不依赖 bindmessage）
        if (mp && typeof mp.navigateTo === 'function') {
          const target = `/pages/webshell/login?returnUrl=${encodeURIComponent(returnUrl)}`
          appendLog('[login] 使用 wx.miniProgram.navigateTo 跳转登录页')
          mp.navigateTo({ url: target })
          return
        }

        // 兜底：sendToMiniProgram 已移除，记录并提示
        appendLog('[login] sendToMiniProgram 已移除（运行时未触发），无法回退到 postMessage')
        appendLog('[login] 无法与小程序通信：wx.miniProgram 未注入或不支持 navigateTo')
      } catch (e) {
        appendLog(`[error] 登录请求异常: ${e.message}`)
        setStatus('登录请求异常')
      }
    })
  }

  if (btnPing) {
    btnPing.addEventListener('click', async () => {
      try {
        setStatus('PING…')
        if (cachedEnvIsMiniProgram === false) {
          appendLog('[ping] 当前不是小程序 WebView，无法 Ping')
          setStatus('PING 失败（非小程序 WebView）')
          return
        }

        // pingViaMiniProgramNavigation 已移除（未运行），记录并提示
        appendLog('[ping] pingViaMiniProgramNavigation 已移除（运行时未触发）')
        setStatus('PING 未实现（已移除）')
      } catch (e) {
        appendLog(`[error] Ping 异常: ${e.message}`)
        setStatus('Ping 异常')
      }
    })
  }

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      try {
        // inline 清空逻辑（原 clearCache 已移除）
        try {
          Object.values(storageKeys).forEach((k) => localStorage.removeItem(k))
        } catch {
          /* ignore */
        }
        codeEl.textContent = '-'
        openidEl.textContent = '-'
        tokenEl.textContent = '-'
        expiresInEl.textContent = '-'
        appendLog('[cache] cleared (inline)')
        setStatus('已清空')
      } catch (e) {
        appendLog(`[error] 清空缓存异常: ${e.message}`)
      }
    })
  }

  if (logEl) {
    window.addEventListener('message', onWindowMessage)
  }

  // JS-SDK / bridge may become ready after initial load.
  document.addEventListener(
    'WeixinJSBridgeReady',
    () => {
      if (logEl) appendLog('[bridge] WeixinJSBridgeReady')
      detectEnv()
    },
    false,
  )

  // 初始化应用
  try {
    loadCachedAuth()
    bootstrapFromQuery()
    tryBindMiniProgramOnMessage()
    detectEnv()
    if (logEl) appendLog('[init] App initialized successfully')
  } catch (e) {
    console.error('[init] Initialization error:', e)
    if (statusEl) setStatus(`初始化失败: ${e.message}`)
  }
})()
