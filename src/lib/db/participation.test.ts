import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { attendees, couponCodes, eventAttendees, events } from './schema'
import {
  findOrCreatePerson,
  getParticipation,
  createParticipation,
  reserveCouponForParticipation,
  recordEmailResult,
} from './participation'

describe('participation helpers', () => {
  let eventId: number

  beforeEach(async () => {
    await db.delete(eventAttendees)
    await db.delete(events)
    await db.delete(attendees)
    await db.delete(couponCodes)
    const [ev] = await db.insert(events).values({ name: 'Test', status: 'active' }).returning()
    eventId = ev.id
  })

  it('findOrCreatePerson is idempotent by lowercased email', async () => {
    const a = await findOrCreatePerson({ name: 'María', email: 'Maria@example.com' })
    const b = await findOrCreatePerson({ name: 'M.', email: 'maria@EXAMPLE.com' })
    expect(b.id).toBe(a.id)
    expect(b.email).toBe('maria@example.com')
  })

  it('same person can participate in two events, once each', async () => {
    const person = await findOrCreatePerson({ name: 'Ana', email: 'ana@x.com' })
    const [ev2] = await db.insert(events).values({ name: 'Next month' }).returning()
    await createParticipation({ eventId, attendeeId: person.id })
    await createParticipation({ eventId: ev2.id, attendeeId: person.id })
    expect(await getParticipation(eventId, person.id)).toBeDefined()
    expect(await getParticipation(ev2.id, person.id)).toBeDefined()
    // Duplicate within the same event violates the unique index.
    await expect(createParticipation({ eventId, attendeeId: person.id })).rejects.toThrow()
  })

  it('reserveCouponForParticipation is race-safe and links the code', async () => {
    await db.insert(couponCodes).values(
      Array.from({ length: 5 }, (_, i) => ({ code: `RACE-${i}` })),
    )
    const people = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        findOrCreatePerson({ name: `P${i}`, email: `p${i}@x.com` }),
      ),
    )
    const parts = await Promise.all(
      people.map((p) => createParticipation({ eventId, attendeeId: p.id })),
    )
    const coupons = await Promise.all(parts.map((p) => reserveCouponForParticipation(p.id)))
    const won = coupons.filter(Boolean)
    expect(won).toHaveLength(5)
    expect(new Set(won.map((c) => c!.id)).size).toBe(5)
  })

  it('recordEmailResult stores failure reason and clears it on success', async () => {
    const person = await findOrCreatePerson({ name: 'B', email: 'b@x.com' })
    const part = await createParticipation({ eventId, attendeeId: person.id })
    await recordEmailResult(part.id, 'failed', 'boom')
    let [row] = await db.select().from(eventAttendees).where(eq(eventAttendees.id, part.id))
    expect(row.emailStatus).toBe('failed')
    expect(row.emailError).toBe('boom')
    await recordEmailResult(part.id, 'sent')
    ;[row] = await db.select().from(eventAttendees).where(eq(eventAttendees.id, part.id))
    expect(row.emailStatus).toBe('sent')
    expect(row.emailError).toBeNull()
    expect(row.emailSentAt).toBeTruthy()
  })
})
