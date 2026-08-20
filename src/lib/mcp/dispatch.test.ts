import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { appSettings, attendees, couponCodes, events, eventAttendees } from '@/lib/db/schema'
import { projectDispatch, runDispatch } from './dispatch'

vi.mock('@/lib/emails/send-coupon-email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/emails/send-coupon-email')>()
  return { ...actual, sendCouponEmail: vi.fn(async () => ({ success: true, data: { id: 'x' } })) }
})

async function seed({ guests, codes }: { guests: number; codes: number }) {
  await db.insert(appSettings).values({
    cityName: 'CDMX',
    emailProvider: 'resend',
    resendApiKey: 're_test',
  })
  const [event] = await db
    .insert(events)
    .values({ name: 'Cafe Cursor CDMX', status: 'active' })
    .returning()
  for (let i = 0; i < guests; i++) {
    const [person] = await db
      .insert(attendees)
      .values({ name: `Guest ${i}`, email: `g${i}@example.com` })
      .returning()
    await db
      .insert(eventAttendees)
      .values({ eventId: event.id, attendeeId: person.id, source: 'luma' })
  }
  for (let i = 0; i < codes; i++) {
    await db.insert(couponCodes).values({ code: `CODE${i}` })
  }
  return event
}

async function wipe() {
  await db.delete(eventAttendees)
  await db.delete(attendees)
  await db.delete(couponCodes)
  await db.delete(events)
  await db.delete(appSettings)
}

describe('projectDispatch', () => {
  beforeEach(wipe)

  it('projects without writing anything', async () => {
    await seed({ guests: 3, codes: 5 })
    const p = await projectDispatch('luma')
    expect(p.wouldEmail).toBe(3)
    expect(p.wouldBurn).toBe(3)
    expect(p.remainingAfter).toBe(2)
    expect(p.shortfall).toBe(0)
    const [used] = await db
      .select()
      .from(couponCodes)
      .where(eq(couponCodes.isUsed, true))
      .limit(1)
    expect(used).toBeUndefined()
  })

  it('reports a shortfall when codes run short', async () => {
    await seed({ guests: 5, codes: 2 })
    const p = await projectDispatch('luma')
    expect(p.wouldBurn).toBe(2)
    expect(p.shortfall).toBe(3)
  })
})

describe('runDispatch', () => {
  beforeEach(wipe)

  it('assigns and emails every pending guest', async () => {
    await seed({ guests: 3, codes: 5 })
    const r = await runDispatch('luma')
    expect(r.assigned).toBe(3)
    expect(r.emailed).toBe(3)
    expect(r.failed).toHaveLength(0)
    expect(r.outOfCodes).toBe(false)
  })

  it('stops cleanly and flags outOfCodes when inventory runs out', async () => {
    await seed({ guests: 4, codes: 2 })
    const r = await runDispatch('luma')
    expect(r.assigned).toBe(2)
    expect(r.outOfCodes).toBe(true)
  })

  it('is idempotent — a second run assigns nothing new', async () => {
    await seed({ guests: 2, codes: 5 })
    await runDispatch('luma')
    const second = await runDispatch('luma')
    expect(second.assigned).toBe(0)
  })
})
