# Event-Centric Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cafe Cursor event-centric (people + code pool persist across events; participation is per-event) and close the event-day gaps: open claim portal, no co-hosts, no password recovery, silent email failures, no check-in, no inventory warning, no attendee editing, no onboarding follow-through.

**Architecture:** Three phases, each shippable alone. Phase 1 builds the event foundation (new `events` + `event_attendees` tables, all flows rewritten onto participation rows, legacy columns dropped last with an idempotent upgrade script). Phase 2 adds roles, team management, and password recovery. Phase 3 layers the day-of features on the new model.

**Tech stack:** Next.js 16 App Router, Drizzle ORM + `@libsql/client` (NOT better-sqlite3 — CLAUDE.md is stale on this), iron-session, zod, vitest. Tests run against the dev DB via the real `db` client (see `src/lib/db/coupon-reservation.test.ts` for the pattern: `beforeEach` deletes rows, then exercises real queries).

**Spec:** `docs/superpowers/specs/2026-06-10-event-centric-release-design.md`. One deviation, decided here: spec §13 called for drizzle versioned migrations; we instead keep `db:push` and ship a single idempotent upgrade script (`scripts/migrate-events.mjs`) that runs before push on boot. Same safety, far less machinery on a one-DB app. Task 11 implements it; Task 24 amends the spec.

**Conventions reminders (from AGENTS.md):** every admin route starts with `requireUser()`; DTOs are snake_case; no module-scope DB access; pill buttons; no shadows; one-line comments only.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/lib/db/schema.ts` | modify | add `events`, `eventAttendees`; user/settings columns; drop legacy columns (Task 11) |
| `src/lib/db/events.ts` | create | event lifecycle helpers (`ensureDefaultEvent`, `getActiveEvent`, `setActiveEvent`, `getSelectedEvent`) |
| `src/lib/db/participation.ts` | create | person + participation + coupon-reservation + email-result helpers |
| `src/lib/rate-limit.ts` | create | in-memory per-IP limiter |
| `src/lib/auth/guard.ts` | modify | optional admin-role gate |
| `src/lib/auth/users.ts` | modify | role/temp-password/reset-token helpers |
| `src/lib/emails/send-coupon-email.ts` | modify | extract generic `sendAppEmail` |
| `src/lib/luma/sync.ts` | modify | participation-based mirror/dispatch, check-in mapping |
| `src/app/api/register/route.ts`, `src/app/api/claim/route.ts` | modify | active-event flows |
| `src/app/api/admin/{attendees,coupons,assign-coupon,import-attendees,send-email}/…` | modify | event-lens scoping |
| `src/app/api/admin/events/…`, `src/app/api/admin/selected-event/route.ts` | create | event CRUD + switcher session |
| `src/app/api/admin/users/…` | create | team management |
| `src/app/api/auth/{forgot-password,reset-password,change-password}/route.ts` | create | recovery flows |
| `src/app/api/admin/claim-toggle/route.ts` | create | host-accessible claim switch |
| `src/app/api/admin/attendees/[id]/{checkin,reassign}/route.ts` | create | day-of actions |
| `src/components/admin/event-switcher.tsx` | create | sidebar switcher + new-event dialog |
| `src/components/admin/getting-started.tsx` | create | dashboard checklist |
| `src/components/admin/team-client.tsx` + `src/app/admin/team/page.tsx` | create | team page |
| `src/app/{forgot-password,reset-password,change-password}/page.tsx` | create | public recovery pages |
| `scripts/migrate-events.mjs`, `scripts/reset-password.mjs` | create | legacy upgrade; break-glass reset |
| `railway.json`, `scripts/seed.mjs`, `README.md`, `AGENTS.md` | modify | boot order, seeds, docs |

---

# Phase 1 — Event foundation

### Task 1: Additive schema — events, participation, user/settings columns

**Files:**
- Modify: `src/lib/db/schema.ts`

Legacy columns stay for now (`attendees.couponCodeId/source/lumaGuestId/lumaEventId/registeredAt`, `couponCodes.usedByType`, `appSettings.lumaEventId`) so every commit keeps building; they drop in Task 11.

- [ ] **Step 1: Add the two new tables** (place after `appSettings` in `src/lib/db/schema.ts`)

```ts
/** Local meetup editions. Exactly one row is 'active' at a time (app-enforced). */
export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    eventDate: text('event_date'),
    status: text('status', { enum: ['draft', 'active', 'archived'] })
      .notNull()
      .default('draft'),
    claimPasscode: text('claim_passcode'),
    lumaEventApiId: text('luma_event_api_id'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    statusIdx: index('events_status_idx').on(t.status),
  }),
)

/** One row per person per event — coupon, check-in, and email state live here. */
export const eventAttendees = sqliteTable(
  'event_attendees',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    attendeeId: integer('attendee_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),
    source: text('source', { enum: ['manual', 'luma', 'website'] })
      .notNull()
      .default('website'),
    registeredAt: text('registered_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    couponCodeId: integer('coupon_code_id').references(() => couponCodes.id, {
      onDelete: 'set null',
    }),
    lumaGuestId: text('luma_guest_id'),
    checkedInAt: text('checked_in_at'),
    emailStatus: text('email_status', { enum: ['sent', 'failed', 'skipped'] }),
    emailError: text('email_error'),
    emailSentAt: text('email_sent_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    eventAttendeeIdx: uniqueIndex('event_attendees_event_attendee_unique').on(
      t.eventId,
      t.attendeeId,
    ),
    eventIdx: index('event_attendees_event_idx').on(t.eventId),
    couponIdx: index('event_attendees_coupon_idx').on(t.couponCodeId),
  }),
)
```

- [ ] **Step 2: Extend `users` and `appSettings`**

Inside the `users` table definition, after `passwordHash`:

```ts
    role: text('role', { enum: ['admin', 'host'] }).notNull().default('admin'),
    mustChangePassword: integer('must_change_password', { mode: 'boolean' })
      .notNull()
      .default(false),
    resetTokenHash: text('reset_token_hash'),
    resetTokenExpiresAt: text('reset_token_expires_at'),
```

Inside `appSettings`, after `claimEnabled`:

```ts
  checklistDismissed: integer('checklist_dismissed', { mode: 'boolean' })
    .notNull()
    .default(false),
```

- [ ] **Step 3: Add types and relations** (bottom of schema.ts, with the others)

```ts
export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert
export type EventAttendee = typeof eventAttendees.$inferSelect
export type NewEventAttendee = typeof eventAttendees.$inferInsert

export const eventAttendeesRelations = relations(eventAttendees, ({ one }) => ({
  event: one(events, { fields: [eventAttendees.eventId], references: [events.id] }),
  attendee: one(attendees, { fields: [eventAttendees.attendeeId], references: [attendees.id] }),
  couponCode: one(couponCodes, {
    fields: [eventAttendees.couponCodeId],
    references: [couponCodes.id],
  }),
}))
```

- [ ] **Step 4: Push and verify**

Run: `npm run db:push && npm run build`
Expected: push reports new tables/columns, build passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(db): add events + event_attendees, user roles, reset-token columns (additive)"
```

### Task 2: Event lifecycle helpers

**Files:**
- Create: `src/lib/db/events.ts`
- Test: `src/lib/db/events.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { events, eventAttendees, appSettings } from './schema'
import { ensureDefaultEvent, getActiveEvent, setActiveEvent } from './events'

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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/db/events.test.ts`
Expected: FAIL — module `./events` not found.

- [ ] **Step 3: Implement `src/lib/db/events.ts`**

```ts
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
```

- [ ] **Step 4: Add `selectedEventId` to the session** — in `src/lib/auth/session.ts`, extend the interface:

