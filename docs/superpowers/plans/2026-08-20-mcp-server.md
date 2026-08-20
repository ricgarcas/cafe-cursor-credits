# Cafe Cursor MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Cafe Cursor ambassador set up and run an entire event from a Cursor chat, via a remote MCP server mounted inside the existing Next app.

**Architecture:** A single route handler at `/api/mcp` exposes thirteen task-shaped MCP tools. Requests authenticate with bcrypt-hashed API keys (new `api_keys` table), not the browser session cookie. Tools that send email or burn codes in bulk require a two-phase dry-run/confirm handshake. Tool handlers call the same `src/lib/*` functions the REST routes call — they never call the route handlers.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Drizzle ORM + libSQL/SQLite, bcryptjs, Zod, Vitest, `@modelcontextprotocol/sdk`, `mcp-handler`.

**Spec:** `docs/superpowers/specs/2026-08-20-mcp-server-design.md`

## Global Constraints

- Dependencies to add, exact versions: `@modelcontextprotocol/sdk@^1.30.0`, `mcp-handler@^2.1.1`. Add nothing else.
- **Never re-add Supabase.** No `@supabase`, `createAdminClient`, or `@/types/database` references. See `AGENTS.md`.
- After editing `src/lib/db/schema.ts`, always run `npm run db:push` before `npm run build`.
- Every task ends green: `npm test`, `npm run lint` (0 errors), `npm run build`.
- Comments: terse one-liners, only where the *why* is non-obvious. No multi-paragraph doc comments.
- API key format: `cck_live_` + 32 random bytes base64url. `key_prefix` is the **first 13 characters** of the full key (`cck_live_` is 9 chars + 4 more).
- Confirm tokens: prefix `dr_`, single-use, **5 minute** expiry, stored in-process.
- Tool handlers import from `src/lib/**` only. Never import a route handler.
- New env vars must be added to BOTH `env.example` AND `scripts/setup.mjs`.
- Tests live beside their source as `*.test.ts` and run under `environment: 'node'`. `tests/setup.ts` wipes `data/test.db` before every file; `fileParallelism` is off.

---

### Task 1: `api_keys` schema + key generation

**Files:**
- Modify: `src/lib/db/schema.ts` (append after the `users` table, ~line 30)
- Create: `src/lib/auth/api-key.ts`
- Test: `src/lib/auth/api-key.test.ts`

**Interfaces:**
- Consumes: `db` from `@/lib/db/client`; `hashPassword`/`verifyPassword` patterns from `@/lib/auth/users`
- Produces:
  - `apiKeys` Drizzle table; types `ApiKey = typeof apiKeys.$inferSelect`, `NewApiKey`
  - `generateApiKey(): { key: string; prefix: string }`
  - `createApiKey(params: { name: string; role: 'admin' | 'host'; createdBy: number }): Promise<{ record: ApiKey; key: string }>`
  - `verifyApiKey(rawKey: string): Promise<ApiKey | null>`
  - `revokeApiKey(id: number): Promise<boolean>`
  - `listApiKeys(): Promise<ApiKey[]>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/api-key.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db/client'
import { apiKeys, users } from '@/lib/db/schema'
import { createUser } from './users'
import {
  generateApiKey,
  createApiKey,
  verifyApiKey,
  revokeApiKey,
  listApiKeys,
} from './api-key'

async function seedAdmin() {
  return createUser({
    name: 'Admin',
    email: `admin${Math.random()}@example.com`,
    password: 'password123',
    role: 'admin',
  })
}

describe('generateApiKey', () => {
  it('produces a prefixed key and a 13-char prefix', () => {
    const { key, prefix } = generateApiKey()
    expect(key.startsWith('cck_live_')).toBe(true)
    expect(prefix).toBe(key.slice(0, 13))
    expect(prefix).toHaveLength(13)
  })

  it('is unique across calls', () => {
    expect(generateApiKey().key).not.toBe(generateApiKey().key)
  })
})

describe('createApiKey', () => {
  beforeEach(async () => {
    await db.delete(apiKeys)
    await db.delete(users)
  })

  it('returns the raw key once and never stores it', async () => {
    const admin = await seedAdmin()
    const { record, key } = await createApiKey({
      name: "Ricardo's Cursor",
      role: 'admin',
      createdBy: admin.id,
    })
    expect(key.startsWith('cck_live_')).toBe(true)
    expect(record.keyHash).not.toBe(key)
    expect(record.keyHash).toMatch(/^\$2[aby]\$/)
    expect(record.keyPrefix).toBe(key.slice(0, 13))
    expect(record.name).toBe("Ricardo's Cursor")
    expect(record.revokedAt).toBeNull()
  })
})

describe('verifyApiKey', () => {
  beforeEach(async () => {
    await db.delete(apiKeys)
    await db.delete(users)
  })

  it('resolves a valid key to its record', async () => {
    const admin = await seedAdmin()
    const { key, record } = await createApiKey({ name: 'k', role: 'admin', createdBy: admin.id })
    const found = await verifyApiKey(key)
    expect(found?.id).toBe(record.id)
  })

  it('rejects a wrong key', async () => {
    const admin = await seedAdmin()
    await createApiKey({ name: 'k', role: 'admin', createdBy: admin.id })
    expect(await verifyApiKey('cck_live_totallywrongkeyvalue')).toBeNull()
  })

  it('rejects a revoked key', async () => {
    const admin = await seedAdmin()
    const { key, record } = await createApiKey({ name: 'k', role: 'admin', createdBy: admin.id })
    await revokeApiKey(record.id)
    expect(await verifyApiKey(key)).toBeNull()
  })

  it('records last_used_at on success', async () => {
    const admin = await seedAdmin()
    const { key } = await createApiKey({ name: 'k', role: 'admin', createdBy: admin.id })
    await verifyApiKey(key)
    const [row] = await listApiKeys()
    expect(row.lastUsedAt).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/api-key.test.ts`
Expected: FAIL — cannot resolve `./api-key`.

- [ ] **Step 3: Add the schema table**

Append to `src/lib/db/schema.ts` after the `users` table definition:

```ts
/**
 * Bearer credentials for the MCP server. Agents can't hold a session cookie,
 * so keys are the parallel auth path. Only the bcrypt hash is stored.
 */
export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    role: text('role', { enum: ['admin', 'host'] }).notNull().default('admin'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    lastUsedAt: text('last_used_at'),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    prefixIdx: index('api_keys_prefix_idx').on(t.keyPrefix),
  }),
)

export type ApiKey = typeof apiKeys.$inferSelect
export type NewApiKey = typeof apiKeys.$inferInsert
```

- [ ] **Step 4: Push the schema**

Run: `npm run db:push`
Expected: `[✓] Changes applied`.

- [ ] **Step 5: Write the implementation**

Create `src/lib/auth/api-key.ts`:

```ts
import 'server-only'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { desc, eq, isNull, and } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { apiKeys, type ApiKey } from '@/lib/db/schema'

const SALT_ROUNDS = 10
const PREFIX = 'cck_live_'

/** Raw key is shown once at creation and never persisted. */
export function generateApiKey(): { key: string; prefix: string } {
  const key = PREFIX + randomBytes(32).toString('base64url')
  return { key, prefix: key.slice(0, 13) }
}

export async function createApiKey(params: {
  name: string
  role: 'admin' | 'host'
  createdBy: number
}): Promise<{ record: ApiKey; key: string }> {
  const { key, prefix } = generateApiKey()
  const [record] = await db
    .insert(apiKeys)
    .values({
      name: params.name,
      keyHash: await bcrypt.hash(key, SALT_ROUNDS),
      keyPrefix: prefix,
      role: params.role,
      createdBy: params.createdBy,
    })
    .returning()
  return { record, key }
}

/** Narrows by prefix, then bcrypt-compares. Returns null for revoked keys. */
export async function verifyApiKey(rawKey: string): Promise<ApiKey | null> {
  if (!rawKey?.startsWith(PREFIX)) return null
  const candidates = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyPrefix, rawKey.slice(0, 13)), isNull(apiKeys.revokedAt)))
  for (const row of candidates) {
    if (await bcrypt.compare(rawKey, row.keyHash)) {
      // Best-effort: a failed timestamp write must not fail the request.
      try {
        await db
          .update(apiKeys)
          .set({ lastUsedAt: new Date().toISOString() })
          .where(eq(apiKeys.id, row.id))
      } catch {}
      return row
    }
  }
  return null
}

export async function revokeApiKey(id: number): Promise<boolean> {
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(apiKeys.id, id))
    .returning()
  return Boolean(row)
}

export async function listApiKeys(): Promise<ApiKey[]> {
  return db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt))
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/auth/api-key.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Verify the whole suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass; 0 lint errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/schema.ts src/lib/auth/api-key.ts src/lib/auth/api-key.test.ts
git commit -m "feat(mcp): api_keys table and key generation"
```

