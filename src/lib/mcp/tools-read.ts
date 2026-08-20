import 'server-only'
import { z } from 'zod'
import { and, desc, eq, like, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { attendees, couponCodes, eventAttendees } from '@/lib/db/schema'
import { getActiveEvent } from '@/lib/db/events'
import { csvCell } from '@/lib/csv'
import { getReadiness } from './readiness'
import { text, type ToolServer } from './server-types'

export async function eventStatus() {
  const event = await getActiveEvent()
  const one = async (q: Promise<{ c: number }[]>) => Number((await q)[0]?.c ?? 0)
  const [registrations, checkedIn, claimed, remaining, failedEmails] = await Promise.all([
    one(
      db
        .select({ c: sql<number>`count(*)` })
        .from(eventAttendees)
        .where(eq(eventAttendees.eventId, event.id)),
    ),
    one(
      db
        .select({ c: sql<number>`count(*)` })
        .from(eventAttendees)
        .where(sql`${eventAttendees.eventId} = ${event.id} AND ${eventAttendees.checkedInAt} IS NOT NULL`),
    ),
    one(
      db
        .select({ c: sql<number>`count(*)` })
        .from(eventAttendees)
        .where(sql`${eventAttendees.eventId} = ${event.id} AND ${eventAttendees.couponCodeId} IS NOT NULL`),
    ),
    one(
      db
        .select({ c: sql<number>`count(*)` })
        .from(couponCodes)
        .where(eq(couponCodes.isUsed, false)),
    ),
    one(
      db
        .select({ c: sql<number>`count(*)` })
        .from(eventAttendees)
        .where(sql`${eventAttendees.eventId} = ${event.id} AND ${eventAttendees.emailStatus} = 'failed'`),
    ),
  ])
  return {
    event: event.name,
    date: event.eventDate,
    registrations,
    checkedIn,
    claimed,
    remaining,
    failedEmails,
  }
}

export async function findAttendee(query: string) {
  const event = await getActiveEvent()
  const term = `%${query.trim()}%`
  const rows = await db
    .select()
    .from(eventAttendees)
    .innerJoin(attendees, eq(eventAttendees.attendeeId, attendees.id))
    .leftJoin(couponCodes, eq(eventAttendees.couponCodeId, couponCodes.id))
    .where(
      and(
        eq(eventAttendees.eventId, event.id),
        or(like(attendees.name, term), like(attendees.email, term))!,
      ),
    )
    .orderBy(desc(eventAttendees.registeredAt))
    .limit(25)
  return rows.map((r) => ({
    name: r.attendees.name,
    email: r.attendees.email,
    code: r.coupon_codes?.code ?? null,
    emailStatus: r.event_attendees.emailStatus,
    checkedIn: Boolean(r.event_attendees.checkedInAt),
  }))
}

export async function exportAttendees(view: 'event' | 'people'): Promise<string> {
  if (view === 'people') {
    const rows = await db
      .select({
        name: attendees.name,
        email: attendees.email,
        eventsAttended: sql<number>`count(${eventAttendees.id})`,
      })
      .from(attendees)
      .leftJoin(eventAttendees, eq(eventAttendees.attendeeId, attendees.id))
      .groupBy(attendees.id)
    const header = ['Name', 'Email', 'Events attended']
    return [header, ...rows.map((r) => [r.name, r.email, r.eventsAttended])]
      .map((r) => r.map(csvCell).join(','))
      .join('\n')
  }
  const event = await getActiveEvent()
  const rows = await db
    .select()
    .from(eventAttendees)
    .innerJoin(attendees, eq(eventAttendees.attendeeId, attendees.id))
    .leftJoin(couponCodes, eq(eventAttendees.couponCodeId, couponCodes.id))
    .where(eq(eventAttendees.eventId, event.id))
  const header = ['Name', 'Email', 'Registered At', 'Code', 'Source']
  return [
    header,
    ...rows.map((r) => [
      r.attendees.name,
      r.attendees.email,
      r.event_attendees.registeredAt,
      r.coupon_codes?.code ?? '',
      r.event_attendees.source,
    ]),
  ]
    .map((r) => r.map(csvCell).join(','))
    .join('\n')
}

export function registerReadTools(server: ToolServer) {
  server.registerTool(
    'readiness_check',
    {
      title: 'Check event readiness',
      description:
        'Check whether this Cafe Cursor deployment is ready to hand out credits: event date, code inventory, email configuration, Luma connection, and claim portal state. Call this before an event.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => text(await getReadiness()),
  )

  server.registerTool(
    'event_status',
    {
      title: 'Live event counts',
      description:
        'Live counts for the active event: registrations, check-ins, credits claimed, codes remaining, and failed emails.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => text(await eventStatus()),
  )

  server.registerTool(
    'find_attendee',
    {
      title: 'Find an attendee',
      description:
        'Find attendees of the active event by partial name or email. Returns their assigned code, email status, and check-in state.',
      inputSchema: { query: z.string().min(1).describe('Partial name or email to search for') },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => text(await findAttendee(query)),
  )

  server.registerTool(
    'export_attendees',
    {
      title: 'Export attendees as CSV',
      description:
        'Export attendees as CSV. Use view "event" for the active event, or "people" for everyone across all events.',
      inputSchema: { view: z.enum(['event', 'people']).default('event') },
      annotations: { readOnlyHint: true },
    },
    async ({ view }) => text(await exportAttendees(view)),
  )
}
