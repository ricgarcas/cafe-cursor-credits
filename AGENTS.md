# AGENTS.md

> **If you are an AI agent (Claude Code, Cursor, Codex, etc.) working on this
> repo, read this file first. It's the contract for what this codebase is,
> how it's built, and what NOT to do.**

## What this is

**Cafe Cursor** — event registration + Cursor credit distribution for
community meetups. One deployment per city (Mexico City, Toronto, etc.).
Built by and for the [Cursor Ambassador Community](https://cursor.com/ambassadors).

Two audiences:
- **Attendees** — register at `/register` (email) or `/claim` (on-screen code).
- **Ambassadors (admins)** — dashboard to manage attendees, code inventory,
  print branded QR cards, sync Luma guest lists, and email codes in bulk.

## Stack (current, after the Supabase → SQLite migration)

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, React 19, Turbopack) + TypeScript |
| DB | **SQLite** via Drizzle ORM + `better-sqlite3` |
| Auth | **iron-session** cookies + **bcryptjs** |
| UI | shadcn/ui + Tailwind CSS v4, `next-themes`, `sonner` toasts |
| Forms | `react-hook-form` + `zod` |
| Email | Resend (HTML template in `src/lib/emails/`) |
| Events | Luma public API (`public-api.luma.com`) |
| Fonts | Inter (UI), Fraunces italic (taglines), JetBrains Mono (codes) |
| Deploy | Railway (recommended), Fly.io, Vercel+Turso — see `DEPLOY.md` |

**There is no Supabase.** Do not re-introduce `@supabase/*` packages, RLS
policies, or a `createClient`/`createAdminClient` helper. The migration was
deliberate; see git history for context.

## Commands

```bash
npm run init       # one-shot: generate .env.local + create DB (first-run UX)
npm run setup      # just generate .env.local (idempotent, won't overwrite)
npm run dev        # start Next dev server
npm run build      # production build
npm run lint       # ESLint
npm run db:push    # drizzle-kit push --force — applies schema to SQLite
npm run db:studio  # drizzle-kit studio — visual DB browser
npm run db:generate  # generate SQL migration files from schema diff
```

## File layout

```
src/
├── app/
│   ├── (public)  /register, /claim, /login, /admin-register
│   ├── admin/    dashboard, attendees, coupons, qr-cards, luma, settings
│   ├── onboarding/  first-run wizard (outside /admin to avoid redirect loops)
│   └── api/      all server endpoints
├── components/
│   ├── admin/    attendee-management, coupon-management, csv-import-dialog,
│   │             qr-cards-client, luma-client, dashboard-attendees-table,
│   │             sidebar, header
│   ├── brand/    CursorCube SVG, Wordmark
│   ├── onboarding/  wizard
│   ├── public/   shell used by /register, /claim, /login, /admin-register
│   └── ui/       shadcn primitives — DO NOT MODIFY without strong reason
├── lib/
│   ├── auth/     session.ts (iron-session config), users.ts (bcrypt helpers),
│   │             guard.ts (requireUser for route handlers)
│   ├── db/       schema.ts (Drizzle tables), client.ts (lazy singleton)
│   ├── emails/   coupon-email.ts (HTML), send-coupon-email.ts (Resend wrapper)
│   └── luma/     client.ts (API client), sync.ts (refresh + dispatch)
└── proxy.ts       guards /admin/* and /onboarding via iron-session cookie
```

## Conventions

### API routes

Every admin route handler starts with the `requireUser()` guard:

```ts
import { requireUser } from '@/lib/auth/guard'

export async function POST(req: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  // …you have `gate.user` here
}
```

Validate input with `zod.safeParse` and return `NextResponse.json(...)` with
appropriate status. Never throw across the handler boundary.

### Database

- `src/lib/db/client.ts` exports `db` as a **lazy Proxy**. The SQLite file is
  opened on first query, not at module load. Don't call `getDb()` directly;
  don't add top-level DB queries at module scope (it breaks `next build`
  page-data collection).
- WAL mode + foreign keys are enabled on open.
- `ensureDefaultSettings()` is idempotent — call it from any route that
  reads `app_settings` before the admin has gone through onboarding.
- Always import types from `@/lib/db/schema` (e.g. `Attendee`, `AttendeeWithCoupon`).
  Do not invent row shapes.
- **Column naming:** Drizzle uses camelCase (`cityName`), SQLite has
  snake_case (`city_name`). DTOs returned by API routes use snake_case for
  consistency with how the old Supabase API looked. Translate at the edge in
  `rowToDto()`-style helpers.