```ts
export interface SessionData {
  userId?: number
  email?: string
  name?: string
  selectedEventId?: number
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/db/events.test.ts`
Expected: 3 passing. (`getSelectedEvent` needs request scope — covered by build + later route usage, not unit-tested.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/events.ts src/lib/db/events.test.ts src/lib/auth/session.ts
git commit -m "feat(events): lifecycle helpers + selected-event session field"
```

### Task 3: Participation helpers

**Files:**
- Create: `src/lib/db/participation.ts`
- Test: `src/lib/db/participation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/db/participation.test.ts`
Expected: FAIL — module `./participation` not found.

- [ ] **Step 3: Implement `src/lib/db/participation.ts`**

```ts
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
 * Single UPDATE…WHERE id = (SELECT … LIMIT 1) keeps concurrent claims from
 * double-spending a code. Returns null when inventory is exhausted.
 */
export async function reserveCouponForParticipation(
  participationId: number,
): Promise<CouponCode | null> {
  const now = new Date().toISOString()
  return db.transaction(async (tx) => {
    const [coupon] = await tx
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
    await tx
      .update(eventAttendees)
      .set({ couponCodeId: coupon.id, updatedAt: now })
      .where(eq(eventAttendees.id, participationId))
    return coupon
  })
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/db/participation.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/participation.ts src/lib/db/participation.test.ts
git commit -m "feat(db): participation helpers — person upsert, race-safe coupon reserve, email results"
```

### Task 4: Rewrite `/api/register` onto the active event

**Files:**
- Modify: `src/app/api/register/route.ts` (full replacement below)

- [ ] **Step 1: Replace the route handler**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { appSettings } from '@/lib/db/schema'
import { getActiveEvent } from '@/lib/db/events'
import {
  findOrCreatePerson,
  getParticipation,
  createParticipation,
  reserveCouponForParticipation,
  recordEmailResult,
} from '@/lib/db/participation'
import { sendCouponEmail, canSendEmail } from '@/lib/emails/send-coupon-email'

const schema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    const { name, email } = parsed.data

    const event = await getActiveEvent()
    const person = await findOrCreatePerson({ name, email })

    // Duplicate check is per-event: returning people register fresh next time.
    if (await getParticipation(event.id, person.id)) {
      return NextResponse.json(
        { error: 'This email is already registered' },
        { status: 400 },
      )
    }

    const participation = await createParticipation({
      eventId: event.id,
      attendeeId: person.id,
      source: 'website',
    })

    const coupon = await reserveCouponForParticipation(participation.id)
    let couponAssigned = false

    if (coupon) {
      couponAssigned = true
      const [settings] = await db.select().from(appSettings).limit(1)
      if (canSendEmail(settings)) {
        try {
          await sendCouponEmail({
            settings,
            attendee: { name: person.name, email: person.email },
            couponCode: coupon,
            fromName: `Cafe Cursor ${settings.cityName}`,
          })
          await recordEmailResult(participation.id, 'sent')
        } catch (e) {
          console.error('email send failed', e)
          await recordEmailResult(participation.id, 'failed', e instanceof Error ? e.message : String(e))
        }
      } else {
        await recordEmailResult(participation.id, 'skipped')
      }
    }

    return NextResponse.json({
      success: true,
      couponAssigned,
      message: couponAssigned
        ? 'Registration successful! Check your email for your code.'
        : 'Registration successful!',
    })
  } catch (e) {
    console.error('register error', e)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: passes. Manual smoke (optional): `npm run dev`, POST to `/api/register` twice with the same email — second returns 400.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/register/route.ts
git commit -m "feat(register): bind to active event, per-event duplicates, email results"
```

### Task 5: Rewrite `/api/claim` onto the active event

**Files:**
- Modify: `src/app/api/claim/route.ts` (full replacement)

- [ ] **Step 1: Replace the route handler** (passcode arrives in Task 18 — note the seam)

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { appSettings, couponCodes } from '@/lib/db/schema'
import { getActiveEvent } from '@/lib/db/events'
import {
  findOrCreatePerson,
  getParticipation,
  createParticipation,
  reserveCouponForParticipation,
  recordEmailResult,
} from '@/lib/db/participation'
import { sendCouponEmail, canSendEmail } from '@/lib/emails/send-coupon-email'

const schema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  sendEmail: z.boolean().optional().default(false),
})

