import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { events, eventAttendees, appSettings } from './schema'
import {
  adoptCityIntoGenericEvents,
  defaultEventName,
  ensureDefaultEvent,
  getActiveEvent,
  isGenericEventName,
  setActiveEvent,
} from './events'

describe('event lifecycle helpers', () => {
  beforeEach(async () => {
    await db.delete(eventAttendees)
    await db.delete(events)
    await db.delete(appSettings)
  })

  it('ensureDefaultEvent creates one active event from the city name, idempotently', async () => {
    await db.insert(appSettings).values({ cityName: 'CDMX', onboarded: true })
    await ensureDefaultEvent()
    await ensureDefaultEvent()
    const rows = await db.select().from(events)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('active')
    expect(rows[0].name).toBe('Cafe Cursor CDMX')
  })

  it('getActiveEvent promotes the newest event when none is active', async () => {
    await db.insert(events).values([
      { name: 'Old', status: 'archived' },
      { name: 'New', status: 'archived' },
    ])
    const active = await getActiveEvent()
    expect(active.name).toBe('New')
    expect(active.status).toBe('active')
  })

  it('setActiveEvent archives the previous active event', async () => {
    const [a] = await db.insert(events).values({ name: 'A', status: 'active' }).returning()
    const [b] = await db.insert(events).values({ name: 'B', status: 'draft' }).returning()
    await setActiveEvent(b.id)
    const [rowA] = await db.select().from(events).where(eq(events.id, a.id))
    const [rowB] = await db.select().from(events).where(eq(events.id, b.id))
    expect(rowA.status).toBe('archived')
    expect(rowB.status).toBe('active')
  })
})

describe('event naming', () => {
  beforeEach(async () => {
    await db.delete(eventAttendees)
    await db.delete(events)
    await db.delete(appSettings)
  })

  it('defaultEventName prefixes a plain city and leaves prefixed ones alone', () => {
    expect(defaultEventName('CDMX')).toBe('Cafe Cursor CDMX')
    expect(defaultEventName('Cafe Cursor Toronto')).toBe('Cafe Cursor Toronto')
  })

  it('defaultEventName stays generic when no real city is set', () => {
    expect(defaultEventName('Cafe Cursor')).toBe('Cafe Cursor')
    expect(defaultEventName('')).toBe('Cafe Cursor')
    expect(defaultEventName(null)).toBe('Cafe Cursor')
  })

  it('isGenericEventName only matches the bare wordmark', () => {
    expect(isGenericEventName('Cafe Cursor')).toBe(true)
    expect(isGenericEventName('  cafe cursor ')).toBe(true)
    expect(isGenericEventName('Cafe Cursor CDMX')).toBe(false)
  })

  it('adopts the city into events still named generically', async () => {
    await db.insert(events).values({ name: 'Cafe Cursor', status: 'active' })
    await db.insert(events).values({ name: 'Cafe Cursor — July', status: 'draft' })
    await adoptCityIntoGenericEvents('CDMX')
    const rows = await db.select().from(events)
    const names = rows.map((r) => r.name).sort()
    expect(names).toEqual(['Cafe Cursor CDMX', 'Cafe Cursor — July'])
  })

  it('is a no-op when the city itself is still generic', async () => {
    await db.insert(events).values({ name: 'Cafe Cursor', status: 'active' })
    await adoptCityIntoGenericEvents('Cafe Cursor')
    const [row] = await db.select().from(events)
    expect(row.name).toBe('Cafe Cursor')
  })
})
