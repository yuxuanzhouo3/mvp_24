/*
 * Minimal static server for local H5 testing.
 * Usage: node server.js
 */

const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const https = require('https')

// Test-only defaults (env vars WX_APPID/WX_SECRET will override these)
const DEFAULT_WX_APPID = 'wxa8517a6fbfa69c1c'
const DEFAULT_WX_SECRET = '2772da4ed08a8260146f03b299ef5d36'

const PORT = process.env.PORT ? Number(process.env.PORT) : 5173
const PUBLIC_DIR = path.join(__dirname, 'public')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}

// token -> { openid: string, issuedAt: number, expiresAt: number }
const TOKENS = new Map()

// 已使用过的 code，防止重放攻击
const USED_CODES = new Set()

function base64UrlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function mintToken(openid, ttlMs = 2 * 60 * 60 * 1000) {
  const token = base64UrlEncode(crypto.randomBytes(32))
  const now = Date.now()
  const expiresAt = now + ttlMs
  
  // 记录 token 信息，包含签名数据
  TOKENS.set(token, { 
    openid, 
    issuedAt: now, 
    expiresAt: expiresAt,
    iss: 'miniprogram-login',
    aud: 'h5-webview'
  })
  
  return { token, expiresIn: Math.floor(ttlMs / 1000) }
}

function getEnv(name) {
  const v = process.env[name]
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (name === 'WX_APPID') return DEFAULT_WX_APPID
  if (name === 'WX_SECRET') return DEFAULT_WX_SECRET
  return ''
}

function wechatJscode2Session({ appid, secret, code }) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({
      appid,
      secret,
      js_code: code,
      grant_type: 'authorization_code',
    }).toString()

    const url = `https://api.weixin.qq.com/sns/jscode2session?${qs}`
    https
      .get(url, (resp) => {
        let raw = ''
        resp.on('data', (chunk) => {
          raw += chunk
          if (raw.length > 2e6) {
            reject(new Error('wechat response too large'))
            resp.destroy()
          }
        })
        resp.on('end', () => {
          try {
            const data = JSON.parse(raw || '{}')
            resolve({ statusCode: resp.statusCode || 0, data })
          } catch (e) {
            reject(new Error('invalid wechat json'))
          }
        })
      })
      .on('error', (err) => reject(err))
  })
}

// In-memory session store for demo purposes.
// sid -> { requestedAt: number|null, code: string|null, updatedAt: number }
const SESSIONS = new Map()

function json(res, statusCode, body) {
  const payload = JSON.stringify(body)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    // mini program requests don't require CORS, but harmless and helps browser debugging
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })
  res.end(payload)
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      // prevent abuse
      if (raw.length > 1e6) {
        reject(new Error('body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch (e) {
        reject(new Error('invalid json'))
      }
    })
  })
}

function getOrInitSession(sid) {
  const now = Date.now()
  const existing = SESSIONS.get(sid)
  if (existing) return existing
  const created = { requestedAt: null, code: null, updatedAt: now }
  SESSIONS.set(sid, created)
  return created
}