/** Self-service on-site claim. Idempotent per email per event. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    const { name, email, sendEmail } = parsed.data

    const [settings] = await db.select().from(appSettings).limit(1)
    if (settings && !settings.claimEnabled) {
      return NextResponse.json({ error: 'The claim portal is currently closed.' }, { status: 403 })
    }

    const event = await getActiveEvent()
    const person = await findOrCreatePerson({ name, email })

    let participation = await getParticipation(event.id, person.id)
    if (participation?.couponCodeId) {
      const [existingCode] = await db
        .select()
        .from(couponCodes)
        .where(eq(couponCodes.id, participation.couponCodeId))
        .limit(1)
      return NextResponse.json({
        success: true,
        alreadyClaimed: true,
        code: existingCode?.code ?? null,
        attendee: { name: person.name, email: person.email },
      })
    }

    if (!participation) {
      participation = await createParticipation({
        eventId: event.id,
        attendeeId: person.id,
        source: 'website',
      })
    }

    const coupon = await reserveCouponForParticipation(participation.id)
    if (!coupon) {
      return NextResponse.json({ success: true, code: null, outOfCodes: true })
    }

    if (sendEmail && canSendEmail(settings)) {
      try {
        await sendCouponEmail({
          settings: settings!,
          attendee: { name: person.name, email: person.email },
          couponCode: coupon,
          fromName: `Cafe Cursor ${settings!.cityName}`,
        })
        await recordEmailResult(participation.id, 'sent')
      } catch (e) {
        console.error('email send failed', e)
        await recordEmailResult(participation.id, 'failed', e instanceof Error ? e.message : String(e))
      }
    }

    return NextResponse.json({
      success: true,
      code: coupon.code,
      attendee: { name: person.name, email: person.email },
    })
  } catch (e) {
    console.error('claim error', e)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify** — `npm run build` passes.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/claim/route.ts
git commit -m "feat(claim): per-event idempotent claims on the active event"
```

### Task 6: Rewrite Luma sync/dispatch onto participations

**Files:**
- Modify: `src/lib/luma/sync.ts`
- Modify: `src/app/api/admin/luma/sync/route.ts`
- Test: `src/lib/luma/dispatch.test.ts` (update existing expectations to the new bookkeeping)

- [ ] **Step 1: Rewrite `syncLumaGuests`** — keep `refreshLumaEvents` and `upsertGuest` as-is; replace `syncLumaGuests` with a version that takes the local event and creates person + participation (with check-in mapping):

```ts
export async function syncLumaGuests(apiKey: string, eventApiId: string, localEventId: number) {
  const { guests: fetched, truncated } = await listAllGuests(apiKey, eventApiId)
  const now = new Date().toISOString()

  let upserted = 0
  let mirrored = 0

  for (const g of fetched) {
    await upsertGuest(g, eventApiId, now)
    upserted++

    if (g.registration_status === 'confirmed' && isApprovedForCredit(g.approval_status)) {
      const person = await findOrCreatePerson({ name: g.name, email: g.email })
      let participation = await getParticipation(localEventId, person.id)
      if (!participation) {
        participation = await createParticipation({
          eventId: localEventId,
          attendeeId: person.id,
          source: 'luma',
          lumaGuestId: g.api_id,
          registeredAt: g.created_at ?? now,
        })
        mirrored++
      }
      // Luma marked them present; never clobber an earlier manual check-in.
      if (g.attendance_status && !participation.checkedInAt) {
        await db
          .update(eventAttendees)
          .set({ checkedInAt: now, updatedAt: now })
          .where(eq(eventAttendees.id, participation.id))
      }
    }
  }

  await db
    .update(lumaEvents)
    .set({ lastSyncedAt: now, isSyncEnabled: true, updatedAt: now })
    .where(eq(lumaEvents.apiId, eventApiId))
  // Persist the Luma ↔ local event link so re-syncs and dispatch find it.
  await db
    .update(events)
    .set({ lumaEventApiId: eventApiId, updatedAt: now })
    .where(eq(events.id, localEventId))

  return { upserted, mirrored, truncated }
}
```

Imports to add at the top of `sync.ts`:

```ts
import { eventAttendees, events } from '@/lib/db/schema'
import {
  findOrCreatePerson,
  getParticipation,
  createParticipation,
  reserveCouponForParticipation,
  recordEmailResult,
} from '@/lib/db/participation'
```

(Remove the now-unused `attendees` import; keep `lumaEvents`, `lumaGuests`, `couponCodes`, `appSettings`.)

- [ ] **Step 2: Rewrite `dispatchLumaCoupons`** — pending set is now participations of the local event needing a code or a (re)send; cross-source reuse within the event is automatic because person+event resolves to one participation:

```ts
export async function dispatchLumaCoupons(localEventId: number) {
  const [settings] = await db.select().from(appSettings).limit(1)

  // Luma-sourced participations of this event needing a coupon or a send —
  // emailStatus != 'sent' keeps failed sends retryable instead of stranded.
  const pending = await db
    .select()
    .from(eventAttendees)
    .innerJoin(attendees, eq(eventAttendees.attendeeId, attendees.id))
    .where(
      sql`${eventAttendees.eventId} = ${localEventId}
          AND ${eventAttendees.source} = 'luma'
          AND (${eventAttendees.couponCodeId} IS NULL
               OR ${eventAttendees.emailStatus} IS NULL
               OR ${eventAttendees.emailStatus} = 'failed')`,
    )

  let assigned = 0
  let emailed = 0

  for (const row of pending) {
    const participation = row.event_attendees
    const person = row.attendees
    let couponId = participation.couponCodeId

    if (couponId == null) {
      const coupon = await reserveCouponForParticipation(participation.id)
      if (!coupon) break // out of codes
      couponId = coupon.id
      assigned++
    }

    if (participation.emailStatus !== 'sent') {
      if (!canSendEmail(settings)) {
        await recordEmailResult(participation.id, 'skipped')
        continue
      }
      const [coupon] = await db
        .select()
        .from(couponCodes)
        .where(eq(couponCodes.id, couponId))
        .limit(1)
      if (!coupon) continue
      try {
        await sendCouponEmail({
          settings,
          attendee: { name: person.name, email: person.email },
          couponCode: coupon,
          fromName: `Cafe Cursor ${settings.cityName}`,
        })
        await recordEmailResult(participation.id, 'sent')
        emailed++
      } catch (e) {
        console.error('luma dispatch send failed for', person.email, e)
        await recordEmailResult(participation.id, 'failed', e instanceof Error ? e.message : String(e))
      }
    }
  }

  return { assigned, emailed, pending: pending.length }
}
```

(`attendees` import returns for the join — re-add it.)

- [ ] **Step 3: Update the sync route** — in `src/app/api/admin/luma/sync/route.ts`, resolve the selected local event and pass it through:

```ts
import { getSelectedEvent } from '@/lib/db/events'
// inside the handler, after requireUser + input parsing:
const localEvent = await getSelectedEvent()
const syncResult = await syncLumaGuests(apiKey, eventApiId, localEvent.id)
const dispatchResult = dispatch ? await dispatchLumaCoupons(localEvent.id) : null
```

Keep the route's existing response shape so `luma-client.tsx` needs no changes.

- [ ] **Step 4: Update `src/lib/luma/dispatch.test.ts`** — the suite seeds `lumaGuests` and asserts coupon/email bookkeeping. Rework seeds to create an event + people + `source: 'luma'` participations (use the Task 3 helpers), and assert against `eventAttendees.couponCodeId` / `emailStatus` instead of `lumaGuests.couponCodeId` / `emailSentAt`. Keep the scenarios: assigns to pending guests, reuses existing participation coupon (no double-credit), stops on exhaustion, retries failed sends.

- [ ] **Step 5: Run** `npx vitest run src/lib/luma` then `npm run build`. Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/luma/sync.ts src/lib/luma/dispatch.test.ts src/app/api/admin/luma/sync/route.ts
git commit -m "feat(luma): participation-based mirror + dispatch, check-in mapping, email results"
```

### Task 7: Rewrite admin attendee APIs (event lens + people lens)

**Files:**
- Modify: `src/app/api/admin/attendees/route.ts`, `src/app/api/admin/attendees/[id]/route.ts`, `src/app/api/admin/assign-coupon/route.ts`, `src/app/api/admin/import-attendees/route.ts`, `src/app/api/admin/send-email/route.ts`
- Modify: `src/components/admin/attendee-management.tsx` (only where DTO semantics shift)

DTO contract (snake_case, per AGENTS.md). **Event lens** (`GET /api/admin/attendees` — default): `id` is the **participation id**:

```json
{ "id": 12, "attendee_id": 7, "name": "Ana", "email": "ana@x.com",
  "source": "website", "registered_at": "…", "checked_in_at": null,
  "email_status": "sent", "email_error": null, "coupon_code": "ABCD-1234" }
```

**People lens** (`GET /api/admin/attendees?view=people`):

```json
{ "id": 7, "name": "Ana", "email": "ana@x.com", "events_attended": 3,
  "first_seen": "…", "last_seen": "…" }
```

- [ ] **Step 1: Rewrite the list route** (`src/app/api/admin/attendees/route.ts`):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { attendees, couponCodes, eventAttendees } from '@/lib/db/schema'
import { getSelectedEvent } from '@/lib/db/events'
import { requireUser } from '@/lib/auth/guard'

export async function GET(request: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response

  if (request.nextUrl.searchParams.get('view') === 'people') {
    const rows = await db
      .select({
        id: attendees.id,
        name: attendees.name,
        email: attendees.email,
        events_attended: sql<number>`count(${eventAttendees.id})`,
        first_seen: sql<string>`min(${eventAttendees.registeredAt})`,
        last_seen: sql<string>`max(${eventAttendees.registeredAt})`,
      })
      .from(attendees)
      .leftJoin(eventAttendees, eq(eventAttendees.attendeeId, attendees.id))
      .groupBy(attendees.id)
      .orderBy(desc(attendees.createdAt))
    return NextResponse.json({ people: rows })
  }

  const event = await getSelectedEvent()
  const rows = await db
    .select()
    .from(eventAttendees)
    .innerJoin(attendees, eq(eventAttendees.attendeeId, attendees.id))
    .leftJoin(couponCodes, eq(eventAttendees.couponCodeId, couponCodes.id))
    .where(eq(eventAttendees.eventId, event.id))
    .orderBy(desc(eventAttendees.registeredAt))

  return NextResponse.json({
    event: { id: event.id, name: event.name, status: event.status },
    attendees: rows.map((r) => ({
      id: r.event_attendees.id,
      attendee_id: r.attendees.id,
      name: r.attendees.name,
      email: r.attendees.email,
      source: r.event_attendees.source,
      registered_at: r.event_attendees.registeredAt,
      checked_in_at: r.event_attendees.checkedInAt,
      email_status: r.event_attendees.emailStatus,
      email_error: r.event_attendees.emailError,
      coupon_code: r.coupon_codes?.code ?? null,
    })),
  })
}
```

- [ ] **Step 2: `[id]` route** — `id` is the participation id; `?person=true` on DELETE removes the person entirely (cascades all participations — the GDPR path, used from the people lens where `id` is the person id):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { attendees, eventAttendees } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().max(255).optional(),
})

/** PATCH edits the person behind the participation (name/email live on people). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const { id } = await params
  const participationId = Number(id)
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || Number.isNaN(participationId)) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const [part] = await db
    .select()
    .from(eventAttendees)
    .where(eq(eventAttendees.id, participationId))
    .limit(1)
  if (!part) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { name, email } = parsed.data
  if (email) {
    const normalized = email.toLowerCase()
    const [conflict] = await db
      .select({ id: attendees.id })
      .from(attendees)
      .where(and(eq(attendees.email, normalized), ne(attendees.id, part.attendeeId)))
      .limit(1)
    if (conflict) {
      return NextResponse.json({ error: 'That email belongs to another person' }, { status: 409 })
    }
  }
  await db
    .update(attendees)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(email !== undefined ? { email: email.toLowerCase() } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(attendees.id, part.attendeeId))
  return NextResponse.json({ success: true })
}

/** DELETE removes the participation; ?person=true deletes the person + all participations. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const { id } = await params
  const targetId = Number(id)
  if (Number.isNaN(targetId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  if (request.nextUrl.searchParams.get('person') === 'true') {
    await db.delete(attendees).where(eq(attendees.id, targetId)) // cascades event_attendees
    return NextResponse.json({ success: true })
  }
  const [row] = await db
    .delete(eventAttendees)
    .where(eq(eventAttendees.id, targetId))
    .returning()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: `assign-coupon` route** — accept `{ participation_id: number }`, call `reserveCouponForParticipation`, 400 `'No available coupon codes'` on null, return the code. Update the caller in `attendee-management.tsx` to send `participation_id: row.id`.

- [ ] **Step 4: `import-attendees` route** — for each parsed CSV row: `findOrCreatePerson`, then `createParticipation({ eventId: selected.id, attendeeId, source: 'manual' })` unless `getParticipation` already exists (count as duplicate). Response shape `{ inserted, duplicates, total }` is unchanged, so `csv-import-dialog.tsx` needs no edits.

- [ ] **Step 5: `send-email` route** — accept `{ participation_id }`, join participation→person→coupon, send, and record via `recordEmailResult` (sent/failed). 400 if no coupon assigned.

- [ ] **Step 6: `attendee-management.tsx`** — adjust only: the row type (add `attendee_id`, `checked_in_at`, `email_status`, `email_error`), the assign/resend payloads (`participation_id: row.id`), and the delete confirm copy ("Remove from this event" instead of "Delete attendee"). Leave table layout and pagination as they are — full day-of UI lands in Phase 3.

- [ ] **Step 7: Verify** — `npm run build && npm run lint`, then in `npm run dev`: attendees page lists current-event rows; CSV import inserts; assign + resend work.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/admin src/components/admin/attendee-management.tsx
git commit -m "feat(admin): event-lens + people-lens attendee APIs on participations"
```

### Task 8: Event admin APIs + switcher session route

**Files:**
- Create: `src/app/api/admin/events/route.ts`, `src/app/api/admin/events/[id]/route.ts`, `src/app/api/admin/selected-event/route.ts`

- [ ] **Step 1: `events/route.ts`** — GET is host-accessible (the switcher needs it); POST is admin-only (enforced in Task 12; until then plain `requireUser()` with a `// admin-gated in Task 12` seam is acceptable, but prefer landing Task 12 first if executing out of order):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { desc, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { events, eventAttendees } from '@/lib/db/schema'
import { ensureDefaultEvent, getActiveEvent, getSelectedEvent, setActiveEvent } from '@/lib/db/events'
import { requireUser } from '@/lib/auth/guard'

export async function GET() {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  await ensureDefaultEvent()
  const [active, selected, rows] = await Promise.all([
    getActiveEvent(),
    getSelectedEvent(),
    db
      .select({
        id: events.id,
        name: events.name,
        event_date: events.eventDate,
        status: events.status,
        claim_passcode: events.claimPasscode,
        luma_event_api_id: events.lumaEventApiId,
        attendee_count: sql<number>`(SELECT count(*) FROM ${eventAttendees} WHERE ${eventAttendees.eventId} = ${events.id})`,
      })
      .from(events)
      .orderBy(desc(events.createdAt), desc(events.id)),
  ])
  return NextResponse.json({ events: rows, active_event_id: active.id, selected_event_id: selected.id })
}

const createSchema = z.object({
  name: z.string().min(1).max(255),
  event_date: z.string().max(64).optional(),
  claim_passcode: z.string().max(32).optional(),
  activate: z.boolean().optional().default(false),
})

export async function POST(request: NextRequest) {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const { name, event_date, claim_passcode, activate } = parsed.data
  const [row] = await db
    .insert(events)
    .values({ name, eventDate: event_date ?? null, claimPasscode: claim_passcode || null })
    .returning()
  if (activate) await setActiveEvent(row.id)
  return NextResponse.json({ success: true, id: row.id })
}
```

(Note: this task can land before Task 12 by using `requireUser()` for POST and tightening in Task 12 — Task 12's checklist includes sweeping all admin-only routes.)

- [ ] **Step 2: `events/[id]/route.ts`** — PATCH `{ name?, event_date?, claim_passcode?, action?: 'activate' | 'archive' }`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { events } from '@/lib/db/schema'
import { setActiveEvent } from '@/lib/db/events'
import { requireUser } from '@/lib/auth/guard'

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  event_date: z.string().max(64).nullable().optional(),
  claim_passcode: z.string().max(32).nullable().optional(),
  action: z.enum(['activate', 'archive']).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const { id } = await params
  const eventId = Number(id)
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || Number.isNaN(eventId)) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const [existing] = await db.select().from(events).where(eq(events.id, eventId)).limit(1)
  if (!existing) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const { name, event_date, claim_passcode, action } = parsed.data
  const now = new Date().toISOString()
  await db
    .update(events)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(event_date !== undefined ? { eventDate: event_date } : {}),
      ...(claim_passcode !== undefined ? { claimPasscode: claim_passcode || null } : {}),
      updatedAt: now,
    })
    .where(eq(events.id, eventId))

  if (action === 'activate') await setActiveEvent(eventId)
  if (action === 'archive') {
    if (existing.status === 'active') {
      return NextResponse.json(
        { error: 'Activate another event first — one event must stay active.' },
        { status: 400 },
      )
    }
    await db.update(events).set({ status: 'archived', updatedAt: now }).where(eq(events.id, eventId))
  }
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: `selected-event/route.ts`** — host-accessible; writes the session:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/guard'
import { getSession } from '@/lib/auth/session'
import { getEventById } from '@/lib/db/events'

export async function PUT(request: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const parsed = z.object({ event_id: z.number() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  if (!(await getEventById(parsed.data.event_id))) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }
  const session = await getSession()
  session.selectedEventId = parsed.data.event_id
  await session.save()
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Verify** — `npm run build`. Smoke: GET `/api/admin/events` while logged in returns the default event with `active_event_id === selected_event_id`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/events src/app/api/admin/selected-event
git commit -m "feat(events): admin CRUD, activate/archive, selected-event session route"
```

### Task 9: Event switcher in the sidebar

**Files:**
- Create: `src/components/admin/event-switcher.tsx`
- Modify: `src/components/admin/sidebar.tsx`

- [ ] **Step 1: Create the switcher** — dropdown above the nav; selecting calls the session route and `router.refresh()`; "New event" is a small dialog (admin only — pass a `canManage` prop):

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronsUpDown, Plus, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type EventRow = {
  id: number
  name: string
  status: 'draft' | 'active' | 'archived'
  attendee_count: number
}

export function EventSwitcher({ canManage }: { canManage: boolean }) {
  const router = useRouter()
  const [events, setEvents] = useState<EventRow[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')

  const load = async () => {
    const res = await fetch('/api/admin/events')
    if (!res.ok) return
    const data = await res.json()
    setEvents(data.events)
    setSelectedId(data.selected_event_id)
    setActiveId(data.active_event_id)
  }
  useEffect(() => { load() }, [])

  const select = async (id: number) => {
    await fetch('/api/admin/selected-event', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: id }),
    })
    setSelectedId(id)
    router.refresh()
  }

  const create = async () => {
    const res = await fetch('/api/admin/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    })
    if (!res.ok) { toast.error('Could not create event'); return }
    const data = await res.json()
    setCreateOpen(false)
    setNewName('')
    await load()
    await select(data.id)
    toast.success('Event created')
  }

  const selected = events.find((e) => e.id === selectedId)

  return (
    <div className="px-3 pt-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" shape="rounded" className="w-full justify-between gap-2 h-9 px-3 border border-sidebar-border">
            <span className="flex items-center gap-2 min-w-0">
              <CalendarDays className="size-4 shrink-0" />
              <span className="truncate text-sm">{selected?.name ?? 'Event'}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-foreground/50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60" align="start">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Events</DropdownMenuLabel>
          {events.map((e) => (
            <DropdownMenuItem key={e.id} onClick={() => select(e.id)} className="cursor-pointer gap-2">
              <Check className={cn('size-4', e.id === selectedId ? 'opacity-100' : 'opacity-0')} />
              <span className="flex-1 truncate">{e.name}</span>
              {e.id === activeId && (
                <span className="text-[10px] uppercase tracking-wider text-[color:var(--brand-green)]">live</span>
              )}
            </DropdownMenuItem>
          ))}
          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={(ev) => { ev.preventDefault(); setCreateOpen(true) }} className="cursor-pointer gap-2">
                <Plus className="size-4" /> New event
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New event</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="event-name">Event name</Label>
            <Input id="event-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Cafe Cursor — July" />
          </div>
          <DialogFooter>
            <Button shape="pill" onClick={create} disabled={!newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Mount it in the sidebar** — in `src/components/admin/sidebar.tsx`, change the `AdminUser` type to `{ email: string; name?: string; role?: string }` and render the switcher between the wordmark block and `<nav>`:

```tsx
import { EventSwitcher } from './event-switcher'
// …inside the aside, right after the wordmark div:
        <EventSwitcher canManage={user.role !== 'host'} />
```

Then in `src/app/admin/layout.tsx`, include `role: user.role` where the `user` prop is built for `<AdminSidebar>`.

- [ ] **Step 3: Verify** — `npm run dev`: switcher shows the default event marked `live`; creating + selecting a second event refreshes the page data.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/event-switcher.tsx src/components/admin/sidebar.tsx src/app/admin/layout.tsx
git commit -m "feat(admin): sidebar event switcher with create + activate"
```

### Task 10: Scope dashboard, QR cards, and Luma page to the selected event

**Files:**
- Modify: `src/app/admin/dashboard/page.tsx`, `src/app/admin/qr-cards/page.tsx`, `src/components/admin/qr-cards-client.tsx`, `src/app/admin/luma/page.tsx`

- [ ] **Step 1: Dashboard queries** — replace `getStats`/`getRecentAttendees` to count participations of the selected event; the code pool stays global:

```ts
import { getSelectedEvent } from '@/lib/db/events'
import { attendees, couponCodes, eventAttendees, appSettings } from '@/lib/db/schema'

async function getStats(eventId: number) {
  const count = async (q: Promise<{ c: number }[]>) => Number((await q)[0]?.c ?? 0)
  const [registrations, claimed, remaining, total] = await Promise.all([
    count(db.select({ c: sql<number>`count(*)` }).from(eventAttendees).where(eq(eventAttendees.eventId, eventId))),
    count(db.select({ c: sql<number>`count(*)` }).from(eventAttendees)
      .where(sql`${eventAttendees.eventId} = ${eventId} AND ${eventAttendees.couponCodeId} IS NOT NULL`)),
    count(db.select({ c: sql<number>`count(*)` }).from(couponCodes).where(eq(couponCodes.isUsed, false))),
    count(db.select({ c: sql<number>`count(*)` }).from(couponCodes)),
  ])
  return { totalRegistrations: registrations, couponsDistributed: claimed, couponsRemaining: remaining, couponsTotal: total }
}

async function getRecentAttendees(eventId: number) {
  const rows = await db
    .select()
    .from(eventAttendees)
    .innerJoin(attendees, eq(eventAttendees.attendeeId, attendees.id))
    .leftJoin(couponCodes, eq(eventAttendees.couponCodeId, couponCodes.id))
    .where(eq(eventAttendees.eventId, eventId))
    .orderBy(desc(eventAttendees.registeredAt))
    .limit(10)
  return rows.map((r) => ({
    ...r.attendees,
    id: r.event_attendees.id,
    source: r.event_attendees.source,
    registeredAt: r.event_attendees.registeredAt,
    couponCode: r.coupon_codes,
  }))
}
```

In the page component, `const event = await getSelectedEvent()` and pass `event.id` to both; show the event name in the subtitle: `Cafe Cursor <span className="font-tagline">{city}</span> — {event.name}`. Update `dashboard-attendees-table.tsx` prop types only if its row type names differ.

- [ ] **Step 2: QR cards** — in `src/app/admin/qr-cards/page.tsx` fetch `const event = await getSelectedEvent()` and pass `eventName={event.name}` into `<QrCardsClient>`; in `qr-cards-client.tsx` accept the prop and render it under the city in the card header (and in `src/lib/qr-layout.ts` only if the card markup lives there — follow where the city name renders today).

- [ ] **Step 3: Luma page** — show which local event syncs target: fetch `getSelectedEvent()` in `src/app/admin/luma/page.tsx` and render "Syncing into: {event.name}" above the events list (plain muted text).

- [ ] **Step 4: Verify** — `npm run build && npm run lint`; in dev, switch events and watch dashboard counts change while "Credits remaining" stays constant.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin src/components/admin
git commit -m "feat(admin): scope dashboard, QR cards, and Luma to the selected event"
```

### Task 11: Drop legacy columns + upgrade script + boot order

**Files:**
- Modify: `src/lib/db/schema.ts` (drop legacy columns), `railway.json`, `package.json`, `scripts/seed.mjs`
- Create: `scripts/migrate-events.mjs`

- [ ] **Step 1: Write the idempotent upgrade script** (`scripts/migrate-events.mjs`) — runs BEFORE `db:push` on boot; no-ops on fresh installs and already-upgraded DBs:

```js
// Upgrades pre-event deployments: creates events/event_attendees, backfills
// participation rows from legacy attendee columns, then drops the legacy
// columns so db:push doesn't have to. Safe to run on every boot.
import { createClient } from '@libsql/client'

const RAW = process.env.DATABASE_URL ?? 'file:./data/app.db'
const url = RAW.startsWith('file:') || RAW.startsWith('libsql:') ? RAW : `file:${RAW}`
const db = createClient({ url, authToken: url.startsWith('libsql:') ? process.env.DATABASE_AUTH_TOKEN : undefined })

async function hasTable(name) {
  const r = await db.execute({ sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, args: [name] })
  return r.rows.length > 0
}
async function hasColumn(table, col) {
  const r = await db.execute(`PRAGMA table_info(${table})`)
  return r.rows.some((row) => row.name === col)
}
async function dropColumnIfExists(table, col) {
  if (await hasColumn(table, col)) await db.execute(`ALTER TABLE ${table} DROP COLUMN ${col}`)
}

async function main() {
  if (!(await hasTable('attendees')) || !(await hasColumn('attendees', 'coupon_code_id'))) {
    console.log('migrate-events: nothing to do')
    return
  }
  console.log('migrate-events: upgrading legacy deployment…')

  await db.execute(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    event_date TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    claim_passcode TEXT,
    luma_event_api_id TEXT,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
  )`)
  await db.execute(`CREATE TABLE IF NOT EXISTS event_attendees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    attendee_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'website',
    registered_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    coupon_code_id INTEGER REFERENCES coupon_codes(id) ON DELETE SET NULL,
    luma_guest_id TEXT,
    checked_in_at TEXT,
    email_status TEXT,
    email_error TEXT,
    email_sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
  )`)
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS event_attendees_event_attendee_unique ON event_attendees(event_id, attendee_id)`,
  )

  // One default event from the city name, active.
  const existing = await db.execute(`SELECT id FROM events LIMIT 1`)
  let eventId
  if (existing.rows.length > 0) {
    eventId = existing.rows[0].id
  } else {
    const s = await db.execute(`SELECT city_name FROM app_settings LIMIT 1`)
    const city = s.rows[0]?.city_name ?? 'Cafe Cursor'
    const name = String(city).startsWith('Cafe Cursor') ? city : `Cafe Cursor ${city}`
    const ins = await db.execute({ sql: `INSERT INTO events (name, status) VALUES (?, 'active')`, args: [name] })
    eventId = Number(ins.lastInsertRowid)
  }

  // Backfill one participation per legacy attendee, carrying coupon + source +
  // luma linkage and the luma email-sent flag. Idempotent via the unique index.
  await db.execute({
    sql: `INSERT OR IGNORE INTO event_attendees
            (event_id, attendee_id, source, registered_at, coupon_code_id, luma_guest_id, email_sent_at, email_status)
          SELECT ?, a.id, a.source, a.registered_at, a.coupon_code_id, a.luma_guest_id, lg.email_sent_at,
                 CASE WHEN lg.email_sent_at IS NOT NULL THEN 'sent' ELSE NULL END
          FROM attendees a
          LEFT JOIN luma_guests lg ON lg.api_id = a.luma_guest_id`,
    args: [eventId],
  })

  for (const col of ['coupon_code_id', 'source', 'luma_guest_id', 'luma_event_id', 'registered_at']) {
    await dropColumnIfExists('attendees', col)
  }
  await dropColumnIfExists('coupon_codes', 'used_by_type')
  await dropColumnIfExists('app_settings', 'luma_event_id')
  console.log('migrate-events: done')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Drop legacy columns from `schema.ts`** — remove from `attendees`: `couponCodeId`, `source`, `lumaGuestId`, `lumaEventId`, `registeredAt` (and their indexes `couponIdx`, `lumaGuestIdx`); remove `couponCodes.usedByType`; remove `appSettings.lumaEventId`; remove the old `attendeesRelations`/`couponCodesRelations` that referenced `attendees.couponCodeId`; keep `AttendeeWithCoupon` only if still imported anywhere — otherwise delete it and fix imports.

- [ ] **Step 3: Sweep the now-broken references** — `grep -rn "usedByType\|AttendeeWithCoupon\|attendees.couponCodeId\|attendees.source\|attendees.registeredAt" src scripts` and fix each (the Phase 1 rewrites should have removed nearly all). Update `scripts/seed.mjs` to seed via the new shape (insert an event, people, then `event_attendees` rows) and `scripts/reset-db.mjs` to also drop/clear `events` + `event_attendees`. Also remove the legacy reservation test expectations: in `src/lib/db/coupon-reservation.test.ts` delete the `usedByType` set/assert lines (the file otherwise stands).

- [ ] **Step 4: Boot order** — `railway.json` deploy block:

```json
  "deploy": {
    "startCommand": "node scripts/migrate-events.mjs && npm run db:push && npm run start",
```

And in `package.json` scripts, add: `"db:migrate-events": "node scripts/migrate-events.mjs"`.

- [ ] **Step 5: Verify the upgrade path** — run against a seeded legacy copy:

```bash
cp data/app.db /tmp/legacy-backup.db   # safety copy
node scripts/migrate-events.mjs && npm run db:push && npx vitest run && npm run build
node scripts/migrate-events.mjs        # second run must print "nothing to do"
```

Expected: tests + build green; second run is a no-op.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts scripts railway.json package.json src/lib/db/coupon-reservation.test.ts
git commit -m "feat(db)!: drop legacy attendee columns; idempotent upgrade script in boot"
```

---

# Phase 2 — Team & recovery

### Task 12: Role-aware guard

**Files:**
- Modify: `src/lib/auth/guard.ts`
- Test: `src/lib/auth/guard.test.ts` (create)

- [ ] **Step 1: Extend the guard**

```ts
import 'server-only'
import { NextResponse } from 'next/server'
import { currentUser } from './users'
import type { User } from '@/lib/db/schema'

export async function requireUser(opts?: {
  role?: 'admin'
}): Promise<{ user: User } | { response: NextResponse }> {
  const user = await currentUser()
  if (!user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (opts?.role === 'admin' && user.role !== 'admin') {
    return { response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }
  return { user }
}
```

- [ ] **Step 2: Sweep admin-only routes** — add `{ role: 'admin' }` to: `api/admin/settings` (GET + PUT), `api/admin/coupons` POST/PATCH/DELETE (GET stays host — QR cards need it), `api/admin/events` POST, `api/admin/events/[id]` PATCH, and (when they exist) `api/admin/users/*`. Everything else keeps plain `requireUser()`.

- [ ] **Step 3: Test the matrix** — `src/lib/auth/guard.test.ts` can't easily fake iron-session; instead unit-test the decision by extracting it:

In guard.ts add and use:

```ts
/** Pure decision used by requireUser — exported for tests. */
export function gateFor(user: User | null, opts?: { role?: 'admin' }): 401 | 403 | 'ok' {
  if (!user) return 401
  if (opts?.role === 'admin' && user.role !== 'admin') return 403
  return 'ok'
}
```

Test:

```ts
import { describe, it, expect } from 'vitest'
import { gateFor } from './guard'
import type { User } from '@/lib/db/schema'

