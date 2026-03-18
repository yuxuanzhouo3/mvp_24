import { NextRequest, NextResponse } from 'next/server'
import { getToken, deleteToken } from '@/lib/store'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const token = String(body.token || '')

    if (!token) {
      return NextResponse.json({ ok: false, error: 'missing token' }, { status: 400 })
    }

    const tokenData = getToken(token)
    if (!tokenData) {
      return NextResponse.json({ ok: false, error: 'invalid token' }, { status: 401 })
    }

    const now = Date.now()
    if (now > tokenData.expiresAt) {
      deleteToken(token)
      return NextResponse.json({ ok: false, error: 'token expired' }, { status: 401 })
    }

    return NextResponse.json({
      ok: true,
      openid: tokenData.openid,
      expiresAt: tokenData.expiresAt,
      expiresIn: Math.floor((tokenData.expiresAt - now) / 1000),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}
