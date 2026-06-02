import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { appSettings } from '@/lib/db/schema'
import { getSelf } from '@/lib/luma/client'
import { requireUser } from '@/lib/auth/guard'

export async function POST() {
  const gate = await requireUser()
  if ('response' in gate) return gate.response

  const [settings] = await db.select().from(appSettings).limit(1)
  if (!settings?.lumaApiKey) {
    return NextResponse.json({ error: 'Luma API key not configured' }, { status: 400 })
  }
  try {
    const self = await getSelf(settings.lumaApiKey)
    return NextResponse.json({ ok: true, self })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Connection failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
}