const mk = (role: 'admin' | 'host') => ({ role } as User)

describe('gateFor', () => {
  it('rejects anonymous', () => expect(gateFor(null)).toBe(401))
  it('admits any user without a role requirement', () => expect(gateFor(mk('host'))).toBe('ok'))
  it('blocks hosts from admin-only routes', () => expect(gateFor(mk('host'), { role: 'admin' })).toBe(403))
  it('admits admins to admin-only routes', () => expect(gateFor(mk('admin'), { role: 'admin' })).toBe('ok'))
})
```

- [ ] **Step 4: Run** `npx vitest run src/lib/auth && npm run build` — green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/guard.ts src/lib/auth/guard.test.ts src/app/api/admin
git commit -m "feat(auth): admin-role gate on guard + sweep of admin-only routes"
```

### Task 13: Rate limiter

**Files:**
- Create: `src/lib/rate-limit.ts`
- Test: `src/lib/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { rateLimit, resetRateLimits, clientIp } from './rate-limit'

describe('rateLimit', () => {
  beforeEach(() => resetRateLimits())

  it('allows 5 per minute then blocks until the window slides', () => {
    const t0 = 1_000_000
    for (let i = 0; i < 5; i++) expect(rateLimit('claim:1.2.3.4', t0 + i * 1000)).toBe(true)
    expect(rateLimit('claim:1.2.3.4', t0 + 6000)).toBe(false)
    expect(rateLimit('claim:1.2.3.4', t0 + 61_000)).toBe(true)
  })

  it('enforces the hourly cap across minute windows', () => {
    const t0 = 2_000_000
    let allowed = 0
    for (let i = 0; i < 40; i++) {
      // One request every 2 minutes never trips the minute cap.
      if (rateLimit('reg:ip', t0 + i * 120_000)) allowed++
    }
    expect(allowed).toBe(30)
  })

  it('keys are independent', () => {
    const t0 = 3_000_000
    for (let i = 0; i < 5; i++) rateLimit('a', t0)
    expect(rateLimit('a', t0)).toBe(false)
    expect(rateLimit('b', t0)).toBe(true)
  })

  it('clientIp takes the first forwarded hop', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } })
    expect(clientIp(req)).toBe('9.9.9.9')
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/rate-limit.test.ts` → module not found.

