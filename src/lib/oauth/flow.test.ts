import { describe, it, expect, beforeEach } from 'vitest'
import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { oauthAuthCodes, oauthClients, oauthTokens, users } from '@/lib/db/schema'
import { createUser } from '@/lib/auth/users'
import { issueAuthCode, consumeAuthCode, s256Challenge } from './codes'
import { issueTokens, verifyAccessToken, refreshTokens, revokeToken } from './tokens'
import { registerPublicClient, redirectUriAllowed, pruneStaleClients } from './clients'
import { SCOPE_READ, SCOPE_WRITE } from './config'

const AUD = 'https://cc.example.com/api/mcp'
const REDIRECT = 'http://127.0.0.1:51000/callback'
const SCOPE = `${SCOPE_READ} ${SCOPE_WRITE}`

let userId: number
let clientId: string

beforeEach(async () => {
  await db.delete(oauthTokens)
  await db.delete(oauthAuthCodes)
  await db.delete(oauthClients)
  await db.delete(users)
  const user = await createUser({
    name: 'Ricardo',
    email: `admin${randomBytes(4).toString('hex')}@example.com`,
    password: 'password123',
  })
  userId = user.id
  const client = await registerPublicClient({ name: 'Cursor', redirectUris: [REDIRECT] })
  clientId = client.clientId
})

async function freshCode(verifier: string) {
  return issueAuthCode({
    clientId,
    userId,
    redirectUri: REDIRECT,
    scope: SCOPE,
    resource: AUD,
    codeChallenge: s256Challenge(verifier),
  })
}

describe('redirect URIs', () => {
  it('matches exactly and refuses a prefix extension', async () => {
    const [client] = await db.select().from(oauthClients)
    expect(redirectUriAllowed(client, REDIRECT)).toBe(true)
    expect(redirectUriAllowed(client, REDIRECT + '/../evil')).toBe(false)
    expect(redirectUriAllowed(client, 'http://127.0.0.1:51000/callback2')).toBe(false)
  })
})

describe('authorization codes', () => {
  it('exchanges once with the right verifier', async () => {
    const verifier = 'a'.repeat(64)
    const code = await freshCode(verifier)
    const result = await consumeAuthCode({
      code,
      clientId,
      redirectUri: REDIRECT,
      codeVerifier: verifier,
    })
    expect(result).toMatchObject({ ok: true, userId, scope: SCOPE, resource: AUD })
  })

  it('refuses a second exchange of the same code', async () => {
    const verifier = 'a'.repeat(64)
    const code = await freshCode(verifier)
    await consumeAuthCode({ code, clientId, redirectUri: REDIRECT, codeVerifier: verifier })
    const replay = await consumeAuthCode({
      code,
      clientId,
      redirectUri: REDIRECT,
      codeVerifier: verifier,
    })
    expect(replay).toEqual({ ok: false, reason: 'consumed' })
  })

  it('refuses a wrong PKCE verifier', async () => {
    const code = await freshCode('a'.repeat(64))
    const result = await consumeAuthCode({
      code,
      clientId,
      redirectUri: REDIRECT,
      codeVerifier: 'b'.repeat(64),
    })
    expect(result).toEqual({ ok: false, reason: 'pkce_failed' })
  })

  it('burns the code even when PKCE fails, so a stolen code cannot be brute-forced', async () => {
    const code = await freshCode('a'.repeat(64))
    await consumeAuthCode({ code, clientId, redirectUri: REDIRECT, codeVerifier: 'wrong' })
    const second = await consumeAuthCode({
      code,
      clientId,
      redirectUri: REDIRECT,
      codeVerifier: 'a'.repeat(64),
    })
    expect(second).toEqual({ ok: false, reason: 'consumed' })
  })

  it('refuses a code presented by a different client', async () => {
    const verifier = 'a'.repeat(64)
    const code = await freshCode(verifier)
    const other = await registerPublicClient({ name: 'Other', redirectUris: [REDIRECT] })
    const result = await consumeAuthCode({
      code,
      clientId: other.clientId,
      redirectUri: REDIRECT,
      codeVerifier: verifier,
    })
    expect(result).toEqual({ ok: false, reason: 'client_mismatch' })
  })

  it('refuses a mismatched redirect URI', async () => {
    const verifier = 'a'.repeat(64)
    const code = await freshCode(verifier)
    const result = await consumeAuthCode({
      code,
      clientId,
      redirectUri: 'http://127.0.0.1:9999/callback',
      codeVerifier: verifier,
    })
    expect(result).toEqual({ ok: false, reason: 'redirect_mismatch' })
  })
})

