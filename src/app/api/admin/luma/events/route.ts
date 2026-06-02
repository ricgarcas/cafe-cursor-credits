import { NextResponse } from 'next/server'
import { desc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { appSettings, lumaEvents } from '@/lib/db/schema'
import { refreshLumaEvents } from '@/lib/luma/sync'
import { requireUser } from '@/lib/auth/guard'

export async function GET() {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const rows = await db.select().from(lumaEvents).orderBy(desc(lumaEvents.startAt))
  return NextResponse.json({ events: rows })
}

/** Pull latest event list from Luma and upsert into local cache. */
export async function POST() {
  const gate = await requireUser()
  if ('response' in gate) return gate.response

  const [settings] = await db.select().from(appSettings).limit(1)
  if (!settings?.lumaApiKey) {
    return NextResponse.json({ error: 'Luma API key not configured' }, { status: 400 })
  }
  try {
    const result = await refreshLumaEvents(
      settings.lumaApiKey,
      settings.lumaCalendarId ?? undefined,
    )
    const rows = await db.select().from(lumaEvents).orderBy(desc(lumaEvents.startAt))
    return NextResponse.json({ ...result, events: rows })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