- [ ] **Step 3: Implement `src/lib/rate-limit.ts`**

```ts
import { NextResponse } from 'next/server'

// In-memory on purpose: this app runs as one process (Railway/Fly). If it ever
// goes multi-instance, swap the Map for a shared store.
const WINDOWS = [
  { limit: 5, windowMs: 60_000 },
  { limit: 30, windowMs: 3_600_000 },
]
const hits = new Map<string, number[]>()

export function rateLimit(key: string, now = Date.now()): boolean {
  const stamps = (hits.get(key) ?? []).filter((t) => now - t < 3_600_000)
  const allowed = WINDOWS.every(
    (w) => stamps.filter((t) => now - t < w.windowMs).length < w.limit,
  )
  if (allowed) stamps.push(now)
  hits.set(key, stamps)
  return allowed
}

export function resetRateLimits() {
  hits.clear()
}

export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

export function tooManyRequests(): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests — please wait a moment and try again.' },
    { status: 429 },
  )
}
```

- [ ] **Step 4: Run** `npx vitest run src/lib/rate-limit.test.ts` — 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit.ts src/lib/rate-limit.test.ts
git commit -m "feat: in-memory per-IP rate limiter"
```

### Task 14: Team APIs

**Files:**
- Create: `src/app/api/admin/users/route.ts`, `src/app/api/admin/users/[id]/route.ts`
- Modify: `src/lib/auth/users.ts` (createUser gains role/temp flags)

- [ ] **Step 1: Extend `createUser`** in `src/lib/auth/users.ts`:

```ts
export async function createUser(params: {
  name: string
  email: string
  password: string
  role?: 'admin' | 'host'
  mustChangePassword?: boolean
}): Promise<User> {
  const passwordHash = await hashPassword(params.password)
  const [row] = await db
    .insert(users)
    .values({
      name: params.name,
      email: params.email.toLowerCase(),
      passwordHash,
      role: params.role ?? 'admin',
      mustChangePassword: params.mustChangePassword ?? false,
    })
    .returning()
  return row
}
```

(The existing `/api/admin-register` caller keeps working — first admin defaults to `admin`.)

- [ ] **Step 2: `users/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { desc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { createUser, findUserByEmail } from '@/lib/auth/users'
import { requireUser } from '@/lib/auth/guard'

export async function GET() {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .orderBy(desc(users.createdAt))
  return NextResponse.json({
    users: rows.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.createdAt })),
  })
}

const createSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  role: z.enum(['admin', 'host']),
})

export async function POST(request: NextRequest) {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  if (await findUserByEmail(parsed.data.email)) {
    return NextResponse.json({ error: 'A user with that email already exists' }, { status: 409 })
  }
  // Shown once in the UI, never stored in plaintext, changed on first login.
  const tempPassword = randomBytes(9).toString('base64url')
  const user = await createUser({ ...parsed.data, password: tempPassword, mustChangePassword: true })
  return NextResponse.json({
    success: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    temp_password: tempPassword,
  })
}
```

- [ ] **Step 3: `users/[id]/route.ts`** — DELETE with the safety rails:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const { id } = await params
  const userId = Number(id)
  if (Number.isNaN(userId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  if (userId === gate.user.id) {
    return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 })
  }
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (target.role === 'admin') {
    const [row] = await db.select({ c: sql<number>`count(*)` }).from(users).where(eq(users.role, 'admin'))
    if (Number(row.c) <= 1) {
      return NextResponse.json({ error: 'Cannot remove the last admin' }, { status: 400 })
    }
  }
  await db.delete(users).where(eq(users.id, userId))
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Verify** — `npm run build`; in dev: POST creates a host and returns `temp_password`; deleting yourself or the last admin returns 400.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/users src/lib/auth/users.ts
git commit -m "feat(team): user list/create/delete with temp passwords and safety rails"
```

### Task 15: Team page UI

**Files:**
- Create: `src/app/admin/team/page.tsx`, `src/components/admin/team-client.tsx`
- Modify: `src/components/admin/sidebar.tsx` (nav entry, admin-only)

- [ ] **Step 1: Page shell** (`src/app/admin/team/page.tsx`)

```tsx
import { TeamClient } from '@/components/admin/team-client'

export const dynamic = 'force-dynamic'

export default function TeamPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Team</h1>
        <p className="mt-1 text-muted-foreground">
          Admins run everything; hosts get the day-of tools.
        </p>
      </div>
      <TeamClient />
    </div>
  )
}
```

- [ ] **Step 2: Client component** (`src/components/admin/team-client.tsx`) — table of users + "Add member" dialog that shows the temp password once with a copy button. Follow `coupon-management.tsx` table/dialog idioms. Complete behavior contract: load `GET /api/admin/users`; create via POST `{name,email,role}` → on success render the `temp_password` in a `font-code` block inside the dialog with a "Copy" `Button` (`navigator.clipboard.writeText`) and the note "Shown once — they'll set their own password on first sign-in"; delete via DELETE with a confirm; roles rendered as a plain `Badge` (`admin` default variant, `host` outline). Toast errors from the API's `error` field.

- [ ] **Step 3: Sidebar entry** — in `sidebar.tsx` add to the navigation array with a flag, filtered by role:

```tsx
import { UserPlus } from 'lucide-react'
const navigation = [
  // …existing entries…
  { name: 'Team', href: '/admin/team', icon: UserPlus, adminOnly: true },
  { name: 'Settings', href: '/admin/settings', icon: Settings, adminOnly: true },
]
// in the render:
{navigation
  .filter((item) => !item.adminOnly || user.role !== 'host')
  .map((item) => { /* unchanged */ })}
```

- [ ] **Step 4: Verify** — dev: create a host, log in as the host in a private window with the temp password; sidebar hides Team/Settings; direct GET `/api/admin/settings` returns 403.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/team src/components/admin/team-client.tsx src/components/admin/sidebar.tsx
git commit -m "feat(team): team page with one-time temp passwords; admin-only nav"
```

### Task 16: First-login password change

**Files:**
- Create: `src/app/api/auth/change-password/route.ts`, `src/app/change-password/page.tsx`
- Modify: `src/app/api/auth/login/route.ts`, `src/app/login/page.tsx`

- [ ] **Step 1: API** (`src/app/api/auth/change-password/route.ts`)

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'
import { hashPassword, verifyPassword } from '@/lib/auth/users'

const schema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(255),
})

export async function POST(request: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }
  const { currentPassword, newPassword } = parsed.data
  // Temp-password users skip the current-password check; everyone else proves it.
  if (!gate.user.mustChangePassword) {
    if (!currentPassword || !(await verifyPassword(currentPassword, gate.user.passwordHash))) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }
  }
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, gate.user.id))
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Login flow** — in `src/app/api/auth/login/route.ts`, add `must_change_password: user.mustChangePassword` to the success JSON. In `src/app/login/page.tsx`, route on it: `router.push(data.must_change_password ? '/change-password' : '/admin/dashboard')`.

- [ ] **Step 3: Page** (`src/app/change-password/page.tsx`) — `<PublicShell>` + react-hook-form/zod like `/login`: one or two fields ("Current password" hidden when arriving from a temp login — fetch `/api/auth/me` and check `must_change_password`; expose that field in the `me` route response), "New password" min 8, submit → POST → toast → `router.push('/admin/dashboard')`.

- [ ] **Step 4: Verify** — temp-password host from Task 15 lands on `/change-password`, sets a password, reaches the dashboard; second login goes straight in.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/change-password src/app/change-password src/app/api/auth/login src/app/login src/app/api/auth/me
git commit -m "feat(auth): first-login password change flow"
```

### Task 17: Password recovery (email + CLI break-glass)

**Files:**
- Modify: `src/lib/auth/users.ts`, `src/lib/emails/send-coupon-email.ts`
- Create: `src/app/api/auth/forgot-password/route.ts`, `src/app/api/auth/reset-password/route.ts`, `src/app/forgot-password/page.tsx`, `src/app/reset-password/page.tsx`, `scripts/reset-password.mjs`
- Test: `src/lib/auth/users.test.ts` (extend)

- [ ] **Step 1: Failing tests for the token lifecycle** (append to `src/lib/auth/users.test.ts`):

```ts
import { issueResetToken, resetPasswordWithToken, verifyPassword } from './users'
// inside a describe with beforeEach(() => db.delete(users)):
it('issues a token, resets once, and rejects reuse', async () => {
  const user = await createUser({ name: 'A', email: 'a@x.com', password: 'original-pass' })
  const token = await issueResetToken(user.email)
  expect(token).toBeTruthy()
  expect(await resetPasswordWithToken(token!, 'brand-new-pass')).toBe(true)
  const fresh = await findUserByEmail('a@x.com')
  expect(await verifyPassword('brand-new-pass', fresh!.passwordHash)).toBe(true)
  expect(await resetPasswordWithToken(token!, 'again')).toBe(false) // single-use
})

it('returns null for unknown emails and false for expired tokens', async () => {
  expect(await issueResetToken('ghost@x.com')).toBeNull()
  const user = await createUser({ name: 'B', email: 'b@x.com', password: 'pass-word' })
  const token = await issueResetToken(user.email)
  await db.update(users)
    .set({ resetTokenExpiresAt: new Date(Date.now() - 1000).toISOString() })
    .where(eq(users.id, user.id))
  expect(await resetPasswordWithToken(token!, 'nope-nope')).toBe(false)
})
```

Run: `npx vitest run src/lib/auth/users.test.ts` → FAIL (functions missing).

- [ ] **Step 2: Implement in `users.ts`**

```ts
import { createHash, randomBytes } from 'crypto'
import { and, eq, gt } from 'drizzle-orm'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** Returns the raw token to email, or null when no such user. Stored hashed. */
export async function issueResetToken(email: string): Promise<string | null> {
  const user = await findUserByEmail(email)
  if (!user) return null
  const token = randomBytes(32).toString('hex')
  await db
    .update(users)
    .set({
      resetTokenHash: sha256(token),
      resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, user.id))
  return token
}

/** Single-use: clears the token whether by success or by the row update. */
export async function resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
  const nowIso = new Date().toISOString()
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.resetTokenHash, sha256(token)), gt(users.resetTokenExpiresAt, nowIso)))
    .limit(1)
  if (!user) return false
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      mustChangePassword: false,
      updatedAt: nowIso,
    })
    .where(eq(users.id, user.id))
  return true
}
```

Run the tests — green.

- [ ] **Step 3: Generic email sender** — in `send-coupon-email.ts`, export a generic wrapper the reset flow can use (refactor `sendCouponEmail` to call it):

```ts
export async function sendAppEmail(params: {
  settings: EmailSettings
  to: string
  subject: string
  html: string
  fromName?: string
}) {
  const { settings, to, subject, html, fromName = 'Cafe Cursor' } = params
  const provider = settings.emailProvider ?? 'resend'
  const target = { settings, attendee: { email: to }, html, subject, fromName }
  return provider === 'smtp' ? sendViaSmtp(target) : sendViaResend(target)
}
```

