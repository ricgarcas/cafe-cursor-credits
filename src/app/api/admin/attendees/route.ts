import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, isNotNull, isNull, like, or, sql, SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { attendees, couponCodes, eventAttendees } from '@/lib/db/schema'
import { getSelectedEvent } from '@/lib/db/events'
import { requireUser } from '@/lib/auth/guard'

export async function GET(request: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response

  const { searchParams } = new URL(request.url)

  // People lens: every person across all events (the community directory).
  if (searchParams.get('view') === 'people') {
    const rows = await db
      .select({
        id: attendees.id,
        name: attendees.name,
        email: attendees.email,
        events_attended: sql<number>`count(${eventAttendees.id})`,
        first_seen: sql<string>`min(${eventAttendees.registeredAt})`,
        last_seen: sql<string>`max(${eventAttendees.registeredAt})`,
      })
      .from(attendees)
      .leftJoin(eventAttendees, eq(eventAttendees.attendeeId, attendees.id))
      .groupBy(attendees.id)
      .orderBy(desc(attendees.createdAt))
    return NextResponse.json({ people: rows })
  }

  // Event lens: participations for the selected event.
  const event = await getSelectedEvent()
  const search = searchParams.get('search')?.trim() || ''
  const status = searchParams.get('status') || 'all'
  const limit = Math.min(1000, Number(searchParams.get('limit')) || 500)

  const conditions: SQL[] = [eq(eventAttendees.eventId, event.id)]
  if (search) {
    const like1 = `%${search}%`
    conditions.push(or(like(attendees.name, like1), like(attendees.email, like1))!)
  }
  if (status === 'with_coupon') conditions.push(isNotNull(eventAttendees.couponCodeId))
  if (status === 'without_coupon') conditions.push(isNull(eventAttendees.couponCodeId))

  const rows = await db
    .select()
    .from(eventAttendees)
    .innerJoin(attendees, eq(eventAttendees.attendeeId, attendees.id))
    .leftJoin(couponCodes, eq(eventAttendees.couponCodeId, couponCodes.id))
    .where(and(...conditions))
    .orderBy(desc(eventAttendees.registeredAt))
    .limit(limit)

  return NextResponse.json({
    event: { id: event.id, name: event.name, status: event.status },
    attendees: rows.map((r) => ({
      id: r.event_attendees.id,
      attendee_id: r.attendees.id,
      name: r.attendees.name,
      email: r.attendees.email,
      source: r.event_attendees.source,
      registered_at: r.event_attendees.registeredAt,
      checked_in_at: r.event_attendees.checkedInAt,
      email_status: r.event_attendees.emailStatus,
      email_error: r.event_attendees.emailError,
      coupon_code: r.coupon_codes?.code ?? null,
    })),
  })
}
