import { NextRequest, NextResponse } from 'next/server'
import { getOrInitSession } from '@/lib/store'

export async function GET(request: NextRequest) {
  const sid = request.nextUrl.searchParams.get('sid') || ''

  if (!sid) {
    return NextResponse.json({ ok: false, error: 'missing sid' }, { status: 400 })
  }

  const s = getOrInitSession(sid)

  return NextResponse.json({
    ok: true,
    sid,
    requested: Boolean(s.requestedAt),
    requestedAt: s.requestedAt,
    code: s.code,
    updatedAt: s.updatedAt,
  })
}
