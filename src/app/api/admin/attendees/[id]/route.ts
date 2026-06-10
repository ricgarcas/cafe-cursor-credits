import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { attendees, eventAttendees } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().max(255).optional(),
})

/** PATCH edits the person behind the participation (name/email live on people). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const { id } = await params
  const participationId = Number(id)
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !Number.isFinite(participationId)) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const [part] = await db
    .select()
    .from(eventAttendees)
    .where(eq(eventAttendees.id, participationId))
    .limit(1)
  if (!part) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { name, email } = parsed.data
  if (email) {
    const normalized = email.toLowerCase()
    const [conflict] = await db
      .select({ id: attendees.id })
      .from(attendees)
      .where(and(eq(attendees.email, normalized), ne(attendees.id, part.attendeeId)))
      .limit(1)
    if (conflict) {
      return NextResponse.json({ error: 'That email belongs to another person' }, { status: 409 })
    }
  }
  await db
    .update(attendees)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(email !== undefined ? { email: email.toLowerCase() } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(attendees.id, part.attendeeId))
  return NextResponse.json({ success: true })
}

/** DELETE removes the participation; ?person=true deletes the person + all participations. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const { id } = await params
  const targetId = Number(id)
  if (!Number.isFinite(targetId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  if (request.nextUrl.searchParams.get('person') === 'true') {
    await db.delete(attendees).where(eq(attendees.id, targetId)) // cascades event_attendees
    return NextResponse.json({ success: true })
  }
  const [row] = await db
    .delete(eventAttendees)
    .where(eq(eventAttendees.id, targetId))
    .returning()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
