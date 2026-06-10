# Event-centric release — design spec

**Date:** 2026-06-10
**Status:** Approved direction, pending final review

## Goal

Turn the single-event deployment into an event-centric hub an ambassador can
rely on across a year of meetups, and close the gaps that bite on event day:
open `/claim` portal, no co-host access, no password recovery, silent email
failures, no check-in visibility, no low-inventory warning, no attendee
editing, and no post-onboarding guidance.

**Explicitly out of scope:** scheduled/automatic Luma sync (no background
workers in this deployment model), bounce webhooks, multi-city in one
deployment, audit logs.

## 1. Data model

Three durable layers: **people** and **code inventory** are city-level and
persist across events; **participation** is per-event.

### New table: `events`

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `name` | text | e.g. "Cafe Cursor CDMX — June 2026" |
| `eventDate` | text nullable | display only |
| `status` | enum `draft` / `active` / `archived` | exactly one `active` at a time, enforced in app logic (same pattern as singleton settings) |
| `claimPasscode` | text nullable | venue passcode; empty = open portal |
| `lumaEventApiId` | text nullable | links to `luma_events.api_id` |
| `createdAt`, `updatedAt` | text | |

### New table: `event_attendees` (participation)

One row per person per event. Unique index on (`eventId`, `attendeeId`).

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `eventId` | FK → events | |
| `attendeeId` | FK → attendees | |
| `source` | enum `manual` / `luma` / `website` | moved from `attendees` |
| `registeredAt` | text | moved from `attendees` |
| `couponCodeId` | FK → coupon_codes, nullable | moved from `attendees` |
| `lumaGuestId` | text nullable | moved from `attendees` |
| `checkedInAt` | text nullable | manual toggle or Luma attendance |
| `emailStatus` | enum `sent` / `failed` / `skipped`, nullable | null = never attempted |
| `emailError` | text nullable | last failure message |
| `emailSentAt` | text nullable | |
| `createdAt`, `updatedAt` | text | |

### Changed: `attendees` → people only

Keeps `id`, `name`, `email` (unique), timestamps. **Drops** `couponCodeId`,
`source`, `lumaGuestId`, `lumaEventId`, `registeredAt` (all move to
`event_attendees`). A person who attends three events is one row here, three
rows in `event_attendees`.

### Changed: `coupon_codes` — shared city-level pool

Codes are never owned by an event; they are *consumed* by one, via
`event_attendees.couponCodeId`. Unused codes automatically remain available
to the next event — no import/transfer feature needed. Drop `usedByType`
(derivable via join). Keep `isUsed`/`usedAt` and the atomic
`UPDATE … WHERE id = (SELECT … LIMIT 1) RETURNING *` reservation pattern —
reservation always writes to a participation row now.

`luma_guests.couponCodeId` and `luma_guests.emailSentAt` are deprecated:
dispatch bookkeeping moves to `event_attendees`. `luma_guests` becomes a pure
sync cache.

### Changed: `users`

Add `role` enum `admin` / `host` (default `admin`), `mustChangePassword`
boolean (default false), `resetTokenHash` + `resetTokenExpiresAt` nullable.

### Changed: `app_settings`

Add `checklistDismissed` boolean (default false). `lumaEventId` is removed
(superseded by `events.lumaEventApiId`). `claimEnabled` stays app-level
(global kill switch); the per-event passcode is the per-event gate.

## 2. Active event vs selected event

- **Active event** — the one `events.status = 'active'` row. Public pages
  (`/register`, `/claim`) and Luma dispatch always bind to it via a
  `getActiveEvent()` helper (idempotent `ensureDefaultEvent()` fallback, same
  spirit as `ensureDefaultSettings()`).
- **Selected event** — what the admin is viewing. Stored in the iron-session
  cookie, defaults to the active event. A switcher at the top of the sidebar
  (event name + chevron → dropdown of all events + "New event", admin only
  for create/activate/archive). Switching changes dashboard stats, attendees
  (event lens), coupons-used, QR cards context, and Luma panel.
- "Make active" on an event archives the currently active one. Draft events
  let an admin prepare next month while this month runs.

## 3. Attendees: two lenses

- **Event lens (default):** participations for the selected event — name,
  email, code, source, check-in, email status, registered time. This is the
  day-of view; all existing actions live here.
- **Community lens ("All people"):** every person across all events, with
  events-attended count, first/last seen, CSV export. Read-only except
  delete (removes person + their participations — the GDPR-ish path).

Duplicate-email rules move to per-event: same email can't register twice for
one event (`/register` 400; `/claim` idempotent — returns the existing code),
but registers fresh for the next event and gets a new coupon.

## 4. Team: admins + hosts

- New page `/admin/team` (admin-only): list users, create user, delete user.
- Create flow: name, email, role, generated temp password **shown once**;
  `mustChangePassword = true` forces a password change on first login. No
  email dependency.
- Guards: `requireUser()` gains an optional `{ role: 'admin' }`. Admin-only
  APIs: settings, team, coupon add/edit/delete, event create/activate/archive.
  Host can use: dashboard, attendees (both lenses), check-in, resend/retry
  email, claim toggle, QR cards, Luma sync + dispatch. Because settings is
  admin-only, the claim toggle moves to its own host-accessible endpoint
  (`PATCH /api/admin/claim-toggle`); the settings page keeps its switch,
  pointed at the same endpoint.
