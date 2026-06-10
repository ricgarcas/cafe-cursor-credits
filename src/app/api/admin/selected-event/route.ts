import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/guard'
import { getSession } from '@/lib/auth/session'
import { getEventById } from '@/lib/db/events'

export async function PUT(request: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const parsed = z.object({ event_id: z.number() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  if (!(await getEventById(parsed.data.event_id))) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }
  const session = await getSession()
  session.selectedEventId = parsed.data.event_id
  await session.save()
  return NextResponse.json({ success: true })
}
