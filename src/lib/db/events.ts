import 'server-only'
import { desc, eq } from 'drizzle-orm'
import { db, ensureDefaultSettings } from './client'
import { getSession } from '@/lib/auth/session'
import { appSettings, events, type Event } from './schema'

/** A name that carries no city — "Cafe Cursor" alone tells an organizer nothing. */
export function isGenericEventName(name: string): boolean {
  return name.trim().toLowerCase() === 'cafe cursor'
}

/** The name a default event should carry for a given city. */
export function defaultEventName(city: string | null | undefined): string {
  const c = (city ?? '').trim()
  if (!c || isGenericEventName(c)) return 'Cafe Cursor'
  return c.toLowerCase().startsWith('cafe cursor') ? c : `Cafe Cursor ${c}`
}

/**
 * The bootstrap event is created before onboarding knows the city, so it lands
 * as plain "Cafe Cursor". Once a city exists, adopt it — otherwise the event
 * switcher shows "Cafe Cursor" forever with no way to tell editions apart.
 */
export async function adoptCityIntoGenericEvents(city: string): Promise<void> {
  const name = defaultEventName(city)
  if (isGenericEventName(name)) return
  const rows = await db.select().from(events)
  const now = new Date().toISOString()
  for (const row of rows) {
    if (!isGenericEventName(row.name)) continue
    await db.update(events).set({ name, updatedAt: now }).where(eq(events.id, row.id))
  }
}

/** Ensure at least one event exists. Mirrors ensureDefaultSettings(). Idempotent. */
export async function ensureDefaultEvent(): Promise<void> {
  const existing = await db.select({ id: events.id }).from(events).limit(1)
  if (existing.length > 0) return
  await ensureDefaultSettings()
  const [settings] = await db.select().from(appSettings).limit(1)
  await db.insert(events).values({
    name: defaultEventName(settings?.cityName),
    status: 'active',
  })
}

/** The event public pages bind to. Self-heals if every event got archived. */
export async function getActiveEvent(): Promise<Event> {
  await ensureDefaultEvent()
  const [active] = await db.select().from(events).where(eq(events.status, 'active')).limit(1)
  if (active) return active
  const [latest] = await db
    .select()
    .from(events)
    .orderBy(desc(events.createdAt), desc(events.id))
    .limit(1)
  const now = new Date().toISOString()
  await db.update(events).set({ status: 'active', updatedAt: now }).where(eq(events.id, latest.id))
  return { ...latest, status: 'active', updatedAt: now }
}

export async function setActiveEvent(id: number): Promise<void> {
  const now = new Date().toISOString()
  await db.update(events).set({ status: 'archived', updatedAt: now }).where(eq(events.status, 'active'))
  await db.update(events).set({ status: 'active', updatedAt: now }).where(eq(events.id, id))
}

export async function getEventById(id: number): Promise<Event | undefined> {
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1)
  return row
}

/** The event the signed-in admin is viewing. Falls back to the active event. */
export async function getSelectedEvent(): Promise<Event> {
  const session = await getSession()
  if (session.selectedEventId) {
    const row = await getEventById(session.selectedEventId)
    if (row) return row
  }
  return getActiveEvent()
}
