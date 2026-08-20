# Cafe Cursor MCP server — design

**Date:** 2026-08-20
**Status:** Approved, not yet implemented

## Goal

Let a Cafe Cursor ambassador set up and run an entire event from a Cursor
chat, without opening the admin UI. Two moments, one continuous arc:

- **Day 0.** "Set up Cafe Cursor Bogotá for Sept 12" — creates the event,
  sets the date, configures email, imports codes, reports readiness.
- **Day of.** "Sync Luma and email everyone their code" — syncs the guest
  list, assigns codes, sends mail, reports failures. Then: "how many
  claimed so far?"

The demo value is that an ambassador who has never seen this app can go
from empty deployment to event-ready by describing what they want.

## Architecture

A **remote MCP server mounted inside the existing Next app** at
`/api/mcp`, authenticated by admin-issued API keys.

```
Cursor  ──HTTP+SSE──▶  /api/mcp  ──▶  tool handlers  ──▶  Drizzle / libSQL
        Bearer key         │                                Resend / SMTP
                           └── requireApiKey() ── api_keys table
```

One deployment ships both the app and its MCP server. Nothing to install:
the ambassador pastes a URL and a key into `~/.cursor/mcp.json`, which also
means it works in Cursor's web and mobile clients, not just desktop.

```json
{
  "mcpServers": {
    "cafe-cursor": {
      "url": "https://cdmx.cafecursor.dev/api/mcp",
      "headers": { "Authorization": "Bearer cck_live_a1b2c3..." }
    }
  }
}
```

### Why not a local stdio package

An `npx cafe-cursor-mcp` package was considered and rejected for v1: it
needs a second repo, a publish pipeline, and Node on the ambassador's
machine, and it only works in desktop Cursor. It stays viable as a thin
stdio→HTTP shim later, because the remote endpoint is the real
implementation either way.

### Dependencies

- `@modelcontextprotocol/sdk@^1.30.0` — protocol types and server
- `mcp-handler@^2.1.1` — framework-agnostic HTTP adapter that maps
  Streamable HTTP onto a route handler

Both verified available at these versions on 2026-08-20.

## Authentication

Existing routes authenticate with an `iron-session` cookie. An agent cannot
hold a browser cookie, so MCP needs its own credential path. This is a new
mechanism, deliberately parallel to `requireUser()` rather than replacing
it.

### `api_keys` table

| column        | type    | notes                                        |
|---------------|---------|----------------------------------------------|
| `id`          | integer | pk                                            |
| `name`        | text    | "Ricardo's Cursor" — so keys are revocable by intent |
| `key_hash`    | text    | bcrypt of the full key; the key itself is never stored |
| `key_prefix`  | text    | `cck_live_a1b2` — first 13 chars, for display and lookup narrowing |
| `role`        | text    | `admin` \| `host`, mirroring `users.role`     |
| `created_by`  | integer | fk `users.id`                                 |
| `last_used_at`| text    | null until first call                         |
| `revoked_at`  | text    | null when active                              |
| `created_at`  | text    |                                               |

Format: `cck_live_` + 32 bytes base64url. Shown **once** on creation,
reusing the temp-password disclosure pattern already in
`/api/admin/users`.

### `requireApiKey()`

New guard in `src/lib/auth/api-key.ts`, shaped like `requireUser()` so the
two are visibly siblings:

```ts
requireApiKey(req, opts?: { role?: 'admin' })
  → { key: ApiKey } | { response: NextResponse }
```

Verification looks up candidates by `key_prefix`, then `bcrypt.compare`s
against `key_hash`. Rejects revoked keys. Updates `last_used_at` on
success, best-effort (a failed timestamp write must not fail the call).

Rate limited with the existing `rateLimit()` helper, keyed on
`mcp:<key_prefix>`, using `DEFAULT_WINDOWS`.

### Management UI

Settings → API keys: list (name, prefix, role, last used), create, revoke.
`host`-role keys cannot reach admin-only tools, matching the sidebar's
existing `adminOnly` split.

## Safety model

These tools spend real money and email real people. A misfired bulk
dispatch cannot be undone.

**Tier 1 — free.** Reads and cheap local writes: `event_status`,
`readiness_check`, `find_attendee`, `checkin`, `create_event`, `add_codes`,
`setup_city`, `export_attendees`.

**Tier 2 — gated.** Anything that sends mail, burns codes in bulk, or
deletes: `dispatch_codes`, `configure_email` (sends a test), `sync_luma`
when called with `dispatch: true`.

Gated tools accept `dry_run` (default `true`). A dry run performs no
writes and returns a projection plus a `confirm_token`:

```
WOULD SEND 74 emails
WOULD BURN 74 of 80 codes  →  6 remaining
3 guests have no email on file (listed below)
confirm_token: dr_8f2a...   (single use, expires in 5 minutes)
```

The real call requires that token. Tokens are stored in-process — a Map
keyed by token, holding a hash of the normalized arguments plus an expiry —
and are consumed on use. If the arguments changed between dry run and
confirm, the token is rejected; the agent must re-run the projection.

This mirrors the existing in-memory `rateLimit()` decision and carries the
same constraint: **single-process deployments only.** Documented in
`DEPLOY.md` alongside the existing rate-limiter note.

The dry run is not only a safety rail — it is the most legible moment of
the demo, because it shows the agent's intent before anything irreversible
happens.