- [ ] **Step 4: Routes** — `forgot-password/route.ts` (rate-limited, no enumeration):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { appSettings } from '@/lib/db/schema'
import { issueResetToken } from '@/lib/auth/users'
import { canSendEmail, sendAppEmail } from '@/lib/emails/send-coupon-email'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  if (!rateLimit(`forgot:${clientIp(request)}`)) return tooManyRequests()
  const parsed = z.object({ email: z.string().email() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const [settings] = await db.select().from(appSettings).limit(1)
  const generic = {
    success: true,
    message: 'If that account exists, a reset link is on its way.',
    email_configured: canSendEmail(settings),
  }
  if (!canSendEmail(settings)) return NextResponse.json(generic)

  const token = await issueResetToken(parsed.data.email)
  if (token) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
    try {
      await sendAppEmail({
        settings,
        to: parsed.data.email.toLowerCase(),
        subject: 'Reset your Cafe Cursor password',
        html: `<p>Someone asked to reset this account's password. The link works once and expires in an hour.</p>
               <p><a href="${base}/reset-password?token=${token}">Set a new password</a></p>
               <p>Didn't ask? Ignore this email.</p>`,
        fromName: `Cafe Cursor ${settings.cityName}`,
      })
    } catch (e) {
      console.error('reset email failed', e)
    }
  }
  return NextResponse.json(generic)
}
```

`reset-password/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resetPasswordWithToken } from '@/lib/auth/users'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  if (!rateLimit(`reset:${clientIp(request)}`)) return tooManyRequests()
  const parsed = z
    .object({ token: z.string().min(32), password: z.string().min(8).max(255) })
    .safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const ok = await resetPasswordWithToken(parsed.data.token, parsed.data.password)
  if (!ok) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 })
  }
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Pages** — `/forgot-password` (PublicShell, single email field, always shows the generic confirmation; when the response has `email_configured: false`, show instead: "Email isn't configured on this deployment. Ask another admin, or run `npm run reset-password -- you@email.com` on the server."). `/reset-password` reads `useSearchParams().get('token')`, new-password field, POST, then `router.push('/login')`. Add a "Forgot password?" link under the password field on `/login`. Also exclude `/forgot-password` and `/reset-password` from the auth redirect in `src/proxy.ts` (follow how `/login` is allowed there).

- [ ] **Step 6: CLI break-glass** (`scripts/reset-password.mjs`) + package.json script `"reset-password": "node scripts/reset-password.mjs"`:

```js
// Usage: npm run reset-password -- admin@email.com [new-password]
import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

const email = process.argv[2]?.toLowerCase()
if (!email) { console.error('Usage: npm run reset-password -- <email> [new-password]'); process.exit(1) }
const password = process.argv[3] ?? randomBytes(9).toString('base64url')

const RAW = process.env.DATABASE_URL ?? 'file:./data/app.db'
const url = RAW.startsWith('file:') || RAW.startsWith('libsql:') ? RAW : `file:${RAW}`
const db = createClient({ url, authToken: url.startsWith('libsql:') ? process.env.DATABASE_AUTH_TOKEN : undefined })

const hash = bcrypt.hashSync(password, 10)
const res = await db.execute({
  sql: `UPDATE users SET password_hash = ?, must_change_password = 1,
        reset_token_hash = NULL, reset_token_expires_at = NULL WHERE email = ?`,
  args: [hash, email],
})
if (res.rowsAffected === 0) { console.error(`No user with email ${email}`); process.exit(1) }
console.log(`Password for ${email} reset to: ${password}\nThey'll be asked to change it on next login.`)
```

- [ ] **Step 7: Verify** — `npx vitest run && npm run build && npm run lint`; CLI smoke: `npm run reset-password -- <your-dev-admin-email>` then log in with the printed password → forced onto `/change-password`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth src/lib/emails src/app/api/auth src/app/forgot-password src/app/reset-password src/app/login src/proxy.ts scripts/reset-password.mjs package.json
git commit -m "feat(auth): password recovery via email with CLI break-glass"
```

---

# Phase 3 — Event-day features

### Task 18: Venue passcode + rate limits on public endpoints

**Files:**
- Modify: `src/app/api/claim/route.ts`, `src/app/api/register/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/settings/public/route.ts`, `src/app/claim/page.tsx`, `src/app/admin/dashboard/page.tsx`, event create/edit UI (`event-switcher.tsx` dialog + a passcode field)

- [ ] **Step 1: Rate-limit the public endpoints** — top of `claim` and `register` POST handlers (before parsing):

```ts
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit'
// first line inside try:
if (!rateLimit(`claim:${clientIp(request)}`)) return tooManyRequests()
```

(`register:` key for register; `login:` for the login route.)

- [ ] **Step 2: Passcode check in `/api/claim`** — add `passcode: z.string().max(32).optional()` to the schema; after the `claimEnabled` check:

```ts
if (event.claimPasscode) {
  if (!parsed.data.passcode || parsed.data.passcode.trim().toLowerCase() !== event.claimPasscode.toLowerCase()) {
    return NextResponse.json({ error: 'Wrong event passcode — check the screen at the venue.' }, { status: 403 })
  }
}
```

(Move the `getActiveEvent()` call above this check.)

- [ ] **Step 3: Tell the claim page a passcode is needed** — `/api/settings/public` GET additionally returns `claim_passcode_required: Boolean((await getActiveEvent()).claimPasscode)` (never the passcode itself). In `src/app/claim/page.tsx`, when that flag is true render an extra `Input` ("Event passcode", `font-code`, autocapitalize off) and include it in the POST body; on 403 show the API error via the existing error display.

- [ ] **Step 4: Surface it for the projector** — dashboard page already loads the selected event (Task 10); when `event.claimPasscode` is set render under the header:

```tsx
{event.claimPasscode ? (
  <div className="flex items-center gap-3 rounded-[10px] border border-border px-4 py-3">
    <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Claim passcode</span>
    <span className="font-code text-2xl tracking-widest">{event.claimPasscode}</span>
  </div>
) : null}
```

Add a passcode `Input` to the new-event dialog in `event-switcher.tsx` (optional field, placeholder "e.g. CAFE — leave empty for an open portal") wired into the POST body as `claim_passcode`.

- [ ] **Step 5: Verify** — set a passcode on the active event; `/claim` rejects without it, accepts with it (any case); 6 rapid claims from one IP hit a 429. `npm run build && npm run lint`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api src/app/claim src/app/admin/dashboard src/components/admin/event-switcher.tsx
git commit -m "feat(claim): venue passcode + per-IP rate limits on public endpoints"
```

### Task 19: Email status in the UI

**Files:**
- Modify: `src/components/admin/attendee-management.tsx`, `src/app/admin/dashboard/page.tsx`

The data already flows (Tasks 4–7). This task only renders it.

- [ ] **Step 1: Status dot** — in `attendee-management.tsx` add a small helper next to the email cell:

```tsx
function EmailStatusDot({ status, error }: { status: string | null; error: string | null }) {
  if (!status) return null
  const tone =
    status === 'sent' ? 'bg-[color:var(--brand-green)]'
    : status === 'failed' ? 'bg-foreground'
    : 'bg-muted-foreground/40'
  const label = status === 'failed' ? `Email failed: ${error ?? 'unknown'}` : `Email ${status}`
  return <span title={label} className={`inline-block size-1.5 rounded-full ${tone}`} aria-label={label} />
}
```

Render `<EmailStatusDot status={row.email_status} error={row.email_error} />` beside the email address. The existing resend action doubles as retry.

- [ ] **Step 2: Dashboard failed-count line** — in the dashboard page add to the stats query:

```ts
const failedEmails = await count(
  db.select({ c: sql<number>`count(*)` }).from(eventAttendees)
    .where(sql`${eventAttendees.eventId} = ${eventId} AND ${eventAttendees.emailStatus} = 'failed'`),
)
```

Render only when nonzero, under the KPI grid:

```tsx
{failedEmails > 0 ? (
  <p className="text-sm text-muted-foreground">
    {failedEmails} email{failedEmails === 1 ? '' : 's'} failed to send —{' '}
    <Link href="/admin/attendees" className="underline underline-offset-4">review in Attendees</Link>.
  </p>
) : null}
```

- [ ] **Step 3: Verify + commit**

```bash
npm run build && npm run lint
git add src/components/admin/attendee-management.tsx src/app/admin/dashboard/page.tsx
git commit -m "feat(admin): surface email send status + failures"
```

### Task 20: Check-in

**Files:**
- Create: `src/app/api/admin/attendees/[id]/checkin/route.ts`
- Modify: `src/components/admin/attendee-management.tsx`, `src/app/admin/dashboard/page.tsx`

- [ ] **Step 1: Endpoint** (host-accessible; `id` = participation id)

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { eventAttendees } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const { id } = await params
  const participationId = Number(id)
  const parsed = z.object({ checked_in: z.boolean() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success || Number.isNaN(participationId)) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const now = new Date().toISOString()
  const [row] = await db
    .update(eventAttendees)
    .set({ checkedInAt: parsed.data.checked_in ? now : null, updatedAt: now })
    .where(eq(eventAttendees.id, participationId))
    .returning()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true, checked_in_at: row.checkedInAt })
}
```

- [ ] **Step 2: UI toggle** — in the event-lens table add a check-in cell: a ghost pill button showing `Check in` when `checked_in_at` is null, or a `font-code` time + filled state when set; clicking POSTs `{ checked_in: !row.checked_in_at }` and updates local state. Use the `Check` lucide icon at `size-3.5`.

- [ ] **Step 3: Dashboard KPI** — add to `getStats`:

```ts
const checkedIn = await count(
  db.select({ c: sql<number>`count(*)` }).from(eventAttendees)
    .where(sql`${eventAttendees.eventId} = ${eventId} AND ${eventAttendees.checkedInAt} IS NOT NULL`),
)
```

Add `<Kpi label="Checked in" value={stats.checkedIn} icon={UserCheck} tone="green" />` (import `UserCheck` from lucide) and widen the grid to `lg:grid-cols-5`.

