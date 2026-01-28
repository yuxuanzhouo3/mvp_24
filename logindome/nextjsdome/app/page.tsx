'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

const BUILD_ID = '2025-12-28-nextjs'

interface UserInfo {
  nickName: string
  avatarUrl: string
}

interface WxMiniProgram {
  postMessage?: (data: unknown) => void
  navigateTo?: (options: { url: string }) => void
  onMessage?: (callback: (res: unknown) => void) => void
  getEnv?: (callback: (res: { miniprogram: boolean }) => void) => void
}

interface WxObject {
  miniProgram?: WxMiniProgram
}

declare global {
  interface Window {
    wx?: WxObject
    __wxjs_environment?: string
  }
}

const storageKeys = {
  token: 'demo_token',
  openid: 'demo_openid',
  expiresIn: 'demo_expiresIn',
  nickName: 'demo_nickName',
  avatarUrl: 'demo_avatarUrl',
}

export default function Home() {
  const [env, setEnv] = useState('检测中…')
  const [apiBase, setApiBase] = useState('(same-origin)')
  const [status, setStatusText] = useState('就绪')
  const [code, setCode] = useState('-')
  const [openid, setOpenid] = useState('-')
  const [token, setToken] = useState('-')
  const [expiresIn, setExpiresIn] = useState('-')
  const [logs, setLogs] = useState<string[]>([])
  const [avatarUrl, setAvatarUrl] = useState('')
  const [nickName, setNickName] = useState('-')
  const [showAvatar, setShowAvatar] = useState(false)

  const apiBaseRef = useRef('')
  const cachedEnvIsMiniProgram = useRef<boolean | null>(null)
  const wxCheckTimer = useRef<NodeJS.Timeout | null>(null)
  const wxNotifiedAsReady = useRef(false)

  const appendLog = useCallback((line: string) => {
    const ts = new Date().toISOString()
    setLogs(prev => [`${ts} ${line}`, ...prev])
    console.log('[log]', line)
  }, [])

  const setStatus = useCallback((text: string) => {
    setStatusText(text)
    appendLog(`[status] ${text}`)
  }, [appendLog])

  const parseQuery = useCallback(() => {
    const out: Record<string, string> = {}
    if (typeof window === 'undefined') return out
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
  }, [])

  const getWxMiniProgram = useCallback((): WxMiniProgram | null => {
    if (typeof window === 'undefined') return null
    const wxObj = window.wx
    if (!wxObj || (typeof wxObj !== 'object' && typeof wxObj !== 'function')) return null
    const mp = wxObj.miniProgram
    if (!mp || (typeof mp !== 'object' && typeof mp !== 'function')) return null
    return mp
  }, [])

  const inferMiniProgramEnvFromGlobalsOrQuery = useCallback((query: Record<string, string>) => {
    const q = query._wxjs_environment
    if (typeof q === 'string' && q.toLowerCase() === 'miniprogram') return true
    if (typeof window !== 'undefined') {
      const g = window.__wxjs_environment
      if (typeof g === 'string' && g.toLowerCase() === 'miniprogram') return true
    }
    return false
  }, [])

  const detectMiniProgramEnvBySdk = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      const mp = getWxMiniProgram()
      if (!mp || typeof mp.getEnv !== 'function') {
        resolve(false)
        return
      }
      const timeout = setTimeout(() => resolve(false), 1000)
      try {
        mp.getEnv((res) => {
          clearTimeout(timeout)
          resolve(res?.miniprogram === true)
        })
      } catch {
        clearTimeout(timeout)
        resolve(false)
      }
    })
  }, [getWxMiniProgram])

  const isMiniProgramEnv = useCallback(async (query: Record<string, string>): Promise<boolean> => {
    if (cachedEnvIsMiniProgram.current !== null) return cachedEnvIsMiniProgram.current
    if (inferMiniProgramEnvFromGlobalsOrQuery(query)) {
      cachedEnvIsMiniProgram.current = true
      return true
    }
    const bySdk = await detectMiniProgramEnvBySdk()
    cachedEnvIsMiniProgram.current = bySdk
    return bySdk
  }, [inferMiniProgramEnvFromGlobalsOrQuery, detectMiniProgramEnvBySdk])

  const exchangeCode = useCallback(async (codeValue: string) => {
    const trimmed = String(codeValue || '').trim()
    if (!trimmed) return

    setCode(trimmed)
    setStatus('正在用 code 换取 token…')

    const url = `${apiBaseRef.current}/api/wxlogin`
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      })
      const data = await resp.json().catch(() => ({}))

      if (!resp.ok || !data || data.ok !== true) {
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
            try {
              const u = new URL(window.location.href)
              u.searchParams.delete('mpCode')
              window.history.replaceState({}, '', u.toString())
            } catch { /* ignore */ }
            return
          }
        }

        appendLog(`[wxlogin] failed: http=${resp.status} body=${JSON.stringify(data)}`)
        setStatus('换取失败（请看日志）')
        return
      }

      setOpenid(String(data.openid || '-'))
      setToken(String(data.token || '-'))
      setExpiresIn(String(data.expiresIn || '-'))

      if (data.token) localStorage.setItem(storageKeys.token, String(data.token))
      if (data.openid) localStorage.setItem(storageKeys.openid, String(data.openid))
      if (data.expiresIn) localStorage.setItem(storageKeys.expiresIn, String(data.expiresIn))

      try {
        const u = new URL(window.location.href)
        u.searchParams.delete('mpCode')
        window.history.replaceState({}, '', u.toString())
      } catch { /* ignore */ }

      appendLog(`[wxlogin] ok: openid=${String(data.openid || '')}`)
      setStatus('登录成功')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      appendLog(`[wxlogin] error: ${msg}`)
      setStatus('换取异常（请看日志）')
    }
  }, [appendLog, setStatus])

  const applyProfile = useCallback((userInfo: UserInfo) => {
    if (!userInfo || typeof userInfo !== 'object') return
    const name = userInfo.nickName ? String(userInfo.nickName) : ''
    const avatar = userInfo.avatarUrl ? String(userInfo.avatarUrl) : ''

    if (name) setNickName(name)
    if (avatar) {
      setAvatarUrl(avatar)
      setShowAvatar(true)
    }

    try {
      if (name) localStorage.setItem(storageKeys.nickName, name)
      if (avatar) localStorage.setItem(storageKeys.avatarUrl, avatar)
    } catch { /* ignore */ }
  }, [])

  const loadCachedAuth = useCallback(() => {
    const cachedToken = localStorage.getItem(storageKeys.token) || ''
    const cachedOpenid = localStorage.getItem(storageKeys.openid) || ''
    const cachedExpiresIn = localStorage.getItem(storageKeys.expiresIn) || ''
    const cachedNickName = localStorage.getItem(storageKeys.nickName) || ''
    const cachedAvatarUrl = localStorage.getItem(storageKeys.avatarUrl) || ''

    if (cachedToken) setToken(cachedToken)
    if (cachedOpenid) setOpenid(cachedOpenid)
    if (cachedExpiresIn) setExpiresIn(cachedExpiresIn)
    if (cachedNickName) setNickName(cachedNickName)
    if (cachedAvatarUrl) {
      setAvatarUrl(cachedAvatarUrl)
      setShowAvatar(true)
    }
  }, [])

  const clearCache = useCallback(() => {
    Object.values(storageKeys).forEach((k) => localStorage.removeItem(k))
    setCode('-')
    setOpenid('-')
    setToken('-')
    setExpiresIn('-')
    setNickName('-')
    setAvatarUrl('')
    setShowAvatar(false)
    appendLog('[cache] cleared')
    setStatus('已清空')
  }, [appendLog, setStatus])

  const handleLogin = useCallback(async () => {
    setStatus('正在发起登录请求…')
    const returnUrl = window.location.href
    const mp = getWxMiniProgram()

    if (mp && typeof mp.navigateTo === 'function') {
      const target = `/pages/webshell/login?returnUrl=${encodeURIComponent(returnUrl)}`
      appendLog('[login] 使用 wx.miniProgram.navigateTo 跳转登录页')
      mp.navigateTo({ url: target })
      return
    }

    appendLog('[login] 无法与小程序通信：wx.miniProgram 未注入或不支持 navigateTo')
    setStatus('登录请求失败')
  }, [appendLog, setStatus, getWxMiniProgram])

  const handlePing = useCallback(async () => {
    setStatus('PING…')
    if (cachedEnvIsMiniProgram.current === false) {
      appendLog('[ping] 当前不是小程序 WebView，无法 Ping')
      setStatus('PING 失败（非小程序 WebView）')
      return
    }
    appendLog('[ping] Ping 功能已简化')
    setStatus('PING 未实现（已简化）')
  }, [appendLog, setStatus])

  useEffect(() => {
    appendLog(`[build] ${BUILD_ID}`)

    const query = parseQuery()
    const apiBaseValue = typeof query.apiBase === 'string' && query.apiBase.trim() ? query.apiBase.trim() : ''
    apiBaseRef.current = apiBaseValue
    setApiBase(apiBaseValue || '(same-origin)')

    appendLog(`[url] ${window.location.href}`)
    appendLog(`[queryKeys] ${Object.keys(query).join(',')}`)

    loadCachedAuth()

    // Bootstrap from query params
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
    }

    const userInfo: UserInfo = {
      nickName: query.mpNickName || '',
      avatarUrl: query.mpAvatarUrl || '',
    }
    if (userInfo.nickName || userInfo.avatarUrl) {
      appendLog('[query] profile detected')
      applyProfile(userInfo)
    }

    // Handle token from URL (recommended approach)
    if (query.token && query.openid) {
      appendLog('[query] token & openid detected from mini program redirect')
      try {
        localStorage.setItem(storageKeys.token, String(query.token))
        localStorage.setItem(storageKeys.openid, String(query.openid))
        if (query.expiresIn) {
          localStorage.setItem(storageKeys.expiresIn, String(query.expiresIn))
          setExpiresIn(String(query.expiresIn))
        }
        setToken(String(query.token))
        setOpenid(String(query.openid))
        appendLog(`[auth] login state synced (inline): openid=${String(query.openid)}`)
        setStatus('登录成功')
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        appendLog(`[auth] inline sync failed: ${msg}`)
      }
    } else if (query.mpCode) {
      appendLog('[query] mpCode detected (fallback)')
      exchangeCode(query.mpCode)
    }

    // Detect environment
    const detectEnv = async () => {
      const isMp = await isMiniProgramEnv(query)
      setEnv(isMp ? '小程序 WebView' : '普通 H5 / 微信浏览器')

      if (!isMp) {
        setStatus('未检测到小程序 WebView（Ping/登录需要在小程序 WebView 打开）')
        appendLog('[env] 当前不在 miniprogram 环境')
      } else {
        setStatus('已就绪，等待 wx.miniProgram 注入…')
      }
      appendLog('[init] 环境已就绪。点击登录按钮开始流程。')
    }

    detectEnv()

    // Start wx check timer
    let wxCheckCount = 0
    wxCheckTimer.current = setInterval(() => {
      wxCheckCount++
      const mp = getWxMiniProgram()
      if (mp && typeof mp.postMessage === 'function') {
        isMiniProgramEnv(query).then((ok) => {
          if (!ok) return
          if (!wxCheckTimer.current) return
          clearInterval(wxCheckTimer.current)
          wxCheckTimer.current = null
          wxNotifiedAsReady.current = true
          appendLog(`[wx] wx.miniProgram 已注入（耗时 ${(wxCheckCount * 0.5).toFixed(1)}s）`)
          setStatus('已连接到小程序环境（postMessage 模式）')
        })
        return
      }
      if (wxCheckCount >= 24) {
        if (wxCheckTimer.current) {
          clearInterval(wxCheckTimer.current)
          wxCheckTimer.current = null
        }
        if (!wxNotifiedAsReady.current) {
          appendLog('[wx] wx.miniProgram 未能注入（推荐使用小程序跳转登录流程）')
          setStatus('已就绪（将使用 URL 参数回传方案）')
        }
      }
    }, 500)

    appendLog('[init] App initialized successfully')

    return () => {
      if (wxCheckTimer.current) {
        clearInterval(wxCheckTimer.current)
      }
    }
  }, [appendLog, setStatus, parseQuery, loadCachedAuth, applyProfile, exchangeCode, isMiniProgramEnv, getWxMiniProgram])

  return (
    <main className="wrap">
      <h1 className="title">WebView 套壳登录 Demo</h1>

      <section className="card">
        <div className="row">
          <div className="label">环境</div>
          <div className="value">{env}</div>
        </div>
        <div className="row">
          <div className="label">API 基址</div>
          <div className="value mono">{apiBase}</div>
        </div>
        <div className="row">
          <div className="label">状态</div>
          <div className="value">{status}</div>
        </div>
      </section>

      <section className="card">
        <div className="actions">
          <button className="btn" type="button" onClick={handleLogin}>
            用小程序原生登录
          </button>
          <button className="btn secondary" type="button" onClick={handlePing}>
            Ping 小程序
          </button>
          <button className="btn secondary" type="button" onClick={clearCache}>
            清空本地缓存
          </button>
        </div>
        <p className="hint">
          说明：此按钮会向小程序发送 <span className="mono">REQUEST_WX_LOGIN</span>，小程序收到后调用{' '}
          <span className="mono">wx.login()</span>，将 <span className="mono">token</span> 和{' '}
          <span className="mono">openid</span> 通过 URL 参数注入回本页面。
        </p>
      </section>

      <section className="card">
        <h2 className="subtitle">登录结果</h2>
        <div className="row">
          <div className="label">code</div>
          <div className="value mono">{code}</div>
        </div>
        <div className="row">
          <div className="label">openid</div>
          <div className="value mono">{openid}</div>
        </div>
        <div className="row">
          <div className="label">token</div>
          <div className="value mono">{token}</div>
        </div>
        <div className="row">
          <div className="label">expiresIn</div>
          <div className="value mono">{expiresIn}</div>
        </div>
      </section>

      <section className="card">
        <h2 className="subtitle">头像昵称</h2>
        <div className="profile">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarUrl || undefined}
            alt="avatar"
            className={`avatar ${showAvatar ? 'visible' : ''}`}
          />
          <div>
            <div className="value">{nickName}</div>
            <div className="hint">来自小程序原生资料页回传（可选）</div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="subtitle">日志</h2>
        <pre className="log">{logs.join('\n')}</pre>
      </section>
    </main>
  )
}