---

### Task 2: `requireApiKey()` request guard

**Files:**
- Modify: `src/lib/auth/api-key.ts` (append)
- Test: `src/lib/auth/api-key.test.ts` (append)

**Interfaces:**
- Consumes: `verifyApiKey` (Task 1); `rateLimit`, `clientIp`, `tooManyRequests` from `@/lib/rate-limit`
- Produces: `requireApiKey(request: Request, opts?: { role?: 'admin' }): Promise<{ key: ApiKey } | { response: NextResponse }>`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/auth/api-key.test.ts`:

```ts
import { requireApiKey } from './api-key'
import { resetRateLimits } from '@/lib/rate-limit'

function req(auth?: string) {
  return new Request('http://localhost/api/mcp', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('requireApiKey', () => {
  beforeEach(async () => {
    await db.delete(apiKeys)
    await db.delete(users)
    resetRateLimits()
  })

  it('401s with no Authorization header', async () => {
    const gate = await requireApiKey(req())
    expect('response' in gate && gate.response.status).toBe(401)
  })

  it('401s on an unknown key', async () => {
    const gate = await requireApiKey(req('Bearer cck_live_nope'))
    expect('response' in gate && gate.response.status).toBe(401)
  })

  it('resolves a valid key', async () => {
    const admin = await seedAdmin()
    const { key } = await createApiKey({ name: 'k', role: 'admin', createdBy: admin.id })
    const gate = await requireApiKey(req(`Bearer ${key}`))
    expect('key' in gate).toBe(true)
  })

  it('403s a host key when admin is required', async () => {
    const admin = await seedAdmin()
    const { key } = await createApiKey({ name: 'k', role: 'host', createdBy: admin.id })
    const gate = await requireApiKey(req(`Bearer ${key}`), { role: 'admin' })
    expect('response' in gate && gate.response.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/api-key.test.ts -t requireApiKey`
Expected: FAIL — `requireApiKey is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/auth/api-key.ts` (and add `import { NextResponse } from 'next/server'` plus `import { rateLimit, tooManyRequests } from '@/lib/rate-limit'` to the top):

```ts
/**
 * MCP counterpart to requireUser(). Returns `{ key }` on success, or a
 * NextResponse the caller should return directly.
 */
export async function requireApiKey(
  request: Request,
  opts?: { role?: 'admin' },
): Promise<{ key: ApiKey } | { response: NextResponse }> {
  const header = request.headers.get('authorization') ?? ''
  const raw = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!raw) {
    return { response: NextResponse.json({ error: 'Missing API key' }, { status: 401 }) }
  }
  if (!rateLimit(`mcp:${raw.slice(0, 13)}`)) return { response: tooManyRequests() }

  const key = await verifyApiKey(raw)
  if (!key) {
    return { response: NextResponse.json({ error: 'Invalid API key' }, { status: 401 }) }
  }
  if (opts?.role === 'admin' && key.role !== 'admin') {
    return { response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }
  return { key }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth/api-key.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Verify and commit**

```bash
npm test && npm run lint
git add src/lib/auth/api-key.ts src/lib/auth/api-key.test.ts
git commit -m "feat(mcp): requireApiKey request guard"
```

---

### Task 3: API key management routes

**Files:**
- Create: `src/app/api/admin/api-keys/route.ts`
- Create: `src/app/api/admin/api-keys/[id]/route.ts`

**Interfaces:**
- Consumes: `createApiKey`, `listApiKeys`, `revokeApiKey` (Task 1); `requireUser` from `@/lib/auth/guard`
- Produces: `GET/POST /api/admin/api-keys`, `DELETE /api/admin/api-keys/:id`. POST response shape: `{ success: true, api_key: { id, name, key_prefix, role }, key: string }`

- [ ] **Step 1: Write the list + create route**

Create `src/app/api/admin/api-keys/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiKey, listApiKeys } from '@/lib/auth/api-key'
import { requireUser } from '@/lib/auth/guard'

export async function GET() {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const rows = await listApiKeys()
  return NextResponse.json({
    api_keys: rows.map((k) => ({
      id: k.id,
      name: k.name,
      key_prefix: k.keyPrefix,
      role: k.role,
      last_used_at: k.lastUsedAt,
      revoked_at: k.revokedAt,
      created_at: k.createdAt,
    })),
  })
}

const createSchema = z.object({
  name: z.string().min(1).max(255),
  role: z.enum(['admin', 'host']),
})

export async function POST(request: NextRequest) {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { record, key } = await createApiKey({ ...parsed.data, createdBy: gate.user.id })
  // `key` is returned exactly once — it is not recoverable afterwards.
  return NextResponse.json({
    success: true,
    api_key: { id: record.id, name: record.name, key_prefix: record.keyPrefix, role: record.role },
    key,
  })
}
```

- [ ] **Step 2: Write the revoke route**

Create `src/app/api/admin/api-keys/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { revokeApiKey } from '@/lib/auth/api-key'
import { requireUser } from '@/lib/auth/guard'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const { id } = await params
  const keyId = Number(id)
  if (!Number.isFinite(keyId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  if (!(await revokeApiKey(keyId))) {
    return NextResponse.json({ error: 'API key not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: compiles; the two new routes appear in the route list; 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/api-keys
git commit -m "feat(mcp): api key management routes"
```

---

### Task 4: Confirm-token store

**Files:**
- Create: `src/lib/mcp/confirm-token.ts`
- Test: `src/lib/mcp/confirm-token.test.ts`

**Interfaces:**
- Produces:
  - `issueConfirmToken(toolName: string, args: unknown, now?: number): string`
  - `consumeConfirmToken(token: string, toolName: string, args: unknown, now?: number): { ok: true } | { ok: false; reason: 'unknown' | 'expired' | 'args_changed' }`
  - `resetConfirmTokens(): void`
  - `CONFIRM_TOKEN_TTL_MS` (= `300_000`)

- [ ] **Step 1: Write the failing test**

Create `src/lib/mcp/confirm-token.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  issueConfirmToken,
  consumeConfirmToken,
  resetConfirmTokens,
  CONFIRM_TOKEN_TTL_MS,
} from './confirm-token'

const ARGS = { scope: 'luma' }

describe('confirm tokens', () => {
  beforeEach(() => resetConfirmTokens())

  it('issues a dr_-prefixed token', () => {
    expect(issueConfirmToken('dispatch_codes', ARGS)).toMatch(/^dr_/)
  })

  it('accepts a matching token once', () => {
    const t = issueConfirmToken('dispatch_codes', ARGS)
    expect(consumeConfirmToken(t, 'dispatch_codes', ARGS)).toEqual({ ok: true })
  })

  it('rejects reuse of a consumed token', () => {
    const t = issueConfirmToken('dispatch_codes', ARGS)
    consumeConfirmToken(t, 'dispatch_codes', ARGS)
    expect(consumeConfirmToken(t, 'dispatch_codes', ARGS)).toEqual({
      ok: false,
      reason: 'unknown',
    })
  })

  it('rejects an unknown token', () => {
    expect(consumeConfirmToken('dr_nope', 'dispatch_codes', ARGS)).toEqual({
      ok: false,
      reason: 'unknown',
    })
  })

  it('rejects an expired token', () => {
    const t = issueConfirmToken('dispatch_codes', ARGS, 1_000)
    const later = 1_000 + CONFIRM_TOKEN_TTL_MS + 1
    expect(consumeConfirmToken(t, 'dispatch_codes', ARGS, later)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('rejects when the arguments changed', () => {
    const t = issueConfirmToken('dispatch_codes', ARGS)
    expect(consumeConfirmToken(t, 'dispatch_codes', { scope: 'all_unassigned' })).toEqual({
      ok: false,
      reason: 'args_changed',
    })
  })

  it('rejects when the tool name changed', () => {
    const t = issueConfirmToken('dispatch_codes', ARGS)
    expect(consumeConfirmToken(t, 'resend_failed', ARGS)).toEqual({
      ok: false,
      reason: 'args_changed',
    })
  })

  it('ignores dry_run and confirm_token when fingerprinting', () => {
    const t = issueConfirmToken('dispatch_codes', { scope: 'luma', dry_run: true })
    expect(
      consumeConfirmToken(t, 'dispatch_codes', {
        scope: 'luma',
        dry_run: false,
        confirm_token: t,
      }),
    ).toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/mcp/confirm-token.test.ts`
Expected: FAIL — cannot resolve `./confirm-token`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/mcp/confirm-token.ts`:

```ts
import { createHash, randomBytes } from 'crypto'

export const CONFIRM_TOKEN_TTL_MS = 300_000 // 5 minutes

// In-memory on purpose, matching the rate limiter: this app runs as one
// process. Multi-instance deploys need a shared store.
const tokens = new Map<string, { fingerprint: string; expiresAt: number }>()

/** `dry_run` and `confirm_token` are handshake plumbing, not intent. */
function fingerprint(toolName: string, args: unknown): string {
  const rest = { ...(args as Record<string, unknown>) }
  delete rest.dry_run
  delete rest.confirm_token
  const stable = JSON.stringify(rest, Object.keys(rest).sort())
  return createHash('sha256').update(`${toolName}:${stable}`).digest('hex')
}

export function issueConfirmToken(toolName: string, args: unknown, now = Date.now()): string {
  const token = `dr_${randomBytes(12).toString('hex')}`
  tokens.set(token, {
    fingerprint: fingerprint(toolName, args),
    expiresAt: now + CONFIRM_TOKEN_TTL_MS,
  })
  return token
}

export function consumeConfirmToken(
  token: string,
  toolName: string,
  args: unknown,
  now = Date.now(),
): { ok: true } | { ok: false; reason: 'unknown' | 'expired' | 'args_changed' } {
  const entry = tokens.get(token)
  if (!entry) return { ok: false, reason: 'unknown' }
  if (now > entry.expiresAt) {
    tokens.delete(token)
    return { ok: false, reason: 'expired' }
  }
  if (entry.fingerprint !== fingerprint(toolName, args)) {
    return { ok: false, reason: 'args_changed' }
  }
  tokens.delete(token) // single use
  return { ok: true }
}

export function resetConfirmTokens() {
  tokens.clear()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/mcp/confirm-token.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Verify and commit**

```bash
npm test && npm run lint
git add src/lib/mcp/confirm-token.ts src/lib/mcp/confirm-token.test.ts
git commit -m "feat(mcp): single-use confirm tokens for gated tools"
```

---

### Task 5: `readiness_check` aggregation

**Files:**
- Create: `src/lib/mcp/readiness.ts`
- Test: `src/lib/mcp/readiness.test.ts`

**Interfaces:**
- Consumes: `getSelectedEvent` from `@/lib/db/events`; `canSendEmail` from `@/lib/emails/send-coupon-email`; `formatEventDate`, `eventDayLabel` from `@/lib/event-date`; `appSettings`, `couponCodes` schema
- Produces:
  - `type ReadinessItem = { key: string; status: 'pass' | 'warn' | 'fail'; label: string; detail: string; action?: string }`
  - `getReadiness(): Promise<{ ready: boolean; items: ReadinessItem[] }>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/mcp/readiness.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db/client'
import { appSettings, couponCodes, events, eventAttendees } from '@/lib/db/schema'
import { getReadiness } from './readiness'

const byKey = (items: Awaited<ReturnType<typeof getReadiness>>['items'], key: string) =>
  items.find((i) => i.key === key)!

describe('getReadiness', () => {
  beforeEach(async () => {
    await db.delete(eventAttendees)
    await db.delete(couponCodes)
    await db.delete(events)
    await db.delete(appSettings)
  })

  it('fails every gate on an empty deployment', async () => {
    const { ready, items } = await getReadiness()
    expect(ready).toBe(false)
    expect(byKey(items, 'codes').status).toBe('fail')
    expect(byKey(items, 'email').status).toBe('fail')
    expect(byKey(items, 'luma').status).toBe('fail')
  })

  it('passes codes once inventory exists', async () => {
    await db.insert(couponCodes).values([{ code: 'A1' }, { code: 'B2' }])
    const { items } = await getReadiness()
    const codes = byKey(items, 'codes')
    expect(codes.status).toBe('pass')
    expect(codes.detail).toContain('2')
  })

  it('warns when every code is already used', async () => {
    await db.insert(couponCodes).values([{ code: 'A1', isUsed: true }])
    expect(byKey((await getReadiness()).items, 'codes').status).toBe('warn')
  })

  it('passes email when a resend key is configured', async () => {
    await db.insert(appSettings).values({
      cityName: 'CDMX',
      emailProvider: 'resend',
      resendApiKey: 're_test',
    })
    expect(byKey((await getReadiness()).items, 'email').status).toBe('pass')
  })

  it('warns when the claim portal is closed', async () => {
    await db.insert(appSettings).values({ cityName: 'CDMX', claimEnabled: false })
    expect(byKey((await getReadiness()).items, 'claim').status).toBe('warn')
  })

  it('is ready when event, codes and email all pass', async () => {
    await db.insert(appSettings).values({
      cityName: 'CDMX',
      emailProvider: 'resend',
      resendApiKey: 're_test',
      claimEnabled: true,
    })
    await db.insert(events).values({
      name: 'Cafe Cursor CDMX',
      eventDate: '2026-09-12',
      status: 'active',
    })
    await db.insert(couponCodes).values([{ code: 'A1' }])
    expect((await getReadiness()).ready).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/mcp/readiness.test.ts`
Expected: FAIL — cannot resolve `./readiness`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/mcp/readiness.ts`:

```ts
import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { appSettings, couponCodes } from '@/lib/db/schema'
import { getSelectedEvent } from '@/lib/db/events'
import { canSendEmail } from '@/lib/emails/send-coupon-email'
import { eventDayLabel, formatEventDate } from '@/lib/event-date'

export type ReadinessItem = {
  key: string
  status: 'pass' | 'warn' | 'fail'
  label: string
  detail: string
  action?: string
}

/** Same gates as the dashboard checklist, shaped for an agent to read aloud. */
export async function getReadiness(): Promise<{ ready: boolean; items: ReadinessItem[] }> {
  await ensureDefaultSettings()
  const event = await getSelectedEvent()
  const [[settings], [total], [available]] = await Promise.all([
    db.select().from(appSettings).limit(1),
    db.select({ c: sql<number>`count(*)` }).from(couponCodes),
    db.select({ c: sql<number>`count(*)` }).from(couponCodes).where(eq(couponCodes.isUsed, false)),
  ])

  const totalCodes = Number(total?.c ?? 0)
  const availableCodes = Number(available?.c ?? 0)
  const dateLabel = formatEventDate(event.eventDate)
  const dayLabel = eventDayLabel(event.eventDate)

  const items: ReadinessItem[] = [
    {
      key: 'event',
      status: event.eventDate ? 'pass' : 'warn',
      label: 'Event',
      detail: event.eventDate
        ? `${event.name} — ${dateLabel}${dayLabel ? ` (${dayLabel.toLowerCase()})` : ''}`
        : `${event.name} — no date set`,
      action: event.eventDate ? undefined : 'Set a date with create_event or in Settings → General',
    },
    {
      key: 'codes',
      status: totalCodes === 0 ? 'fail' : availableCodes === 0 ? 'warn' : 'pass',
      label: 'Codes',
      detail:
        totalCodes === 0
          ? 'no codes imported'
          : `${totalCodes} total, ${availableCodes} available`,
      action: availableCodes === 0 ? 'Import more codes with add_codes' : undefined,
    },
    {
      key: 'email',
      status: canSendEmail(settings) ? 'pass' : 'fail',
      label: 'Email',
      detail: canSendEmail(settings)
        ? `${settings.emailProvider}, sender ${settings.fromEmail ?? 'default'}`
        : 'not configured — codes cannot be emailed',
      action: canSendEmail(settings) ? undefined : 'Run configure_email',
    },
    {
      key: 'luma',
      status: settings?.lumaApiKey ? 'pass' : 'fail',
      label: 'Luma',
      detail: settings?.lumaApiKey ? 'connected' : 'not connected (optional)',
      action: settings?.lumaApiKey ? undefined : 'Add a Luma API key in Settings → Luma',
    },
    {
      key: 'claim',
      status: settings?.claimEnabled ? 'pass' : 'warn',
      label: 'Claim portal',
      detail: settings?.claimEnabled ? 'open' : 'closed — attendees cannot claim',
      action: settings?.claimEnabled ? undefined : 'Open it with set_claim_portal',
    },
  ]

  // Luma is optional; readiness turns on the gates that block handing out codes.
  const ready = ['event', 'codes', 'email'].every(
    (k) => items.find((i) => i.key === k)!.status === 'pass',
  )
  return { ready, items }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/mcp/readiness.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Verify and commit**

```bash
npm test && npm run lint
git add src/lib/mcp/readiness.ts src/lib/mcp/readiness.test.ts
git commit -m "feat(mcp): readiness aggregation"
```

---

### Task 6: Dispatch projection + execution

**Files:**
- Create: `src/lib/mcp/dispatch.ts`
- Test: `src/lib/mcp/dispatch.test.ts`

**Interfaces:**
- Consumes: `reserveCouponForParticipation`, `recordEmailResult` from `@/lib/db/participation`; `sendCouponEmail`, `canSendEmail` from `@/lib/emails/send-coupon-email`; `getSelectedEvent` from `@/lib/db/events`
- Produces:
  - `type DispatchScope = 'luma' | 'all_unassigned'`
  - `type DispatchProjection = { wouldEmail: number; wouldBurn: number; availableCodes: number; remainingAfter: number; shortfall: number; emailConfigured: boolean }`
  - `projectDispatch(scope: DispatchScope): Promise<DispatchProjection>`
  - `runDispatch(scope: DispatchScope): Promise<{ assigned: number; emailed: number; failed: { email: string; error: string }[]; outOfCodes: boolean }>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/mcp/dispatch.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
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

describe('projectDispatch', () => {
  beforeEach(async () => {
    await db.delete(eventAttendees)
    await db.delete(attendees)
    await db.delete(couponCodes)
    await db.delete(events)
    await db.delete(appSettings)
  })

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
  beforeEach(async () => {
    await db.delete(eventAttendees)
    await db.delete(attendees)
    await db.delete(couponCodes)
    await db.delete(events)
    await db.delete(appSettings)
  })

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
```

Note: add `import { eq } from 'drizzle-orm'` at the top of this test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/mcp/dispatch.test.ts`
Expected: FAIL — cannot resolve `./dispatch`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/mcp/dispatch.ts`:

```ts
import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { appSettings, attendees, couponCodes, eventAttendees } from '@/lib/db/schema'
import { getSelectedEvent } from '@/lib/db/events'
import { reserveCouponForParticipation, recordEmailResult } from '@/lib/db/participation'
import { canSendEmail, sendCouponEmail } from '@/lib/emails/send-coupon-email'

export type DispatchScope = 'luma' | 'all_unassigned'

export type DispatchProjection = {
  wouldEmail: number
  wouldBurn: number
  availableCodes: number
  remainingAfter: number
  shortfall: number
  emailConfigured: boolean
}

/** Participations still needing a code or a successful send. */
async function pendingFor(scope: DispatchScope) {
  const event = await getSelectedEvent()
  const sourceFilter = scope === 'luma' ? sql`AND ${eventAttendees.source} = 'luma'` : sql``
  return db
    .select()
    .from(eventAttendees)
    .innerJoin(attendees, eq(eventAttendees.attendeeId, attendees.id))
    .where(
      sql`${eventAttendees.eventId} = ${event.id}
          ${sourceFilter}
          AND (${eventAttendees.couponCodeId} IS NULL
               OR ${eventAttendees.emailStatus} IS NULL
               OR ${eventAttendees.emailStatus} != 'sent')`,
    )
}

/** Read-only. Must never write — it backs the dry run. */
export async function projectDispatch(scope: DispatchScope): Promise<DispatchProjection> {
  const [pending, [settings], [available]] = await Promise.all([
    pendingFor(scope),
    db.select().from(appSettings).limit(1),
    db.select({ c: sql<number>`count(*)` }).from(couponCodes).where(eq(couponCodes.isUsed, false)),
  ])
  const availableCodes = Number(available?.c ?? 0)
  const needCode = pending.filter((r) => r.event_attendees.couponCodeId == null).length
  const wouldBurn = Math.min(needCode, availableCodes)
  return {
    wouldEmail: Math.min(pending.length, wouldBurn + (pending.length - needCode)),
    wouldBurn,
    availableCodes,
    remainingAfter: availableCodes - wouldBurn,
    shortfall: Math.max(0, needCode - availableCodes),
    emailConfigured: canSendEmail(settings),
  }
}

export async function runDispatch(scope: DispatchScope) {
  const [pending, [settings]] = await Promise.all([
    pendingFor(scope),
    db.select().from(appSettings).limit(1),
  ])

  let assigned = 0
  let emailed = 0
  let outOfCodes = false
  const failed: { email: string; error: string }[] = []

  for (const row of pending) {
    const participation = row.event_attendees
    const person = row.attendees
    let couponId = participation.couponCodeId

    if (couponId == null) {
      const coupon = await reserveCouponForParticipation(participation.id)
      if (!coupon) {
        outOfCodes = true
        break
      }
      couponId = coupon.id
      assigned++
    }

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
      // Resend allows ~2 req/s — pace bulk sends so big lists don't 429.
      if (emailed > 0) await new Promise((r) => setTimeout(r, 600))
      await sendCouponEmail({
        settings,
        attendee: { name: person.name, email: person.email },
        couponCode: coupon,
        fromName: `Cafe Cursor ${settings.cityName}`,
      })
      await recordEmailResult(participation.id, 'sent')
      emailed++
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      await recordEmailResult(participation.id, 'failed', error)
      failed.push({ email: person.email, error })
    }
  }

  return { assigned, emailed, failed, outOfCodes }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/mcp/dispatch.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Verify and commit**

```bash
npm test && npm run lint
git add src/lib/mcp/dispatch.ts src/lib/mcp/dispatch.test.ts
git commit -m "feat(mcp): dispatch projection and execution"
```

---

### Task 7: MCP route + read-only tools

**Files:**
- Modify: `package.json` (add two dependencies)
- Create: `src/app/api/mcp/route.ts`
- Create: `src/lib/mcp/tools-read.ts`
- Test: `src/lib/mcp/tools-read.test.ts`

**Interfaces:**
- Consumes: `getReadiness` (Task 5); `getSelectedEvent`; `csvCell`, `parseAttendeeCsv` from `@/lib/csv`
- Produces:
  - `eventStatus(): Promise<{ event: string; date: string | null; registrations: number; checkedIn: number; claimed: number; remaining: number; failedEmails: number }>`
  - `findAttendee(query: string): Promise<{ name: string; email: string; code: string | null; emailStatus: string | null; checkedIn: boolean }[]>`
  - `exportAttendees(view: 'event' | 'people'): Promise<string>`
  - `registerReadTools(server)` — registers `readiness_check`, `event_status`, `find_attendee`, `export_attendees`

- [ ] **Step 1: Install the dependencies**

```bash
npm install @modelcontextprotocol/sdk@^1.30.0 mcp-handler@^2.1.1
```

Expected: both added to `package.json` dependencies.

- [ ] **Step 2: Write the failing test**

Create `src/lib/mcp/tools-read.test.ts`:

```ts
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

describe('eventStatus', () => {
  beforeEach(async () => {
    await db.delete(eventAttendees)
    await db.delete(attendees)
    await db.delete(couponCodes)
    await db.delete(events)
    await db.delete(appSettings)
  })

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
  beforeEach(async () => {
    await db.delete(eventAttendees)
    await db.delete(attendees)
    await db.delete(couponCodes)
    await db.delete(events)
    await db.delete(appSettings)
  })

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
  beforeEach(async () => {
    await db.delete(eventAttendees)
    await db.delete(attendees)
    await db.delete(couponCodes)
    await db.delete(events)
    await db.delete(appSettings)
  })

  it('emits a header row and one row per attendee', async () => {
    await seed()
    const lines = (await exportAttendees('event')).trim().split('\n')
    expect(lines[0]).toContain('Name')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('Ada Lovelace')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/mcp/tools-read.test.ts`
Expected: FAIL — cannot resolve `./tools-read`.

- [ ] **Step 4: Write the query helpers**

Create `src/lib/mcp/tools-read.ts`:

```ts
import 'server-only'
import { z } from 'zod'
import { and, desc, eq, like, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { attendees, couponCodes, eventAttendees } from '@/lib/db/schema'
import { getSelectedEvent } from '@/lib/db/events'
import { csvCell } from '@/lib/csv'
import { getReadiness } from './readiness'

export async function eventStatus() {
  const event = await getSelectedEvent()
  const one = async (q: Promise<{ c: number }[]>) => Number((await q)[0]?.c ?? 0)
  const [registrations, checkedIn, claimed, remaining, failedEmails] = await Promise.all([
    one(db.select({ c: sql<number>`count(*)` }).from(eventAttendees).where(eq(eventAttendees.eventId, event.id))),
    one(db.select({ c: sql<number>`count(*)` }).from(eventAttendees)
      .where(sql`${eventAttendees.eventId} = ${event.id} AND ${eventAttendees.checkedInAt} IS NOT NULL`)),
    one(db.select({ c: sql<number>`count(*)` }).from(eventAttendees)
      .where(sql`${eventAttendees.eventId} = ${event.id} AND ${eventAttendees.couponCodeId} IS NOT NULL`)),
    one(db.select({ c: sql<number>`count(*)` }).from(couponCodes).where(eq(couponCodes.isUsed, false))),
    one(db.select({ c: sql<number>`count(*)` }).from(eventAttendees)
      .where(sql`${eventAttendees.eventId} = ${event.id} AND ${eventAttendees.emailStatus} = 'failed'`)),
  ])
  return {
    event: event.name,
    date: event.eventDate,
    registrations,
    checkedIn,
    claimed,
    remaining,
    failedEmails,
  }
}

export async function findAttendee(query: string) {
  const event = await getSelectedEvent()
  const term = `%${query.trim()}%`
  const rows = await db
    .select()
    .from(eventAttendees)
    .innerJoin(attendees, eq(eventAttendees.attendeeId, attendees.id))
    .leftJoin(couponCodes, eq(eventAttendees.couponCodeId, couponCodes.id))
    .where(
      and(
        eq(eventAttendees.eventId, event.id),
        or(like(attendees.name, term), like(attendees.email, term))!,
      ),
    )
    .orderBy(desc(eventAttendees.registeredAt))
    .limit(25)
  return rows.map((r) => ({
    name: r.attendees.name,
    email: r.attendees.email,
    code: r.coupon_codes?.code ?? null,
    emailStatus: r.event_attendees.emailStatus,
    checkedIn: Boolean(r.event_attendees.checkedInAt),
  }))
}

export async function exportAttendees(view: 'event' | 'people'): Promise<string> {
  if (view === 'people') {
    const rows = await db
      .select({
        name: attendees.name,
        email: attendees.email,
        eventsAttended: sql<number>`count(${eventAttendees.id})`,
      })
      .from(attendees)
      .leftJoin(eventAttendees, eq(eventAttendees.attendeeId, attendees.id))
      .groupBy(attendees.id)
    const header = ['Name', 'Email', 'Events attended']
    return [header, ...rows.map((r) => [r.name, r.email, r.eventsAttended])]
      .map((r) => r.map(csvCell).join(','))
      .join('\n')
  }
  const event = await getSelectedEvent()
  const rows = await db
    .select()
    .from(eventAttendees)
    .innerJoin(attendees, eq(eventAttendees.attendeeId, attendees.id))
    .leftJoin(couponCodes, eq(eventAttendees.couponCodeId, couponCodes.id))
    .where(eq(eventAttendees.eventId, event.id))
  const header = ['Name', 'Email', 'Registered At', 'Code', 'Source']
  return [
    header,
    ...rows.map((r) => [
      r.attendees.name,
      r.attendees.email,
      r.event_attendees.registeredAt,
      r.coupon_codes?.code ?? '',
      r.event_attendees.source,
    ]),
  ]
    .map((r) => r.map(csvCell).join(','))
    .join('\n')
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/mcp/tools-read.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Append the tool registration**

Append to `src/lib/mcp/tools-read.ts`:

```ts
const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
})

/* eslint-disable @typescript-eslint/no-explicit-any */
export function registerReadTools(server: any) {
  server.tool(
    'readiness_check',
    'Check whether this Cafe Cursor deployment is ready to hand out credits: event date, code inventory, email configuration, Luma connection, and claim portal state. Call this before an event.',
    {},
    async () => text(await getReadiness()),
  )

  server.tool(
    'event_status',
    'Live counts for the currently selected event: registrations, check-ins, credits claimed, codes remaining, and failed emails.',
    {},
    async () => text(await eventStatus()),
  )

  server.tool(
    'find_attendee',
    'Find attendees of the selected event by partial name or email. Returns their assigned code, email status, and check-in state.',
    { query: z.string().min(1).describe('Partial name or email to search for') },
    async ({ query }: { query: string }) => text(await findAttendee(query)),
  )

  server.tool(
    'export_attendees',
    'Export attendees as CSV. Use view "event" for the selected event, or "people" for everyone across all events.',
    { view: z.enum(['event', 'people']).default('event') },
    async ({ view }: { view: 'event' | 'people' }) => text(await exportAttendees(view)),
  )
}
```

- [ ] **Step 7: Create the MCP route**

Create `src/app/api/mcp/route.ts`:

```ts
import { createMcpHandler } from 'mcp-handler'
import { NextResponse } from 'next/server'
import { requireApiKey } from '@/lib/auth/api-key'
import { registerReadTools } from '@/lib/mcp/tools-read'

// Bulk dispatch outlives default serverless timeouts.
export const maxDuration = 300

/* eslint-disable @typescript-eslint/no-explicit-any */
const handler = createMcpHandler((server: any) => {
  registerReadTools(server)
})

/** Every MCP request carries a bearer API key — agents have no session cookie. */
async function authed(request: Request) {
  const gate = await requireApiKey(request)
  if ('response' in gate) return gate.response
  return handler(request)
}

export async function GET(request: Request) {
  return authed(request)
}

export async function POST(request: Request) {
  return authed(request)
}

export async function DELETE(request: Request) {
  return authed(request)
}
```

- [ ] **Step 8: Verify build and lint**

Run: `npm run build && npm run lint && npm test`
Expected: compiles with `/api/mcp` in the route list; 0 lint errors; all tests pass.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/app/api/mcp src/lib/mcp/tools-read.ts src/lib/mcp/tools-read.test.ts
git commit -m "feat(mcp): mcp route and read-only tools"
```

---

### Task 8: Setup tools

**Files:**
- Create: `src/lib/mcp/tools-setup.ts`
- Modify: `src/app/api/mcp/route.ts`

**Interfaces:**
- Consumes: `adoptCityIntoGenericEvents`, `defaultEventName`, `setActiveEvent` from `@/lib/db/events`; `suggestEventName` from `@/lib/event-date`; `issueConfirmToken`, `consumeConfirmToken` (Task 4); `sendAppEmail`, `canSendEmail`
- Produces: `registerSetupTools(server)` — registers `setup_city`, `create_event`, `add_codes`, `configure_email`, `set_claim_portal`

- [ ] **Step 1: Write the implementation**

Create `src/lib/mcp/tools-setup.ts`:

```ts
import 'server-only'
import { z } from 'zod'
import { eq, inArray } from 'drizzle-orm'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { appSettings, couponCodes, events } from '@/lib/db/schema'
import { adoptCityIntoGenericEvents, setActiveEvent } from '@/lib/db/events'
import { suggestEventName } from '@/lib/event-date'
import { canSendEmail, sendAppEmail } from '@/lib/emails/send-coupon-email'
import { consumeConfirmToken, issueConfirmToken } from './confirm-token'

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
})

/* eslint-disable @typescript-eslint/no-explicit-any */
export function registerSetupTools(server: any, ownerEmail: string) {
  server.tool(
    'setup_city',
    'Set the city identity for this deployment: name, country, timezone, and public tagline. Events still named generically adopt the city automatically.',
    {
      city: z.string().min(1).describe('City name, e.g. "Bogota" — do not include "Cafe Cursor"'),
      country: z.string().optional(),
      timezone: z.string().optional().describe('IANA timezone, e.g. America/Bogota'),
      tagline: z.string().optional().describe('Shown on public pages'),
    },
    async (args: { city: string; country?: string; timezone?: string; tagline?: string }) => {
      await ensureDefaultSettings()
      const [existing] = await db.select().from(appSettings).limit(1)
      const [row] = await db
        .update(appSettings)
        .set({
          cityName: args.city,
          ...(args.country !== undefined ? { country: args.country } : {}),
          ...(args.timezone !== undefined ? { timezone: args.timezone } : {}),
          ...(args.tagline !== undefined ? { eventTagline: args.tagline } : {}),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(appSettings.id, existing.id))
        .returning()
      await adoptCityIntoGenericEvents(row.cityName)
      return text({ city: row.cityName, country: row.country, timezone: row.timezone })
    },
  )

  server.tool(
    'create_event',
    'Create a Cafe Cursor edition. Each edition is distinguished by its date, so always set one. Pass activate:true to make it the event that public pages bind to.',
    {
      name: z.string().optional().describe('Defaults to "Cafe Cursor <city> — <month>"'),
      date: z.string().optional().describe('YYYY-MM-DD'),
      passcode: z.string().max(32).optional().describe('Shown at the venue; blocks remote claims'),
      activate: z.boolean().default(true),
    },
    async (args: { name?: string; date?: string; passcode?: string; activate: boolean }) => {
      await ensureDefaultSettings()
      const [settings] = await db.select().from(appSettings).limit(1)
      const name = args.name ?? suggestEventName(settings?.cityName)
      const [row] = await db
        .insert(events)
        .values({ name, eventDate: args.date ?? null, claimPasscode: args.passcode || null })
        .returning()
      if (args.activate) await setActiveEvent(row.id)
      return text({ id: row.id, name: row.name, date: row.eventDate, active: args.activate })
    },
  )

  server.tool(
    'add_codes',
    'Import Cursor credit codes into the shared pool. Duplicates are skipped. Accepts bare codes or full redeem URLs.',
    { codes: z.array(z.string().min(1)).min(1).max(5000) },
    async ({ codes }: { codes: string[] }) => {
      const clean = Array.from(new Set(codes.map((c) => c.trim()).filter(Boolean)))
      if (clean.length === 0) return text({ inserted: 0, duplicates: 0 })
      const existing = await db
        .select({ code: couponCodes.code })
        .from(couponCodes)
        .where(inArray(couponCodes.code, clean))
      const dupes = new Set(existing.map((r) => r.code))
      const toInsert = clean.filter((c) => !dupes.has(c)).map((code) => ({ code }))
      let inserted = 0
      if (toInsert.length > 0) {
        const rows = await db.insert(couponCodes).values(toInsert).returning({ id: couponCodes.id })
        inserted = rows.length
      }
      return text({ inserted, duplicates: clean.length - inserted, total: clean.length })
    },
  )

  server.tool(
    'set_claim_portal',
    'Open or close the public /claim portal. Closed means attendees see a notice and cannot claim a code.',
    { enabled: z.boolean() },
    async ({ enabled }: { enabled: boolean }) => {
      await ensureDefaultSettings()
      await db
        .update(appSettings)
        .set({ claimEnabled: enabled, updatedAt: new Date().toISOString() })
        .where(eq(appSettings.id, (await db.select().from(appSettings).limit(1))[0].id))
      return text({ claim_enabled: enabled })
    },
  )

  server.tool(
    'configure_email',
    'Save email provider settings and send a real test message to the API key owner to prove they work. Run with dry_run:true first to see what would change.',
    {
      provider: z.enum(['resend', 'smtp']),
      resend_api_key: z.string().optional(),
      from_email: z.string().email().optional(),
      smtp_host: z.string().optional(),
      smtp_port: z.number().int().positive().max(65535).optional(),
      smtp_user: z.string().optional(),
      smtp_password: z.string().optional(),
      smtp_secure: z.boolean().optional(),
      dry_run: z.boolean().default(true),
      confirm_token: z.string().optional(),
    },
    async (args: Record<string, any>) => {
      if (args.dry_run) {
        return text({
          would_set_provider: args.provider,
          would_send_test_email_to: ownerEmail,
          confirm_token: issueConfirmToken('configure_email', args),
          note: 'Re-run with dry_run:false and this confirm_token to apply.',
        })
      }
      const check = consumeConfirmToken(args.confirm_token ?? '', 'configure_email', args)
      if (!check.ok) {
        return text({
          error: `Confirm token ${check.reason}. Re-run with dry_run:true to get a fresh projection.`,
        })
      }
      await ensureDefaultSettings()
      const [existing] = await db.select().from(appSettings).limit(1)
      const [row] = await db
        .update(appSettings)
        .set({
          emailProvider: args.provider,
          ...(args.resend_api_key ? { resendApiKey: args.resend_api_key } : {}),
          ...(args.from_email ? { fromEmail: args.from_email } : {}),
          ...(args.smtp_host ? { smtpHost: args.smtp_host } : {}),
          ...(args.smtp_port ? { smtpPort: args.smtp_port } : {}),
          ...(args.smtp_user ? { smtpUser: args.smtp_user } : {}),
          ...(args.smtp_password ? { smtpPassword: args.smtp_password } : {}),
          ...(args.smtp_secure !== undefined ? { smtpSecure: args.smtp_secure } : {}),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(appSettings.id, existing.id))
        .returning()

      if (!canSendEmail(row)) {
        return text({ saved: true, test_email: 'skipped — configuration is still incomplete' })
      }
      try {
        await sendAppEmail({
          settings: row,
          to: ownerEmail,
          subject: 'Cafe Cursor test email',
          html: '<p>Your email settings work. Attendees will get their credit codes from this sender.</p>',
          fromName: `Cafe Cursor ${row.cityName}`,
        })
        return text({ saved: true, test_email: `sent to ${ownerEmail}` })
      } catch (e) {
        return text({
          saved: true,
          test_email: `FAILED: ${e instanceof Error ? e.message : String(e)}`,
        })
      }
    },
  )
}
```

- [ ] **Step 2: Register in the route**

In `src/app/api/mcp/route.ts`, the tool registry now needs the key owner's email, so the handler must be built per-request. Replace the file body below the imports with:

```ts
import { createMcpHandler } from 'mcp-handler'
import { requireApiKey } from '@/lib/auth/api-key'
import { registerReadTools } from '@/lib/mcp/tools-read'
import { registerSetupTools } from '@/lib/mcp/tools-setup'

export const maxDuration = 300

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildHandler(ownerEmail: string) {
  return createMcpHandler((server: any) => {
    registerReadTools(server)
    registerSetupTools(server, ownerEmail)
  })
}

async function authed(request: Request) {
  const gate = await requireApiKey(request)
  if ('response' in gate) return gate.response
  // Key name stands in for an inbox when the key has no user attached.
  return buildHandler(gate.key.name)(request)
}

export async function GET(request: Request) {
  return authed(request)
}

export async function POST(request: Request) {
  return authed(request)
}

export async function DELETE(request: Request) {
  return authed(request)
}
```

- [ ] **Step 3: Resolve the owner email properly**

The key's `name` is a label, not an inbox. Add to `src/lib/auth/api-key.ts`:

```ts
/** Email of the admin who created the key — where test mail should land. */
export async function apiKeyOwnerEmail(key: ApiKey): Promise<string | null> {
  if (!key.createdBy) return null
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, key.createdBy))
    .limit(1)
  return row?.email ?? null
}
```

Add `users` to the schema import at the top of that file. Then in `route.ts`, replace the `buildHandler(gate.key.name)` call with:

```ts
  const ownerEmail = await apiKeyOwnerEmail(gate.key)
  if (!ownerEmail) {
    return NextResponse.json({ error: 'API key has no owner to send test mail to' }, { status: 400 })
  }
  return buildHandler(ownerEmail)(request)
```

Add `import { NextResponse } from 'next/server'` and `apiKeyOwnerEmail` to the imports.

- [ ] **Step 4: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/tools-setup.ts src/app/api/mcp/route.ts src/lib/auth/api-key.ts
git commit -m "feat(mcp): setup tools"
```

---

### Task 9: Gated operations tools

**Files:**
- Create: `src/lib/mcp/tools-ops.ts`
- Modify: `src/app/api/mcp/route.ts`

**Interfaces:**
- Consumes: `projectDispatch`, `runDispatch` (Task 6); `issueConfirmToken`, `consumeConfirmToken` (Task 4); `syncLumaGuests` from `@/lib/luma/sync`; `getSelectedEvent`
- Produces: `registerOpsTools(server)` — registers `dispatch_codes`, `resend_failed`, `sync_luma`, `checkin`

- [ ] **Step 1: Write the implementation**

Create `src/lib/mcp/tools-ops.ts`:

```ts
import 'server-only'
import { z } from 'zod'
import { and, eq, like, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { appSettings, attendees, eventAttendees } from '@/lib/db/schema'
import { getSelectedEvent } from '@/lib/db/events'
import { syncLumaGuests } from '@/lib/luma/sync'
import { projectDispatch, runDispatch, type DispatchScope } from './dispatch'
import { consumeConfirmToken, issueConfirmToken } from './confirm-token'

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
})

const staleToken = (reason: string) =>
  text({ error: `Confirm token ${reason}. Re-run with dry_run:true to get a fresh projection.` })

/* eslint-disable @typescript-eslint/no-explicit-any */
export function registerOpsTools(server: any) {
  server.tool(
    'dispatch_codes',
    'Assign credit codes and email them, in one pass. ALWAYS call with dry_run:true first — the projection shows how many emails would be sent and how many codes would be burned, and returns a confirm_token needed for the real run.',
    {
      scope: z
        .enum(['luma', 'all_unassigned'])
        .default('luma')
        .describe('"luma" covers guests synced from Luma; "all_unassigned" covers everyone in the event without a code'),
      dry_run: z.boolean().default(true),
      confirm_token: z.string().optional(),
    },
    async (args: { scope: DispatchScope; dry_run: boolean; confirm_token?: string }) => {
      if (args.dry_run) {
        const p = await projectDispatch(args.scope)
        return text({
          would_email: p.wouldEmail,
          would_burn_codes: p.wouldBurn,
          codes_available: p.availableCodes,
          codes_remaining_after: p.remainingAfter,
          shortfall: p.shortfall,
          email_configured: p.emailConfigured,
          confirm_token: issueConfirmToken('dispatch_codes', args),
          note: 'Re-run with dry_run:false and this confirm_token to actually send.',
        })
      }
      const check = consumeConfirmToken(args.confirm_token ?? '', 'dispatch_codes', args)
      if (!check.ok) return staleToken(check.reason)
      const r = await runDispatch(args.scope)
      return text({
        assigned: r.assigned,
        emailed: r.emailed,
        failed: r.failed,
        out_of_codes: r.outOfCodes,
        ...(r.outOfCodes ? { warning: 'Ran out of codes — some attendees were not served.' } : {}),
      })
    },
  )

  server.tool(
    'resend_failed',
    'Retry credit emails for anyone in this event who has not had one successfully sent — failed, skipped, or never attempted. Call with dry_run:true first to see the count and get a confirm_token.',
    { dry_run: z.boolean().default(true), confirm_token: z.string().optional() },
    async (args: { dry_run: boolean; confirm_token?: string }) => {
      const event = await getSelectedEvent()
      const [row] = await db
        .select({ c: sql<number>`count(*)` })
        .from(eventAttendees)
        .where(sql`${eventAttendees.eventId} = ${event.id} AND ${eventAttendees.emailStatus} = 'failed'`)
      const count = Number(row?.c ?? 0)
      if (args.dry_run) {
        return text({
          would_resend: count,
          confirm_token: issueConfirmToken('resend_failed', args),
          note: 'Re-run with dry_run:false and this confirm_token to resend.',
        })
      }
      const check = consumeConfirmToken(args.confirm_token ?? '', 'resend_failed', args)
      if (!check.ok) return staleToken(check.reason)
      const r = await runDispatch('all_unassigned')
      return text({ resent: r.emailed, failed: r.failed })
    },
  )

  server.tool(
    'sync_luma',
    'Pull the guest list from Luma into the selected event. Set dispatch:true to also assign and email codes — that path requires the dry-run/confirm handshake.',
    {
      event_api_id: z.string().describe('Luma event id, e.g. evt-xxxx'),
      dispatch: z.boolean().default(false),
      dry_run: z.boolean().default(true),
      confirm_token: z.string().optional(),
    },
    async (args: { event_api_id: string; dispatch: boolean; dry_run: boolean; confirm_token?: string }) => {
      const [settings] = await db.select().from(appSettings).limit(1)
      if (!settings?.lumaApiKey) {
        return text({ error: 'Luma API key not configured. Add one in Settings → Luma.' })
      }
      const event = await getSelectedEvent()

      // Syncing alone writes no codes and sends no mail, so it needs no gate.
      if (!args.dispatch) {
        const sync = await syncLumaGuests(settings.lumaApiKey, args.event_api_id, event.id)
        return text(sync)
      }
      if (args.dry_run) {
        const sync = await syncLumaGuests(settings.lumaApiKey, args.event_api_id, event.id)
        const p = await projectDispatch('luma')
        return text({
          sync,
          would_email: p.wouldEmail,
          would_burn_codes: p.wouldBurn,
          codes_remaining_after: p.remainingAfter,
          shortfall: p.shortfall,
          confirm_token: issueConfirmToken('sync_luma', args),
          note: 'Guests are synced. Re-run with dry_run:false and this confirm_token to email them.',
        })
      }
      const check = consumeConfirmToken(args.confirm_token ?? '', 'sync_luma', args)
      if (!check.ok) return staleToken(check.reason)
      const r = await runDispatch('luma')
      return text({ assigned: r.assigned, emailed: r.emailed, failed: r.failed, out_of_codes: r.outOfCodes })
    },
  )

  server.tool(
    'checkin',
    'Check an attendee in or out at the door, by partial name or email. Fails clearly if the query matches more than one person.',
    {
      query: z.string().min(1).describe('Partial name or email'),
      checked_in: z.boolean().default(true),
    },
    async ({ query, checked_in }: { query: string; checked_in: boolean }) => {
      const event = await getSelectedEvent()
      const term = `%${query.trim()}%`
      const rows = await db
        .select()
        .from(eventAttendees)
        .innerJoin(attendees, eq(eventAttendees.attendeeId, attendees.id))
        .where(
          and(
            eq(eventAttendees.eventId, event.id),
            or(like(attendees.name, term), like(attendees.email, term))!,
          ),
        )
        .limit(5)
      if (rows.length === 0) return text({ error: `No attendee matches "${query}".` })
      if (rows.length > 1) {
        return text({
          error: `"${query}" matches ${rows.length} people. Be more specific.`,
          matches: rows.map((r) => ({ name: r.attendees.name, email: r.attendees.email })),
        })
      }
      const now = new Date().toISOString()
      await db
        .update(eventAttendees)
        .set({ checkedInAt: checked_in ? now : null, updatedAt: now })
        .where(eq(eventAttendees.id, rows[0].event_attendees.id))
      return text({
        name: rows[0].attendees.name,
        email: rows[0].attendees.email,
        checked_in,
      })
    },
  )
}
```

- [ ] **Step 2: Register in the route**

In `src/app/api/mcp/route.ts`, add the import and the registration call:

```ts
import { registerOpsTools } from '@/lib/mcp/tools-ops'
```

and inside `buildHandler`'s callback, after `registerSetupTools(server, ownerEmail)`:

```ts
    registerOpsTools(server)
```

- [ ] **Step 3: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: all green; 13 tools now registered.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mcp/tools-ops.ts src/app/api/mcp/route.ts
git commit -m "feat(mcp): gated operations tools"
```

---

### Task 10: API keys settings UI

**Files:**
- Create: `src/components/admin/api-keys-manager.tsx`
- Modify: `src/app/admin/settings/page.tsx` (add a `SECTIONS` entry and a card)

**Interfaces:**
- Consumes: `GET/POST /api/admin/api-keys`, `DELETE /api/admin/api-keys/:id` (Task 3)
- Produces: `<ApiKeysManager />`

- [ ] **Step 1: Write the component**

Create `src/components/admin/api-keys-manager.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, Check, Plus, Trash2, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatEventDate } from '@/lib/event-date'

type KeyRow = {
  id: number
  name: string
  key_prefix: string
  role: 'admin' | 'host'
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export function ApiKeysManager() {
  const [keys, setKeys] = useState<KeyRow[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState<'admin' | 'host'>('admin')
  const [issued, setIssued] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/api-keys')
    if (!res.ok) return
    setKeys((await res.json()).api_keys ?? [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = async () => {
    const res = await fetch('/api/admin/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), role }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(json.error || 'Could not create key')
      return
    }
    setIssued(json.key)
    setName('')
    setCreateOpen(false)
    load()
  }

  const revoke = async (id: number) => {
    if (!confirm('Revoke this key? Any Cursor session using it stops working immediately.')) return
    const res = await fetch(`/api/admin/api-keys/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Key revoked')
      load()
    } else toast.error('Could not revoke key')
  }

  const copy = async () => {
    if (!issued) return
    await navigator.clipboard.writeText(issued)
    setCopied(true)
    toast.success('Key copied')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> New key
        </Button>
      </div>

      {keys.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
          <KeyRound className="size-5" />
          <p className="text-sm">No API keys yet. Create one to connect Cursor.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell className="font-code text-xs">{k.key_prefix}…</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                    {k.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {k.revoked_at
                    ? 'revoked'
                    : k.last_used_at
                      ? formatEventDate(k.last_used_at.slice(0, 10))
                      : 'never'}
                </TableCell>
                <TableCell className="text-right">
                  {k.revoked_at ? null : (
                    <Button variant="ghost" size="icon-sm" onClick={() => revoke(k.id)} title="Revoke">
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New API key</DialogTitle>
            <DialogDescription>For connecting Cursor to this deployment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ricardo's Cursor"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <div className="flex gap-2">
                {(['admin', 'host'] as const).map((r) => (
                  <Button
                    key={r}
                    type="button"
                    variant={role === r ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRole(r)}
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button shape="pill" onClick={create} disabled={!name.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(issued)} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your key now</DialogTitle>
            <DialogDescription>
              This is the only time it is shown. Paste it into Cursor&apos;s MCP settings.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-[10px] border border-border bg-background p-3 font-code text-xs break-all select-all">
            {issued}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={copy}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              Copy key
            </Button>
            <Button shape="pill" onClick={() => setIssued(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Add the settings section**

In `src/app/admin/settings/page.tsx`:

1. Add to the icon import from `lucide-react`: `KeyRound`.
2. Add `import { ApiKeysManager } from '@/components/admin/api-keys-manager'`.
3. Add to `SECTIONS` after the Luma entry:

```ts
  { id: 'api', label: 'API keys', icon: KeyRound },
```

4. Add this card immediately after the closing `</Card>` of the Luma card, before the `<div className="flex justify-end">` that holds the save button:

```tsx
          <Card className={cn(section !== 'api' && 'hidden')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-5" /> API keys
              </CardTitle>
              <CardDescription>
                Connect Cursor to this deployment over MCP. Keys are shown once and can be revoked
                at any time.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ApiKeysManager />
            </CardContent>
          </Card>
```

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run build`
Expected: 0 lint errors; build succeeds.

- [ ] **Step 4: Manual check**

Run `npm run dev`, sign in, open Settings → API keys. Create a key, confirm it is shown once, reload and confirm only the prefix shows, then revoke it.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/api-keys-manager.tsx src/app/admin/settings/page.tsx
git commit -m "feat(mcp): api keys settings UI"
```

---

### Task 11: Documentation

**Files:**
- Modify: `README.md`
- Modify: `DEPLOY.md`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Add the README section**

Add after the "What it does" section in `README.md`:

```markdown
## Use it from Cursor (MCP)

This deployment ships its own MCP server, so an ambassador can set up and run
an event by describing what they want.

1. Admin → Settings → **API keys** → New key. Copy it (shown once).
2. Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cafe-cursor": {
      "url": "https://your-deployment.example.com/api/mcp",
      "headers": { "Authorization": "Bearer cck_live_..." }
    }
  }
}
```

Then, in Cursor:

> "Set up Cafe Cursor Bogotá for Sept 12, import these 80 codes, and tell me if I'm ready."

> "Sync Luma and email everyone their code."

Tools that send email or burn codes always show a dry-run projection first and
require you to confirm before anything irreversible happens.
```

- [ ] **Step 2: Document the single-process constraint**

Add to `DEPLOY.md`, next to the existing in-memory rate limiter note:

```markdown
### MCP confirm tokens are in-memory

Like the rate limiter, the MCP dry-run/confirm tokens live in process memory.
On a multi-instance deployment a confirm call can land on an instance that
never issued the token, and will be rejected as unknown. Run a single instance,
or move both stores to a shared cache before scaling out.
```

- [ ] **Step 3: Update the agent briefs**

Add to the "Common tasks" table in `CLAUDE.md`:

```markdown
| Add an MCP tool | `src/lib/mcp/tools-*.ts`, register in `src/app/api/mcp/route.ts` |
```

Add to `AGENTS.md` conventions:

```markdown
- MCP tool handlers call `src/lib/**` functions directly — never a route
  handler. If a route holds logic a tool needs, extract it to `src/lib` first.
- Any tool that sends email or burns codes in bulk MUST support
  `dry_run` + `confirm_token`. No exceptions.
```

- [ ] **Step 4: Commit**

```bash
git add README.md DEPLOY.md CLAUDE.md AGENTS.md
git commit -m "docs(mcp): cursor setup, constraints, conventions"
```

---

### Task 12: End-to-end verification against a real Cursor client

**Files:** none (verification only)

- [ ] **Step 1: Seed a clean demo database**

```bash
npm run db:seed
npm run dev
```

- [ ] **Step 2: Create a key and wire up Cursor**

Settings → API keys → New key (role: admin). Add to `~/.cursor/mcp.json` pointing at `http://localhost:3000/api/mcp`. Restart Cursor and confirm 13 tools are listed.

- [ ] **Step 3: Exercise the day-0 arc**

In Cursor, run: *"Set up Cafe Cursor Bogotá for Sept 12, add codes TEST1 through TEST5, and tell me if I'm ready."*

Expected: `setup_city`, `create_event`, `add_codes`, then `readiness_check` reporting email as the failing gate.

- [ ] **Step 4: Exercise the gate**

Run: *"Email everyone their code."*

Expected: `dispatch_codes` returns a projection with a `confirm_token` and sends nothing. Confirm, and verify the reported counts match the Attendees table in the UI.

- [ ] **Step 5: Verify the gate actually holds**

Ask Cursor to run `dispatch_codes` with `dry_run:false` and a made-up token.
Expected: rejected as `unknown`, nothing sent.

- [ ] **Step 6: Final green check**

```bash
npm test && npm run lint && npm run build
```

- [ ] **Step 7: Commit any fixes found**

```bash
git add -A
git commit -m "fix(mcp): issues found in end-to-end verification"
```

---

## Notes for the implementer

- **`server.tool()` signature.** This plan assumes `server.tool(name, description, zodShape, handler)` from `@modelcontextprotocol/sdk@^1.30.0`. Verify against the installed version in Task 7 Step 1 — if the SDK exposes `registerTool` with an options object instead, adapt all registrations consistently and note it in the commit.
- **Tool descriptions are the real UX.** They are what the model reads to decide which tool to call. If Cursor picks the wrong tool during Task 12, fix the description rather than adding a new tool.
- **Never widen the gate.** If a gated tool feels slow to demo, that is the design working. Do not add a "skip confirmation" flag.
