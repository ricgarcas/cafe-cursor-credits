/**
 * Guards the two expensive bugs in `dispatchLumaCoupons`:
 *   1. A guest whose email already holds a coupon must reuse it, not burn a
 *      second code (no double credit handout).
 *   2. Assigning must not clobber a coupon the mirrored attendee already holds.
 *
 * Email isn't configured here, so `canSendEmail` is false and we only exercise
 * the assignment/dedup path.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { attendees, couponCodes, lumaGuests, appSettings } from '@/lib/db/schema'
import { dispatchLumaCoupons } from './sync'

const EVENT = 'evt-test'

beforeEach(async () => {
  await db.delete(lumaGuests)
  await db.delete(attendees)
  await db.delete(couponCodes)
  await db.delete(appSettings)
  // Singleton settings with no email provider configured.
  await db.insert(appSettings).values({ cityName: 'Testville', timezone: 'UTC' })
})

describe('dispatchLumaCoupons', () => {
  it('reuses the coupon an existing attendee already holds', async () => {
    const [c1] = await db.insert(couponCodes).values({ code: 'OWNED' }).returning()
    await db.insert(couponCodes).values({ code: 'SPARE' }) // available
    // Website attendee already claimed OWNED.
    await db
      .update(couponCodes)
      .set({ isUsed: true, usedAt: new Date().toISOString(), usedByType: 'attendee' })
      .where(eq(couponCodes.id, c1.id))
    await db.insert(attendees).values({
      name: 'Dup Person',
      email: 'dup@example.com',
      source: 'website',
      couponCodeId: c1.id,
    })
    // Same person shows up as a confirmed Luma guest with no coupon.
    await db.insert(lumaGuests).values({
      apiId: 'g1',
      eventApiId: EVENT,
      name: 'Dup Person',
      email: 'dup@example.com',
      registrationStatus: 'confirmed',
    })

    await dispatchLumaCoupons(EVENT)

    const [guest] = await db.select().from(lumaGuests).where(eq(lumaGuests.apiId, 'g1'))
    expect(guest.couponCodeId).toBe(c1.id) // reused, not SPARE

    // SPARE must remain unused — no second code was burned.
    const [spare] = await db.select().from(couponCodes).where(eq(couponCodes.code, 'SPARE'))
    expect(spare.isUsed).toBe(false)

    // Attendee still holds the original coupon, not overwritten.
    const [att] = await db.select().from(attendees).where(eq(attendees.email, 'dup@example.com'))
    expect(att.couponCodeId).toBe(c1.id)
  })

  it('skips confirmed guests still pending host approval', async () => {
    await db.insert(couponCodes).values({ code: 'GATED' })
    await db.insert(lumaGuests).values({
      apiId: 'g3',
      eventApiId: EVENT,
      name: 'Pending Person',
      email: 'pending@example.com',
      registrationStatus: 'confirmed',
      approvalStatus: 'pending_approval',
    })

    const result = await dispatchLumaCoupons(EVENT)

    expect(result.assigned).toBe(0)
    const [guest] = await db.select().from(lumaGuests).where(eq(lumaGuests.apiId, 'g3'))
    expect(guest.couponCodeId).toBeNull()
    const [code] = await db.select().from(couponCodes).where(eq(couponCodes.code, 'GATED'))
    expect(code.isUsed).toBe(false)
  })

  it('credits an approved guest on a gated event', async () => {
    await db.insert(couponCodes).values({ code: 'OKGATED' })
    await db.insert(lumaGuests).values({
      apiId: 'g4',
      eventApiId: EVENT,
      name: 'Approved Person',
      email: 'approved@example.com',
      registrationStatus: 'confirmed',
      approvalStatus: 'approved',
    })

    const result = await dispatchLumaCoupons(EVENT)
    expect(result.assigned).toBe(1)
  })

  it('reserves a fresh code for a guest with no prior coupon', async () => {
    const [fresh] = await db.insert(couponCodes).values({ code: 'FRESH' }).returning()
    await db.insert(lumaGuests).values({
      apiId: 'g2',
      eventApiId: EVENT,
      name: 'New Guest',
      email: 'new@example.com',
      registrationStatus: 'confirmed',
    })

    const result = await dispatchLumaCoupons(EVENT)

    expect(result.assigned).toBe(1)
    const [guest] = await db.select().from(lumaGuests).where(eq(lumaGuests.apiId, 'g2'))
    expect(guest.couponCodeId).toBe(fresh.id)
    const [code] = await db.select().from(couponCodes).where(eq(couponCodes.id, fresh.id))
    expect(code.isUsed).toBe(true)
    expect(code.usedByType).toBe('luma_guest')
  })
})
