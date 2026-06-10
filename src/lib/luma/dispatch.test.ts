/**
 * Guards the expensive bugs in `dispatchLumaCoupons`, now that it operates on
 * per-event participations (event_attendees) instead of luma_guests:
 *   1. A participation that already holds a coupon must not burn a second code.
 *   2. Only Luma-sourced participations are dispatched (website/manual left alone).
 *   3. Reservation stops cleanly when inventory is exhausted.
 *
 * Email isn't configured here, so `canSendEmail` is false and we exercise the
 * assignment/dedup path (sends are recorded as 'skipped').
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { attendees, couponCodes, eventAttendees, events, appSettings } from '@/lib/db/schema'
import {
  findOrCreatePerson,
  createParticipation,
  reserveCouponForParticipation,
} from '@/lib/db/participation'
import { dispatchLumaCoupons } from './sync'

let eventId: number

beforeEach(async () => {
  await db.delete(eventAttendees)
  await db.delete(events)
  await db.delete(attendees)
  await db.delete(couponCodes)
  await db.delete(appSettings)
  // Singleton settings with no email provider configured.
  await db.insert(appSettings).values({ cityName: 'Testville', timezone: 'UTC' })
  const [ev] = await db.insert(events).values({ name: 'Test', status: 'active' }).returning()
  eventId = ev.id
})

describe('dispatchLumaCoupons', () => {
  it('reserves a fresh code for a luma participation with no coupon', async () => {
    const [fresh] = await db.insert(couponCodes).values({ code: 'FRESH' }).returning()
    const person = await findOrCreatePerson({ name: 'New Guest', email: 'new@example.com' })
    const part = await createParticipation({ eventId, attendeeId: person.id, source: 'luma' })

    const result = await dispatchLumaCoupons(eventId)

    expect(result.assigned).toBe(1)
    const [row] = await db.select().from(eventAttendees).where(eq(eventAttendees.id, part.id))
    expect(row.couponCodeId).toBe(fresh.id)
    const [code] = await db.select().from(couponCodes).where(eq(couponCodes.id, fresh.id))
    expect(code.isUsed).toBe(true)
  })

  it('does not burn a second code for a participation that already holds one', async () => {
    await db.insert(couponCodes).values({ code: 'OWNED' }) // claimed below
    await db.insert(couponCodes).values({ code: 'SPARE' }) // must stay available
    const person = await findOrCreatePerson({ name: 'Dup Person', email: 'dup@example.com' })
    const part = await createParticipation({ eventId, attendeeId: person.id, source: 'luma' })
    // Already claimed a code (e.g. at /claim before sync ran) — takes OWNED.
    await reserveCouponForParticipation(part.id)

    const result = await dispatchLumaCoupons(eventId)

    expect(result.assigned).toBe(0)
    const [spare] = await db.select().from(couponCodes).where(eq(couponCodes.code, 'SPARE'))
    expect(spare.isUsed).toBe(false)
  })

  it('leaves non-luma participations untouched', async () => {
    await db.insert(couponCodes).values({ code: 'WEBONLY' })
    const person = await findOrCreatePerson({ name: 'Web Person', email: 'web@example.com' })
    await createParticipation({ eventId, attendeeId: person.id, source: 'website' })

    const result = await dispatchLumaCoupons(eventId)

    expect(result.assigned).toBe(0)
    const [code] = await db.select().from(couponCodes).where(eq(couponCodes.code, 'WEBONLY'))
    expect(code.isUsed).toBe(false)
  })

  it('stops assigning when inventory is exhausted', async () => {
    await db.insert(couponCodes).values({ code: 'ONLYONE' })
    const p1 = await findOrCreatePerson({ name: 'A', email: 'a@example.com' })
    const p2 = await findOrCreatePerson({ name: 'B', email: 'b@example.com' })
    await createParticipation({ eventId, attendeeId: p1.id, source: 'luma' })
    await createParticipation({ eventId, attendeeId: p2.id, source: 'luma' })

    const result = await dispatchLumaCoupons(eventId)

    expect(result.assigned).toBe(1)
    const used = await db.select().from(couponCodes).where(eq(couponCodes.isUsed, true))
    expect(used).toHaveLength(1)
  })
})
