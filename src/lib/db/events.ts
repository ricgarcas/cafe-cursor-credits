import 'server-only'
import { desc, eq } from 'drizzle-orm'
import { db, ensureDefaultSettings } from './client'
import { getSession } from '@/lib/auth/session'
import { appSettings, events, type Event } from './schema'

/** Ensure at least one event exists. Mirrors ensureDefaultSettings(). Idempotent. */
export async function ensureDefaultEvent(): Promise<void> {
  const existing = await db.select({ id: events.id }).from(events).limit(1)
  if (existing.length > 0) return
  await ensureDefaultSettings()
  const [settings] = await db.select().from(appSettings).limit(1)
  const city = settings?.cityName ?? 'Cafe Cursor'
  await db.insert(events).values({
    name: city.startsWith('Cafe Cursor') ? city : `Cafe Cursor ${city}`,
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