## Tools

Thirteen tools, each at the altitude of something an ambassador would say
out loud. Deliberately **not** a 1:1 mirror of the 31 REST routes: bulk loops
live in server code, so an agent cannot half-complete a send.

### Setup

| Tool | Args | Returns |
|---|---|---|
| `setup_city` | `city`, `country?`, `timezone?`, `tagline?` | updated settings; renames still-generic events via existing `adoptCityIntoGenericEvents()` |
| `create_event` | `name?`, `date?`, `passcode?`, `activate?` | event id + resolved name (defaults via `suggestEventName()`) |
| `add_codes` | `codes: string[]` | `{ inserted, duplicates }` — reuses bulk logic in `/api/admin/coupons` |
| `configure_email` | `provider`, `resend_api_key?`, `from_email?`, `smtp_*?`, `dry_run` | saves, then sends a real test email to the key owner |

### Operations

| Tool | Args | Returns |
|---|---|---|
| `sync_luma` | `event_api_id?`, `dispatch?`, `dry_run` | `{ upserted, mirrored, truncated }` (+ dispatch result) |
| `dispatch_codes` | `scope: 'luma' \| 'all_unassigned'`, `dry_run`, `confirm_token?` | `{ assigned, emailed, failed[] }` |
| `resend_failed` | `dry_run`, `confirm_token?` | re-attempts every `email_status = 'failed'` participation |
| `checkin` | `query` (name or email), `checked_in` | resolved attendee + new state |
| `set_claim_portal` | `enabled` | new state |

### Reporting

| Tool | Args | Returns |
|---|---|---|
| `readiness_check` | — | per-item pass/warn/fail + next actions |
| `event_status` | — | registrations, checked in, claimed, remaining, failed emails |
| `find_attendee` | `query` | matches with code, email status, check-in state |
| `export_attendees` | `view: 'event' \| 'people'` | CSV text, escaped via existing `csvCell()` |

### `readiness_check`

Worth calling out: it answers "am I ready for tomorrow?" and is nearly free
to build, because the dashboard checklist already computes this. Expected
to be the most-used tool in practice, independent of the demo.

```
✓ Event      Cafe Cursor CDMX — Aug 21, 2026 (tomorrow)
✓ Codes      80 total, 80 available
✓ Email      Resend, verified sender hello@cafecursor.mx
✗ Luma       not connected
⚠ Claim      portal closed — attendees cannot claim yet
```

## Reuse and new code

Reuse: `reserveCouponForParticipation()`, `dispatchLumaCoupons()`,
`sendCouponEmail()`, `canSendEmail()`, `csvCell()`, `parseAttendeeCsv()`,
`adoptCityIntoGenericEvents()`, `defaultEventName()`, `rateLimit()`.

New: the MCP route and tool registry, `requireApiKey()`, the `api_keys`
table and its settings UI, the confirm-token store, `readiness_check`
aggregation, and dry-run projections for each gated tool.

Roughly 60% new code. The tool layer must not reach into route handlers —
both routes and tools call the same `src/lib` functions, so extracting
shared logic out of a route handler is expected where a tool needs it.

## Error handling

Tool errors return structured MCP errors with actionable text, never raw
stack traces. The failure modes that matter:

- **Out of codes mid-dispatch** — stop, report how many were assigned and
  who was missed. Never partially report success.
- **Email provider unconfigured** — fail before assigning any code, so
  inventory is not burned for mail that cannot go out.
- **Expired or mismatched confirm token** — explain that the projection is
  stale and re-run the dry run.
- **Luma key missing** — name the setting, do not retry.

Every gated tool's response states what actually happened, including
partial outcomes. Silence about a partial failure is the worst outcome for
this app.

## Testing

Unit-testable without a live MCP client, following the existing vitest
setup:

- `requireApiKey()` — valid, wrong, revoked, insufficient role
- Key generation — prefix format, hash round-trip, key never persisted raw
- Confirm tokens — single use, expiry, argument-mismatch rejection
- `readiness_check` — each pass/warn/fail permutation
- `dispatch_codes` dry run — projection matches the real run's effects
- Out-of-codes — partial dispatch reports accurately

Manual E2E: run both demo arcs against a seeded DB through a real Cursor
client before publishing setup docs.

## Out of scope for v1

- OAuth for MCP (API keys are sufficient and simpler to explain)
- Multi-process/serverless confirm-token storage
- MCP resources and prompts (tools only)
- The `npx` stdio wrapper
- Any tool that deletes people or codes — deletion stays in the UI, where
  a human is looking at what they are about to destroy

## Risks

1. **In-memory confirm tokens break on multi-instance deploys.** Same
   constraint as the current rate limiter. Documented, not solved.
2. **An agent could burn the whole code pool** with a wrong `scope`. The
   dry run is the mitigation; `dispatch_codes` also reports remaining
   inventory before and after.
3. **API keys are bearer credentials in a config file.** Revocation UI and
   `last_used_at` visibility are the mitigation.
4. **Tool descriptions are the real UX.** If they are vague, the agent
   picks wrong. Descriptions should be written and iterated against real
   Cursor transcripts, not written once.

## Next step

Implementation plan via the writing-plans skill. Suggested order: auth and
keys first (nothing works without them), then read-only tools (safe to
exercise end-to-end in Cursor), then gated write tools last.