describe('access tokens', () => {
  it('validates for its own audience', async () => {
    const t = await issueTokens({
      clientId, userId, scope: SCOPE, audience: AUD, withRefresh: false,
    })
    const result = await verifyAccessToken(t.accessToken, AUD)
    expect(result.ok).toBe(true)
  })

  it('refuses a token minted for another server', async () => {
    const t = await issueTokens({
      clientId, userId, scope: SCOPE, audience: 'https://evil.example.com/api/mcp', withRefresh: false,
    })
    expect(await verifyAccessToken(t.accessToken, AUD)).toEqual({
      ok: false,
      reason: 'wrong_audience',
    })
  })

  it('refuses an expired token', async () => {
    const t = await issueTokens({
      clientId, userId, scope: SCOPE, audience: AUD, withRefresh: false,
    })
    const later = Date.now() + 2 * 60 * 60 * 1000
    expect(await verifyAccessToken(t.accessToken, AUD, later)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('refuses a refresh token used as a bearer token', async () => {
    const t = await issueTokens({
      clientId, userId, scope: SCOPE, audience: AUD, withRefresh: true,
    })
    expect(await verifyAccessToken(t.refreshToken!, AUD)).toEqual({
      ok: false,
      reason: 'wrong_type',
    })
  })
})

describe('refresh rotation', () => {
  it('rotates and invalidates the old access token', async () => {
    const first = await issueTokens({
      clientId, userId, scope: SCOPE, audience: AUD, withRefresh: true,
    })
    const result = await refreshTokens({ refreshToken: first.refreshToken!, clientId })
    expect(result.ok).toBe(true)
    expect(await verifyAccessToken(first.accessToken, AUD)).toEqual({
      ok: false,
      reason: 'revoked',
    })
  })

  it('kills the whole family when a spent refresh token is replayed', async () => {
    const first = await issueTokens({
      clientId, userId, scope: SCOPE, audience: AUD, withRefresh: true,
    })
    const rotated = await refreshTokens({ refreshToken: first.refreshToken!, clientId })
    expect(rotated.ok).toBe(true)

    const replay = await refreshTokens({ refreshToken: first.refreshToken!, clientId })
    expect(replay).toEqual({ ok: false, reason: 'reused' })

    // The token the attacker's replay would have raced for is dead too.
    const live = (rotated as { ok: true; tokens: { accessToken: string } }).tokens
    expect(await verifyAccessToken(live.accessToken, AUD)).toEqual({
      ok: false,
      reason: 'revoked',
    })
  })

  it('refuses a refresh token presented by another client', async () => {
    const t = await issueTokens({
      clientId, userId, scope: SCOPE, audience: AUD, withRefresh: true,
    })
    const other = await registerPublicClient({ name: 'Other', redirectUris: [REDIRECT] })
    expect(await refreshTokens({ refreshToken: t.refreshToken!, clientId: other.clientId })).toEqual({
      ok: false,
      reason: 'client_mismatch',
    })
  })
})

describe('revocation', () => {
  it('revoking the access token also kills its refresh token', async () => {
    const t = await issueTokens({
      clientId, userId, scope: SCOPE, audience: AUD, withRefresh: true,
    })
    expect(await revokeToken(t.accessToken)).toBe(true)
    expect(await refreshTokens({ refreshToken: t.refreshToken!, clientId })).toEqual({
      ok: false,
      reason: 'reused',
    })
  })
})

describe('stale DCR clients', () => {
  it('keeps a client registered earlier the same day', async () => {
    // SQLite's CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" but the cutoff is an
    // ISO string. On the same calendar day the comparison reaches index 10,
    // where " " sorts before "T" — so a young client looks older than the
    // cutoff and gets deleted mid-flow. Pinned to a fixed clock, because
    // whether the two timestamps share a calendar day otherwise depends on
    // what time of day the suite happens to run.
    const noon = Date.parse('2026-08-20T12:00:00.000Z')
    const fresh = await registerPublicClient({ name: 'Just now', redirectUris: [REDIRECT] })
    await db
      .update(oauthClients)
      // 18 hours old, written in SQLite's own format, and landing on the same
      // calendar day as the cutoff — which is where the comparison breaks.
      .set({ createdAt: '2026-08-19 18:00:00' })
      .where(eq(oauthClients.clientId, fresh.clientId))

    await pruneStaleClients(noon)

    const remaining = await db.select().from(oauthClients)
    expect(remaining.map((c) => c.clientId)).toContain(fresh.clientId)
  })

  it('prunes a never-approved client but keeps an approved one', async () => {
    const twoDaysOn = Date.now() + 2 * 24 * 60 * 60 * 1000
    await issueTokens({ clientId, userId, scope: SCOPE, audience: AUD, withRefresh: false })
    const approved = await registerPublicClient({ name: 'Approved', redirectUris: [REDIRECT] })
    await db
      .update(oauthClients)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(oauthClients.clientId, approved.clientId))

    const pruned = await pruneStaleClients(twoDaysOn)
    expect(pruned).toBeGreaterThanOrEqual(1)

    const remaining = await db.select().from(oauthClients)
    expect(remaining.map((c) => c.clientId)).toContain(approved.clientId)
  })
})

