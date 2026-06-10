import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { db } from './client'
import {
  attendees,
  couponCodes,
  eventAttendees,
  type Attendee,
  type CouponCode,
  type EventAttendee,
} from './schema'

export async function findOrCreatePerson(params: {
  name: string
  email: string
}): Promise<Attendee> {
  const email = params.email.toLowerCase()
  const [existing] = await db.select().from(attendees).where(eq(attendees.email, email)).limit(1)
  if (existing) return existing
  const [row] = await db.insert(attendees).values({ name: params.name, email }).returning()
  return row
}

export async function getParticipation(
  eventId: number,
  attendeeId: number,
): Promise<EventAttendee | undefined> {
  const [row] = await db
    .select()
    .from(eventAttendees)
    .where(and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.attendeeId, attendeeId)))
    .limit(1)
  return row
}

export async function createParticipation(params: {
  eventId: number
  attendeeId: number
  source?: 'manual' | 'luma' | 'website'
  lumaGuestId?: string | null
  registeredAt?: string
}): Promise<EventAttendee> {
  const [row] = await db
    .insert(eventAttendees)
    .values({
      eventId: params.eventId,
      attendeeId: params.attendeeId,
      source: params.source ?? 'website',
      lumaGuestId: params.lumaGuestId ?? null,
      ...(params.registeredAt ? { registeredAt: params.registeredAt } : {}),
    })
    .returning()
  return row
}

/**
 * Atomically reserve the next unused code and link it to the participation.
 * The single UPDATE…WHERE id = (SELECT … LIMIT 1) keeps concurrent claims from
 * double-spending a code; no interactive transaction (libsql's local driver
 * throws SQLITE_BUSY when write transactions overlap across awaits).
 * Returns null when inventory is exhausted.
 */
export async function reserveCouponForParticipation(
  participationId: number,
): Promise<CouponCode | null> {
  const now = new Date().toISOString()
  const [coupon] = await db
    .update(couponCodes)
    .set({ isUsed: true, usedAt: now, updatedAt: now })
    .where(
      sql`${couponCodes.id} = (
        SELECT id FROM ${couponCodes}
        WHERE ${couponCodes.isUsed} = 0 AND ${couponCodes.usedAt} IS NULL
        LIMIT 1
      )`,
    )
    .returning()
  if (!coupon) return null
  await db
    .update(eventAttendees)
    .set({ couponCodeId: coupon.id, updatedAt: now })
    .where(eq(eventAttendees.id, participationId))
  return coupon
}

export async function recordEmailResult(
  participationId: number,
  status: 'sent' | 'failed' | 'skipped',
  error?: string,
): Promise<void> {
  const now = new Date().toISOString()
  await db
    .update(eventAttendees)
    .set({
      emailStatus: status,
      emailError: status === 'failed' ? (error ?? 'Unknown error') : null,
      ...(status === 'sent' ? { emailSentAt: now } : {}),
      updatedAt: now,
    })
    .where(eq(eventAttendees.id, participationId))
}