### Event-centric data model

Three layers: `attendees` = **people** (city-level, one row per email, no
event fields); `event_attendees` = **participation** (one row per person per
event — holds coupon, check-in, email status, source); `coupon_codes` = a
**shared city-level pool** consumed by participations. Public pages and Luma
dispatch bind to the **active** event (`getActiveEvent()`); admins browse the
**selected** event (`getSelectedEvent()`, stored in the session). Helpers live
in `src/lib/db/events.ts` and `src/lib/db/participation.ts`. Legacy
deployments upgrade in-place via `scripts/migrate-events.mjs`, which runs
before `db:push` on boot (see `railway.json`).

### Coupon assignment — race-safe pattern

Use `reserveCouponForParticipation(participationId)` from
`src/lib/db/participation.ts` — a single `UPDATE … WHERE id = (SELECT … LIMIT 1)
RETURNING *` against the shared pool so two concurrent claims can't grab the
same code. Used by `/api/register`, `/api/claim`, `/api/admin/assign-coupon`,
`/api/admin/attendees/[id]/reassign`, and `dispatchLumaCoupons`.

### Roles

`users.role` is `admin` | `host`. Admin-only API routes pass
`requireUser({ role: 'admin' })`; hosts get the day-of tools (dashboard,
attendees, check-in, QR cards, Luma) but not Settings, Team, or coupon
mutations. The sidebar hides admin-only nav for hosts; the API enforces it
regardless. New members are created in `/admin/team` with a one-time password
(`mustChangePassword`). Password recovery is email-based with a
`npm run reset-password` CLI break-glass.

### Secrets

API keys (Resend, Luma) are **never returned raw to the browser**. The
settings GET returns `{key}_masked` (e.g. `secret-••••••••xyz`) plus
`{key}_set: boolean`. The settings form:
1. Seeds the field with the sentinel `__unchanged__` when a key exists.
2. Shows a locked pill + "Change" button that clears the sentinel.
3. On PUT, the server ignores values matching the sentinel or the mask pattern.

Follow this pattern for any new sensitive field.

### Design system

- **Cursor-inspired** aesthetic. Dual theme with `next-themes`:
  - Light: warm cream canvas (`oklch(0.952 0.012 75)`), white cards, black ink.
  - Dark: rich near-black (`oklch(0.135 0.004 60)`), subtle borders.
- **Accents:** orange (`--brand-orange`) for actions/links, green
  (`--brand-green`) for success/progress. Soft variants exist.
- **Pill buttons are default** (`shape="pill"`). Use `rounded` for comboboxes,
  `square` only when absolutely necessary.
- **Cards:** subtle 1px border, **no shadows**. Don't add `shadow-*` classes.
- **Type scale:**
  - Display titles → `className="font-display text-3xl tracking-tight"` (Inter, tight tracking).
  - Taglines / italic accent → `className="font-tagline"` (Fraunces italic).
  - Codes / IDs → `className="font-code"` (JetBrains Mono).
- **Decorative dotted grid:** `className="bg-dotted"` matches Cursor's
  dashboard surfaces.
- **Icons:** Lucide, always sized with `className="size-4"` (or `size-5`/`size-3.5`).
  The `aside` and `nav` selectors already get `stroke-width: 2`.

### Forms

- `react-hook-form` + `zodResolver`, same pattern everywhere.
- Validate per-step in the onboarding wizard with `form.trigger([...])`.
- Show errors via `<FormMessage />`.

### Onboarding gate

The `/admin` layout checks `app_settings.onboarded`. If false, it redirects
to `/onboarding`. The onboarding page lives **outside** the `/admin` tree to
avoid a redirect loop. Don't move it back under `/admin`.

### Luma integration

- Auth header: `x-luma-api-key` (NOT `Authorization: Bearer`).
- Base URL: `https://public-api.luma.com` (the human docs site
  `docs.luma.com` / `docs.lu.ma` is not the API host).
- Pagination is cursor-based (`pagination_cursor` + `has_more` + `next_cursor`).
- Rate limit ≈ 300 req/min — we throttle paginated calls with 200ms delay.
- Calendar-scoped keys don't strictly need `calendar_api_id`, but we pass it
  when `app_settings.luma_calendar_id` is set.
- Sync flow: `refreshLumaEvents` → `syncLumaGuests` (mirrors confirmed
  guests into `attendees`) → `dispatchLumaCoupons` (atomic reserve + email).