function safeJoin(base, target) {
  const targetPath = path.normalize(target).replace(/^([/\\])+/, '')
  const resolved = path.join(base, targetPath)
  if (!resolved.startsWith(base)) return null
  return resolved
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname

    // API routes for HTTP-based bridge
    if (pathname.startsWith('/api/')) {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Cache-Control': 'no-store',
        })
        res.end()
        return
      }

      if (pathname === '/api/health' && req.method === 'GET') {
        json(res, 200, { ok: true, ts: Date.now() })
        return
      }

      if (pathname === '/api/state' && req.method === 'GET') {
        const sid = String(url.searchParams.get('sid') || '')
        if (!sid) {
          json(res, 400, { ok: false, error: 'missing sid' })
          return
        }
        const s = getOrInitSession(sid)
        json(res, 200, {
          ok: true,
          sid,
          requested: Boolean(s.requestedAt),
          requestedAt: s.requestedAt,
          code: s.code,
          updatedAt: s.updatedAt,
        })
        return
      }

      if (pathname === '/api/request-login' && req.method === 'POST') {
        readJsonBody(req)
          .then((body) => {
            const sid = String(body.sid || '')
            if (!sid) return json(res, 400, { ok: false, error: 'missing sid' })
            const s = getOrInitSession(sid)
            s.requestedAt = Date.now()
            s.updatedAt = Date.now()
            json(res, 200, { ok: true, sid })
          })
          .catch((e) => json(res, 400, { ok: false, error: String(e.message || e) }))
        return
      }

      if (pathname === '/api/submit-code' && req.method === 'POST') {
        readJsonBody(req)
          .then((body) => {
            const sid = String(body.sid || '')
            const code = String(body.code || '')
            if (!sid) return json(res, 400, { ok: false, error: 'missing sid' })
            if (!code) return json(res, 400, { ok: false, error: 'missing code' })
            const s = getOrInitSession(sid)
            s.code = code
            s.updatedAt = Date.now()
            json(res, 200, { ok: true, sid })
          })
          .catch((e) => json(res, 400, { ok: false, error: String(e.message || e) }))
        return
      }

      // Exchange wx.login code -> (openid/session) -> demo token
      if (pathname === '/api/wxlogin' && req.method === 'POST') {
        readJsonBody(req)
          .then(async (body) => {
            const code = String(body.code || '')
            if (!code) return json(res, 400, { ok: false, error: 'missing code' })

            // 防止重放攻击：检查 code 是否已被使用过
            if (USED_CODES.has(code)) {
              return json(res, 403, { ok: false, error: 'code already used (replay attack)' })
            }

            const appid = getEnv('WX_APPID')
            const secret = getEnv('WX_SECRET')

            // Default: demo-mode (no real WeChat exchange)
            let openid = `demo_${crypto.createHash('sha256').update(code).digest('hex').slice(0, 24)}`

            if (appid && secret) {
              const r = await wechatJscode2Session({ appid, secret, code })
              const data = r && r.data ? r.data : {}
              if (data.errcode) {
                return json(res, 502, {
                  ok: false,
                  error: 'wechat jscode2session failed',
                  errcode: data.errcode,
                  errmsg: data.errmsg,
                })
              }
              if (typeof data.openid === 'string' && data.openid) openid = data.openid
            }

            // 标记 code 已使用
            USED_CODES.add(code)
            // 防止内存泄漏：code 存储 1 小时后自动清理
            setTimeout(() => {
              USED_CODES.delete(code)
            }, 3600 * 1000)

            const { token, expiresIn } = mintToken(openid)
            json(res, 200, { ok: true, openid, token, expiresIn })
          })
          .catch((e) => json(res, 400, { ok: false, error: String(e.message || e) }))
        return
      }

      if (pathname === '/api/reset' && req.method === 'POST') {
        readJsonBody(req)
          .then((body) => {
            const sid = String(body.sid || '')
            if (!sid) return json(res, 400, { ok: false, error: 'missing sid' })
            SESSIONS.delete(sid)
            json(res, 200, { ok: true, sid })
          })
          .catch((e) => json(res, 400, { ok: false, error: String(e.message || e) }))
        return
      }

      // 新增：验证 token 有效性的接口
      if (pathname === '/api/verify-token' && req.method === 'POST') {
        readJsonBody(req)
          .then((body) => {
            const token = String(body.token || '')
            if (!token) return json(res, 400, { ok: false, error: 'missing token' })

            const tokenData = TOKENS.get(token)
            if (!tokenData) {
              return json(res, 401, { ok: false, error: 'invalid token' })
            }

            const now = Date.now()
            if (now > tokenData.expiresAt) {
              TOKENS.delete(token)
              return json(res, 401, { ok: false, error: 'token expired' })
            }

            json(res, 200, {
              ok: true,
              openid: tokenData.openid,
              expiresAt: tokenData.expiresAt,
              expiresIn: Math.floor((tokenData.expiresAt - now) / 1000),
            })
          })
          .catch((e) => json(res, 400, { ok: false, error: String(e.message || e) }))
        return
      }

      json(res, 404, { ok: false, error: 'not found' })
      return
    }

    const filePath = safeJoin(PUBLIC_DIR, pathname)
    if (!filePath) {
      res.writeHead(400)
      res.end('Bad Request')
      return
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404)
        res.end('Not Found')
        return
      }
      const ext = path.extname(filePath)
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      res.end(data)
    })
  } catch (e) {
    res.writeHead(500)
    res.end('Internal Server Error')
  }
})

server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`[testforlogin] H5 server running at http://localhost:${PORT}`)

  const publicUrl = getEnv('PUBLIC_URL') || getEnv('TUNNEL_URL')
  if (publicUrl) {
    // eslint-disable-next-line no-console
    console.log(`[testforlogin] Public URL: ${publicUrl.replace(/\/+$/g, '')}/`)
  } else {
    // eslint-disable-next-line no-console
    console.log('[testforlogin] Tip: set PUBLIC_URL to show your tunnel domain (e.g. https://xxxx.trycloudflare.com)')
  }
})
