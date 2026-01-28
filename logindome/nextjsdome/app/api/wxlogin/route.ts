import { NextRequest, NextResponse } from 'next/server'
import {
  getEnv,
  mintToken,
  isCodeUsed,
  markCodeUsed,
  generateDemoOpenid
} from '@/lib/store'
import { wechatJscode2Session } from '@/lib/wechat'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const code = String(body.code || '')

    if (!code) {
      return NextResponse.json({ ok: false, error: 'missing code' }, { status: 400 })
    }

    // 防止重放攻击：检查 code 是否已被使用过
    if (isCodeUsed(code)) {
      return NextResponse.json(
        { ok: false, error: 'code already used (replay attack)' },
        { status: 403 }
      )
    }

    const appid = getEnv('WX_APPID')
    const secret = getEnv('WX_SECRET')

    // Default: demo-mode (no real WeChat exchange)
    let openid = generateDemoOpenid(code)

    if (appid && secret) {
      const r = await wechatJscode2Session({ appid, secret, code })
      const data = r?.data || {}

      if (data.errcode) {
        return NextResponse.json(
          {
            ok: false,
            error: 'wechat jscode2session failed',
            errcode: data.errcode,
            errmsg: data.errmsg,
          },
          { status: 502 }
        )
      }

      if (typeof data.openid === 'string' && data.openid) {
        openid = data.openid
      }
    }

    // 标记 code 已使用
    markCodeUsed(code)

    const { token, expiresIn } = mintToken(openid)
    return NextResponse.json({ ok: true, openid, token, expiresIn })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}