- Safety rails: can't delete yourself; can't delete or demote the last admin.
- Sidebar hides admin-only entries for hosts; APIs enforce regardless.

## 5. Password recovery

- `/forgot-password`: email field → always responds "if that account exists,
  we sent a link" (no enumeration). Single-use token, stored hashed,
  1-hour expiry, sent through the existing Resend/SMTP config.
- `/reset-password?token=…`: validates token, sets new password, clears token.
- If email isn't configured, the page says so and points to the break-glass
  path: `npm run reset-password -- <email>` — a CLI script
  (`scripts/reset-password.mjs`) that sets a new password from the server
  shell. Document it in README and `/docs/deploy`.

## 6. Protecting `/claim`

- **Venue passcode:** if the active event has `claimPasscode` set, `/claim`
  asks for it (case-insensitive match) before name/email. The admin dashboard
  shows the passcode large in `font-code` for the projector. New-event form
  suggests a generated 4-character code; clearing it leaves the portal open.
- **Rate limiting:** `src/lib/rate-limit.ts` — in-memory per-IP sliding
  window (single-process deployment; no Redis). Applied to `/api/claim`,
  `/api/register`, `/api/auth/forgot-password`, `/api/auth/login`:
  5/min and 30/hour per IP → 429 with a polite message. Unit-tested.

## 7. Email failure visibility

Every send path (register, claim opt-in, Luma dispatch, manual resend)
records `emailStatus` / `emailError` / `emailSentAt` on the participation row
instead of swallowing errors. UI: subtle status dot in the attendees table
(green sent, neutral skipped, ink-colored failed with tooltip), retry via the
existing resend action. Dashboard shows a quiet "N emails failed" line only
when N > 0.

## 8. Check-in

- Manual toggle on each event-lens attendee row sets/clears `checkedInAt`.
- Luma sync maps `attendance_status` onto the participation's `checkedInAt`
  when Luma reports attendance (no overwrite of an earlier manual check-in).
- Dashboard KPI: "Checked in" count next to registrations.

## 9. Low-inventory banner

Dashboard banner when available codes in the shared pool drop below
**max(10, 15% of total codes)**: slim card, existing 1px border, normal ink,
`font-code` count — "12 codes remaining" + quiet link to Coupons. No accent
colors, no icons.

## 10. Edit attendee + reassign code

Edit modal on event-lens rows: name, email (person-level update; email
uniqueness enforced). Row actions: **assign code** (when none), **reassign**
(atomically reserves a fresh code for the participation; the old code stays
burned — it already shipped in an email), resend/retry email. Typo recovery =
edit email → resend.

## 11. Getting-started checklist

Dismissible dashboard card, rendered only while incomplete and not dismissed.
Steps check real state server-side:

1. Set up your event (complete when the active event has been customized:
   renamed from the default, or given a date or passcode)
2. Add credit codes (pool non-empty)
3. Configure email (provider configured per `canSendEmail()`)
4. Connect Luma — *optional* (API key set)
5. Print QR cards / open the claim portal (link-only step, no completion
   state)

Plain checkmarks, links to the right page per step. The card disappears when
steps 1–3 are done (4–5 are optional) or on dismiss (`checklistDismissed`).

## 12. QR cards

Cards gain the selected event's name under the city wordmark. Code picker
shows the shared pool (unused codes), unchanged otherwise.

## 13. Migration

This release moves the repo from `drizzle-kit push --force` on boot to
**versioned migrations** (`drizzle-kit generate` + `drizzle-kit migrate` in
the start command / `railway.json`), because the data backfill must run
between schema steps:

1. Create `events`, `event_attendees`; add new columns.
2. Data migration (custom SQL step): create one event from
   `app_settings.cityName` ("Cafe Cursor {city}", status `active`); for each
   legacy attendee row, insert an `event_attendees` row carrying
   `couponCodeId`, `source`, `lumaGuestId`, `registeredAt`; map
   `luma_guests.emailSentAt` onto the matching participation's
   `emailStatus`/`emailSentAt`.
3. Drop moved columns from `attendees`, drop `coupon_codes.usedByType`,
   drop `app_settings.lumaEventId`.

`npm run db:push` remains for local dev iteration; production boots run
migrations. Fresh installs get the default event via `ensureDefaultEvent()`.
Existing deployments upgrade in place; nothing user-visible changes until the
admin renames the default event.

## 14. Testing

- Unit: rate limiter windows, passcode check, role guard matrix
  (admin/host × endpoints), reset-token lifecycle (issue/expire/single-use),
  checklist state computation, banner threshold.
- Extend `coupon-reservation.test.ts`: reservation against participation
  rows; per-event duplicate rules; reassign keeps old code burned.
- Luma dispatch tests updated for participation-based bookkeeping and
  check-in mapping.
- `npm run build` + `npm run lint` clean; new env-free (no new env vars).

## 15. UI conventions

Everything follows AGENTS.md: pill buttons, 1px borders, no shadows, no new
accent colors, `font-display` page titles, `font-code` for codes/passcodes.
New sidebar entries: Team (admin-only). Event switcher lives above the nav in
the sidebar.
