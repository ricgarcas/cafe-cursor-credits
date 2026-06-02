import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { appSettings } from '@/lib/db/schema'
import { syncLumaGuests, dispatchLumaCoupons } from '@/lib/luma/sync'
import { requireUser } from '@/lib/auth/guard'

const schema = z.object({
  eventApiId: z.string().min(1),
  dispatch: z.boolean().optional().default(false),
})

export async function POST(request: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid event id' }, { status: 400 })
  }
  const [settings] = await db.select().from(appSettings).limit(1)
  if (!settings?.lumaApiKey) {
    return NextResponse.json({ error: 'Luma API key not configured' }, { status: 400 })
  }

  try {
    const sync = await syncLumaGuests(settings.lumaApiKey, parsed.data.eventApiId)
    const dispatch = parsed.data.dispatch
      ? await dispatchLumaCoupons(parsed.data.eventApiId)
      : null
    return NextResponse.json({ sync, dispatch })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sync failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
