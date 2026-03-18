import crypto from 'crypto'

// Test-only defaults (env vars WX_APPID/WX_SECRET will override these)
const DEFAULT_WX_APPID = 'wxa8517a6fbfa69c1c'
const DEFAULT_WX_SECRET = '2772da4ed08a8260146f03b299ef5d36'

// In-memory stores (Note: will reset on server restart in production)
// For production, use Redis or database

// token -> { openid: string, issuedAt: number, expiresAt: number, iss: string, aud: string }
const TOKENS = new Map<string, {
  openid: string
  issuedAt: number
  expiresAt: number
  iss: string
  aud: string
}>()

// 已使用过的 code，防止重放攻击
const USED_CODES = new Set<string>()

// sid -> { requestedAt: number|null, code: string|null, updatedAt: number }
const SESSIONS = new Map<string, {
  requestedAt: number | null
  code: string | null
  updatedAt: number
}>()

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function getEnv(name: string): string {
  const v = process.env[name]
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (name === 'WX_APPID') return DEFAULT_WX_APPID
  if (name === 'WX_SECRET') return DEFAULT_WX_SECRET
  return ''
}

export function mintToken(openid: string, ttlMs = 2 * 60 * 60 * 1000) {
  const token = base64UrlEncode(crypto.randomBytes(32))
  const now = Date.now()
  const expiresAt = now + ttlMs

  TOKENS.set(token, {
    openid,
    issuedAt: now,
    expiresAt,
    iss: 'miniprogram-login',
    aud: 'h5-webview'
  })

  return { token, expiresIn: Math.floor(ttlMs / 1000) }
}

export function getToken(token: string) {
  return TOKENS.get(token)
}

export function deleteToken(token: string) {
  return TOKENS.delete(token)
}

export function isCodeUsed(code: string): boolean {
  return USED_CODES.has(code)
}

export function markCodeUsed(code: string) {
  USED_CODES.add(code)
  // 防止内存泄漏：code 存储 1 小时后自动清理
  setTimeout(() => {
    USED_CODES.delete(code)
  }, 3600 * 1000)
}

export function getOrInitSession(sid: string) {
  const now = Date.now()
  const existing = SESSIONS.get(sid)
  if (existing) return existing
  const created = { requestedAt: null, code: null, updatedAt: now }
  SESSIONS.set(sid, created)
  return created
}

export function deleteSession(sid: string) {
  return SESSIONS.delete(sid)
}

export function generateDemoOpenid(code: string): string {
  return `demo_${crypto.createHash('sha256').update(code).digest('hex').slice(0, 24)}`
}
