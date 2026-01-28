import { NextRequest, NextResponse } from 'next/server'
import { deleteSession } from '@/lib/store'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const sid = String(body.sid || '')

    if (!sid) {
      return NextResponse.json({ ok: false, error: 'missing sid' }, { status: 400 })
    }

    deleteSession(sid)
    return NextResponse.json({ ok: true, sid })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}
