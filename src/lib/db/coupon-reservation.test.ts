/**
 * Integration test — proves the atomic coupon-reservation pattern is race-safe.
 *
 * The same SQL pattern is used in /api/register, /api/claim, and
 * luma sync `dispatchLumaCoupons`. If this test breaks, one of those flows
 * is about to hand the same code to two attendees.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import { db } from './client'
import { couponCodes } from './schema'

async function reserveOne() {
  const now = new Date().toISOString()
  const [coupon] = await db
    .update(couponCodes)
    .set({
      isUsed: true,
      usedAt: now,
      updatedAt: now,
    })
    .where(
      sql`${couponCodes.id} = (
        SELECT id FROM ${couponCodes}
        WHERE ${couponCodes.isUsed} = 0 AND ${couponCodes.usedAt} IS NULL
        LIMIT 1
      )`,
    )
    .returning()
  return coupon
}

describe('atomic coupon reservation', () => {
  beforeEach(async () => {
    await db.delete(couponCodes)
  })

  it('assigns each available code to at most one caller', async () => {
    // Seed 10 codes.
    await db.insert(couponCodes).values(
      Array.from({ length: 10 }, (_, i) => ({ code: `CODE-${i.toString().padStart(3, '0')}` })),
    )

    // Fire 50 concurrent reservations; only 10 should succeed.
    const results = await Promise.all(Array.from({ length: 50 }, () => reserveOne()))
    const assigned = results.filter(Boolean)
    expect(assigned.length).toBe(10)

    // Every assigned code must be unique.
    const uniqueIds = new Set(assigned.map((c) => c!.id))
    expect(uniqueIds.size).toBe(10)

    // The remaining 40 calls must have received `undefined` (no rows to update).
    const misses = results.filter((r) => !r)
    expect(misses.length).toBe(40)
  })

  it('returns undefined when the inventory is empty', async () => {
    const coupon = await reserveOne()
    expect(coupon).toBeUndefined()
  })

  it('marks reserved codes as used with timestamps', async () => {
    await db.insert(couponCodes).values([{ code: 'ONE' }])
    const coupon = await reserveOne()
    expect(coupon?.isUsed).toBe(true)
    expect(coupon?.usedAt).toBeTruthy()

    // Double-check the row in the DB reflects the update.
    const [row] = await db
      .select()
      .from(couponCodes)
      .where(eq(couponCodes.id, coupon!.id))
    expect(row.isUsed).toBe(true)
  })
})
