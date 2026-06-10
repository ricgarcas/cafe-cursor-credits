import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { desc, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { events, eventAttendees } from '@/lib/db/schema'
import { ensureDefaultEvent, getActiveEvent, getSelectedEvent, setActiveEvent } from '@/lib/db/events'
import { requireUser } from '@/lib/auth/guard'

export async function GET() {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  await ensureDefaultEvent()
  const [active, selected, rows] = await Promise.all([
    getActiveEvent(),
    getSelectedEvent(),
    db
      .select({
        id: events.id,
        name: events.name,
        event_date: events.eventDate,
        status: events.status,
        claim_passcode: events.claimPasscode,
        luma_event_api_id: events.lumaEventApiId,
        attendee_count: sql<number>`(SELECT count(*) FROM ${eventAttendees} WHERE ${eventAttendees.eventId} = ${events.id})`,
      })
      .from(events)
      .orderBy(desc(events.createdAt), desc(events.id)),
  ])
  return NextResponse.json({ events: rows, active_event_id: active.id, selected_event_id: selected.id })
}

const createSchema = z.object({
  name: z.string().min(1).max(255),
  event_date: z.string().max(64).optional(),
  claim_passcode: z.string().max(32).optional(),
  activate: z.boolean().optional().default(false),
})

export async function POST(request: NextRequest) {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const { name, event_date, claim_passcode, activate } = parsed.data
  const [row] = await db
    .insert(events)
    .values({ name, eventDate: event_date ?? null, claimPasscode: claim_passcode || null })
    .returning()
  if (activate) await setActiveEvent(row.id)
  return NextResponse.json({ success: true, id: row.id })
}
