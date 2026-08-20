import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db/client'
import { appSettings, attendees, couponCodes, events, eventAttendees } from '@/lib/db/schema'
import { eventStatus, findAttendee, exportAttendees } from './tools-read'

async function seed() {
  await db.insert(appSettings).values({ cityName: 'CDMX' })
  const [event] = await db
    .insert(events)
    .values({ name: 'Cafe Cursor CDMX', eventDate: '2026-09-12', status: 'active' })
    .returning()
  const [code] = await db.insert(couponCodes).values({ code: 'ABC123', isUsed: true }).returning()
  await db.insert(couponCodes).values({ code: 'FREE1' })
  const [ada] = await db
    .insert(attendees)
    .values({ name: 'Ada Lovelace', email: 'ada@example.com' })
    .returning()
  await db.insert(eventAttendees).values({
    eventId: event.id,
    attendeeId: ada.id,
    couponCodeId: code.id,
    emailStatus: 'sent',
    checkedInAt: new Date().toISOString(),
  })
  return event
}

async function wipe() {
  await db.delete(eventAttendees)
  await db.delete(attendees)
  await db.delete(couponCodes)
  await db.delete(events)
  await db.delete(appSettings)
}

describe('eventStatus', () => {
  beforeEach(wipe)

  it('counts registrations, check-ins, claims and remaining codes', async () => {
    await seed()
    const s = await eventStatus()
    expect(s.registrations).toBe(1)
    expect(s.checkedIn).toBe(1)
    expect(s.claimed).toBe(1)
    expect(s.remaining).toBe(1)
    expect(s.date).toBe('2026-09-12')
  })
})

describe('findAttendee', () => {
  beforeEach(wipe)

  it('matches on partial name, case-insensitively', async () => {
    await seed()
    const hits = await findAttendee('ada')
    expect(hits).toHaveLength(1)
    expect(hits[0].code).toBe('ABC123')
    expect(hits[0].checkedIn).toBe(true)
  })

  it('matches on email', async () => {
    await seed()
    expect(await findAttendee('ada@example.com')).toHaveLength(1)
  })

  it('returns an empty list when nothing matches', async () => {
    await seed()
    expect(await findAttendee('nobody')).toHaveLength(0)
  })
})

describe('exportAttendees', () => {
  beforeEach(wipe)

  it('emits a header row and one row per attendee', async () => {
    await seed()
    const lines = (await exportAttendees('event')).trim().split('\n')
    expect(lines[0]).toContain('Name')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('Ada Lovelace')
  })
})
