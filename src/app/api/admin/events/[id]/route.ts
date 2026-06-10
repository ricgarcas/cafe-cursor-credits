import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { events } from '@/lib/db/schema'
import { setActiveEvent } from '@/lib/db/events'
import { requireUser } from '@/lib/auth/guard'

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  event_date: z.string().max(64).nullable().optional(),
  claim_passcode: z.string().max(32).nullable().optional(),
  action: z.enum(['activate', 'archive']).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const { id } = await params
  const eventId = Number(id)
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !Number.isFinite(eventId)) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const [existing] = await db.select().from(events).where(eq(events.id, eventId)).limit(1)
  if (!existing) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const { name, event_date, claim_passcode, action } = parsed.data
  const now = new Date().toISOString()
  await db
    .update(events)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(event_date !== undefined ? { eventDate: event_date } : {}),
      ...(claim_passcode !== undefined ? { claimPasscode: claim_passcode || null } : {}),
      updatedAt: now,
    })
    .where(eq(events.id, eventId))

  if (action === 'activate') await setActiveEvent(eventId)
  if (action === 'archive') {
    if (existing.status === 'active') {
      return NextResponse.json(
        { error: 'Activate another event first — one event must stay active.' },
        { status: 400 },
      )
    }
    await db.update(events).set({ status: 'archived', updatedAt: now }).where(eq(events.id, eventId))
  }
  return NextResponse.json({ success: true })
}