### Email

Resend SDK via `createResendClient(apiKey)`. HTML template in
`src/lib/emails/coupon-email.ts`. Defaults to the Resend sandbox sender
(`onboarding@resend.dev`) if `app_settings.from_email` is unset — fine for
dev, swap to a verified sender in production.

## What NOT to do

- ❌ **Don't re-add Supabase** or any database-as-a-service.
- ❌ **Don't add a Resend mock** or a DB mock for tests. If we add tests, use
  a temp SQLite file.
- ❌ **Don't introduce `@/types/database.ts`** — that was the old Supabase
  type file and it's deleted. Import from `@/lib/db/schema` instead.
- ❌ **Don't return raw API keys** from any GET endpoint. Use the masking pattern.
- ❌ **Don't add shadows** to Cards or Buttons — the aesthetic is flat + subtle border.
- ❌ **Don't use `shape="square"`** on primary CTAs. Pills everywhere.
- ❌ **Don't deploy to Vercel without Turso** — SQLite on serverless means data loss. See `DEPLOY.md`.
- ❌ **Don't skip `requireUser()`** on admin routes. Public routes
  (`/api/register`, `/api/claim`, `/api/settings/public`) are the only
  exceptions and they're clearly documented.
- ❌ **Don't open the DB at module scope** — use `db` (lazy proxy) inside handlers.
- ❌ **Don't read the session cookie from MCP code.** An agent has no cookie.
  Use `getActiveEvent()`, never `getSelectedEvent()`, and take identity from
  the OAuth token's `userId`.
- ❌ **Don't add a read-only MCP tool by adding it to `READ_TOOLS` casually.**
  `scopeForTool` treats anything not on that list as write, which is the safe
  default — moving a tool onto the list makes it callable by a read-only token.
- ❌ **Don't compare a SQLite `CURRENT_TIMESTAMP` column against an ISO
  string.** `"YYYY-MM-DD HH:MM:SS"` vs `"...T...Z"` diverge at index 10, where
  `" "` sorts before `"T"`, so same-day rows compare backwards. Write the
  cutoff in the column's own format.
- ❌ **Don't call a route handler from an MCP tool.** Tool handlers import
  from `src/lib/**` directly. If a route holds logic a tool needs, extract
  it to `src/lib` first.
- ❌ **Don't ship a bulk-send or bulk-burn MCP tool without `dry_run` +
  `confirm_token`.** Codes and emails cannot be taken back. No exceptions,
  and never add a flag that skips the gate.
- ❌ **Don't write multi-paragraph doc comments.** If the code needs a
  comment, one line explaining the *why* is enough.

## Environment

See `env.example`. Required:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Path to SQLite file, e.g. `./data/app.db` or `/data/app.db` on Railway volume |
| `SESSION_PASSWORD` | 32+ char random string. Encrypts the iron-session cookie. `npm run setup` generates one. |
| `NEXT_PUBLIC_APP_URL` | Public origin for absolute links in emails |

First admin is bootstrapped via `/admin-register` on a fresh install — the proxy funnels all routes there while `countUsers() === 0`, and the API enforces first-admin-only. No registration secret.

API keys (Resend, Luma) are stored **in the database** via the admin Settings
page, not env vars.

## Typical "first time in this repo" tasks

If someone asks you to:

- **Add a new admin page** → create `src/app/admin/<route>/page.tsx`, add a
  nav entry in `src/components/admin/sidebar.tsx`, use the page-title pattern:
  `<h1 className="font-display text-3xl tracking-tight">…</h1>`.
- **Add a new column** → edit `src/lib/db/schema.ts`, run `npm run db:push`,
  mirror in the settings DTO if user-visible, update the form.
- **Add a new integration API key** → add column, wire through
  `/api/admin/settings` with masking, add input via `<SecretField>` in
  `src/app/admin/settings/page.tsx`.
- **Style something** → use design tokens from `src/app/globals.css`. Don't
  hardcode hex values; use `var(--brand-orange)` / `oklch(…)` via tokens.
- **Send an email** → use `sendCouponEmail` or create a sibling in
  `src/lib/emails/`. Always go through `createResendClient(settings.resendApiKey)`.

## When in doubt

- Read the git log for the file you're touching.
- Read adjacent files — conventions are consistent.
- Match what's already there. This codebase leans terse, flat, and
  Cursor-aesthetic. Keep it that way.