- [ ] **Step 4: Verify + commit** — Luma-synced attendance also appears (Task 6 mapping).

```bash
npm run build && npm run lint
git add src/app/api/admin/attendees src/components/admin/attendee-management.tsx src/app/admin/dashboard/page.tsx
git commit -m "feat(admin): manual + Luma check-in with dashboard KPI"
```

### Task 21: Low-inventory banner

**Files:**
- Modify: `src/app/admin/dashboard/page.tsx`

- [ ] **Step 1: Threshold + banner** — in the page component:

```tsx
const lowInventory =
  stats.couponsTotal > 0 &&
  stats.couponsRemaining <= Math.max(10, Math.ceil(stats.couponsTotal * 0.15))
```

Render between the header and the KPI grid — quiet by design (1px border, no accent colors, no icon):

```tsx
{lowInventory ? (
  <div className="flex items-center justify-between rounded-[10px] border border-border px-4 py-3">
    <p className="text-sm">
      <span className="font-code">{stats.couponsRemaining}</span>{' '}
      code{stats.couponsRemaining === 1 ? '' : 's'} remaining in the shared pool.
    </p>
    <Link href="/admin/coupons" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
      Add codes
    </Link>
  </div>
) : null}
```

- [ ] **Step 2: Verify + commit** — seed >10 codes and burn most of them in dev to see it appear.

```bash
npm run build
git add src/app/admin/dashboard/page.tsx
git commit -m "feat(dashboard): quiet low-inventory banner"
```

### Task 22: Edit attendee, reassign code, people lens

**Files:**
- Create: `src/app/api/admin/attendees/[id]/reassign/route.ts`
- Modify: `src/app/api/admin/attendees/[id]/route.ts` (PATCH from Task 7 already edits the person — verify), `src/components/admin/attendee-management.tsx`, `src/app/admin/attendees/page.tsx`

- [ ] **Step 1: Reassign endpoint**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { eventAttendees } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'
import { reserveCouponForParticipation } from '@/lib/db/participation'

/** Assigns a fresh code; the old one stays burned — it already left in an email. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const { id } = await params
  const participationId = Number(id)
  if (Number.isNaN(participationId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const [row] = await db.select().from(eventAttendees).where(eq(eventAttendees.id, participationId)).limit(1)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const coupon = await reserveCouponForParticipation(participationId)
  if (!coupon) return NextResponse.json({ error: 'No available coupon codes' }, { status: 400 })
  return NextResponse.json({ success: true, code: coupon.code })
}
```

- [ ] **Step 2: Edit dialog** — in `attendee-management.tsx` row actions add "Edit": a `Dialog` with name + email inputs seeded from the row, PATCH to `/api/admin/attendees/{row.id}` with `{ name, email }`; on 409 toast "That email belongs to another person". Add "Reassign code" (only when a code exists) with a confirm noting the old code stays used; on success toast the new code and refresh the table. Typo recovery flow = Edit email → Resend.

- [ ] **Step 3: People lens** — add `Tabs` (`@/components/ui/tabs`) at the top of `attendee-management.tsx`: **"This event"** (default, existing table) and **"All people"**. The people tab fetches `GET /api/admin/attendees?view=people` and renders name, email, `events_attended`, first/last seen, with: a Download button building the CSV client-side (same pattern as the existing event-lens download — columns `Name,Email,Events attended,First seen,Last seen`), and a delete action calling `DELETE /api/admin/attendees/{person.id}?person=true` with a confirm: "Removes this person and their history from every event. This is permanent." No edit/assign actions here — those live on the event lens.

- [ ] **Step 4: Verify + commit** — person attending two events shows `events_attended: 2`; deleting them empties both event lenses.

```bash
npm run build && npm run lint
git add src/app/api/admin/attendees src/components/admin/attendee-management.tsx src/app/admin/attendees/page.tsx
git commit -m "feat(admin): edit attendee, reassign code, community people lens"
```

### Task 23: Getting-started checklist + host-accessible claim toggle

**Files:**
- Create: `src/components/admin/getting-started.tsx`, `src/app/api/admin/claim-toggle/route.ts`, `src/app/api/admin/checklist/route.ts`
- Modify: `src/app/admin/dashboard/page.tsx`, `src/app/admin/settings/page.tsx` (point its claim switch at the new endpoint)

- [ ] **Step 1: Claim toggle endpoint** (host-accessible — the one settings field hosts may flip)

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { appSettings } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

export async function PATCH(request: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const parsed = z.object({ enabled: z.boolean() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  await ensureDefaultSettings()
  await db.update(appSettings).set({ claimEnabled: parsed.data.enabled, updatedAt: new Date().toISOString() })
  return NextResponse.json({ success: true })
}
```

Point the settings page's existing claim switch at this endpoint (and remove `claimEnabled` from the settings PUT payload so there's one writer).

- [ ] **Step 2: Checklist dismiss endpoint** (`src/app/api/admin/checklist/route.ts`) — PATCH `{ dismissed: true }` → sets `appSettings.checklistDismissed`; `requireUser()` plain; same shape as Step 1.

- [ ] **Step 3: Compute state server-side** — in the dashboard page:

```ts
import { canSendEmail } from '@/lib/emails/send-coupon-email'

const checklist = {
  dismissed: settings?.checklistDismissed ?? false,
  eventReady: Boolean(
    event.eventDate || event.claimPasscode || !event.name.startsWith('Cafe Cursor'),
  ),
  hasCodes: stats.couponsTotal > 0,
  emailReady: canSendEmail(settings),
  lumaConnected: Boolean(settings?.lumaApiKey),
}
const checklistDone = checklist.eventReady && checklist.hasCodes && checklist.emailReady
```

(Load `settings` once in the page — `getCity` already reads the row; widen it to return the full settings row.)

- [ ] **Step 4: Component** (`src/components/admin/getting-started.tsx`) — render when `!dismissed && !checklistDone`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Checks = {
  eventReady: boolean
  hasCodes: boolean
  emailReady: boolean
  lumaConnected: boolean
}

const STEPS = [
  { key: 'eventReady', label: 'Set up your event', hint: 'Name it, set a date or passcode', href: '/admin/dashboard' },
  { key: 'hasCodes', label: 'Add credit codes', hint: 'Paste your code batch', href: '/admin/coupons' },
  { key: 'emailReady', label: 'Configure email', hint: 'Resend or SMTP', href: '/admin/settings' },
  { key: 'lumaConnected', label: 'Connect Luma', hint: 'Optional — sync your guest list', href: '/admin/luma' },
] as const

export function GettingStarted({ checks }: { checks: Checks }) {
  const router = useRouter()
  const dismiss = async () => {
    await fetch('/api/admin/checklist', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dismissed: true }),
    })
    router.refresh()
  }
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Getting started</span>
          <Button variant="ghost" shape="pill" size="sm" onClick={dismiss} className="text-muted-foreground">
            Dismiss
          </Button>
        </div>
        <ul className="space-y-2">
          {STEPS.map((s) => {
            const done = checks[s.key]
            return (
              <li key={s.key} className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full border',
                    done ? 'border-[color:var(--brand-green)] text-[color:var(--brand-green)]' : 'border-border text-transparent',
                  )}
                >
                  <Check className="size-3" />
                </span>
                <Link href={s.href} className={cn('text-sm', done && 'text-muted-foreground line-through')}>
                  {s.label}
                </Link>
                <span className="text-xs text-muted-foreground">{s.hint}</span>
              </li>
            )
          })}
          <li className="flex items-center gap-3 pl-8 text-sm text-muted-foreground">
            Then: <Link href="/admin/qr-cards" className="underline underline-offset-4">print QR cards</Link> or
            <Link href="/claim" className="underline underline-offset-4">test the claim portal</Link>
          </li>
        </ul>
      </CardContent>
    </Card>
  )
}
```

Mount in the dashboard right under the header: `{!checklist.dismissed && !checklistDone ? <GettingStarted checks={checklist} /> : null}`.

- [ ] **Step 5: Verify + commit**

```bash
npm run build && npm run lint
git add src/components/admin/getting-started.tsx src/app/api/admin/claim-toggle src/app/api/admin/checklist src/app/admin/dashboard/page.tsx src/app/admin/settings/page.tsx
git commit -m "feat(dashboard): getting-started checklist; host-accessible claim toggle"
```

### Task 24: Docs + final sweep

**Files:**
- Modify: `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-06-10-event-centric-release-design.md`

- [ ] **Step 1: README** — Routes table gains `/admin/team`, `/forgot-password`, `/reset-password`, `/change-password`; document the event switcher, venue passcode, roles, and `npm run reset-password`.

- [ ] **Step 2: AGENTS.md** — update the schema description (events / event_attendees / people-only attendees / shared code pool), the coupon-assignment pattern reference (`reserveCouponForParticipation`), the roles rule ("admin-only routes pass `{ role: 'admin' }` to requireUser"), and the boot order note (migrate-events before db:push). Fix the stale stack line in CLAUDE.md: the driver is `@libsql/client`, not better-sqlite3.

- [ ] **Step 3: Amend the spec** — in §13, note the implemented mechanism: idempotent `scripts/migrate-events.mjs` + retained `db:push`, replacing the versioned-migrations approach, with one line on why.

- [ ] **Step 4: Full verification**

```bash
npx vitest run && npm run build && npm run lint
```

Expected: all green. Manual sweep in dev: fresh-DB boot → onboarding → checklist → add codes → create event → passcode claim → host login → check-in → reassign.

- [ ] **Step 5: Commit**

```bash
git add README.md AGENTS.md CLAUDE.md docs
git commit -m "docs: event-centric release — routes, roles, schema, boot order"
```
