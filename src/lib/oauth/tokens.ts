import 'server-only'
import { randomBytes } from 'crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { oauthTokens, users, type NewOAuthToken, type OAuthToken } from '@/lib/db/schema'
import { sha256 } from './codes'
import {
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  resourceMatches,
} from './config'

export type IssuedTokens = {
  accessToken: string
  refreshToken: string | null
  expiresIn: number
  scope: string
}

const rand = () => randomBytes(32).toString('base64url')

/**
 * Mints an access token (and optionally a refresh token) for one grant.
 *
 * `audience` is the canonical MCP URI this token may be used at. Binding it
 * here is what lets the resource server refuse a token minted for somebody
 * else's server — the confused-deputy defence.
 */
export async function issueTokens(params: {
  clientId: string
  userId: number | null
  scope: string
  audience: string
  withRefresh: boolean
  familyId?: string
  now?: number
}): Promise<IssuedTokens> {
  const now = params.now ?? Date.now()
  const familyId = params.familyId ?? rand()
  const accessToken = `cco_at_${rand()}`
  const refreshToken = params.withRefresh ? `cco_rt_${rand()}` : null

  const rows: NewOAuthToken[] = [
    {
      tokenHash: sha256(accessToken),
      type: 'access',
      familyId,
      clientId: params.clientId,
      userId: params.userId,
      scope: params.scope,
      audience: params.audience,
      expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS).toISOString(),
    },
  ]
  if (refreshToken) {
    rows.push({
      tokenHash: sha256(refreshToken),
      type: 'refresh',
      familyId,
      clientId: params.clientId,
      userId: params.userId,
      scope: params.scope,
      audience: params.audience,
      expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS).toISOString(),
    })
  }
  await db.insert(oauthTokens).values(rows)

  return {
    accessToken,
    refreshToken,
    expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope: params.scope,
  }
}

export type VerifyResult =
  | { ok: true; token: OAuthToken }
  | { ok: false; reason: 'unknown' | 'expired' | 'revoked' | 'wrong_audience' | 'wrong_type' }

/**
 * Validates a bearer token for use at `audience`. A token that is valid but
 * minted for a different resource is rejected — MCP servers MUST NOT accept
 * tokens issued for anyone else.
 */
export async function verifyAccessToken(
  raw: string,
  audience: string,
  now = Date.now(),
): Promise<VerifyResult> {
  if (!raw) return { ok: false, reason: 'unknown' }
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.tokenHash, sha256(raw)))
    .limit(1)
  if (!row) return { ok: false, reason: 'unknown' }
  if (row.type !== 'access') return { ok: false, reason: 'wrong_type' }
  if (row.revokedAt) return { ok: false, reason: 'revoked' }
  if (new Date(row.expiresAt).getTime() <= now) return { ok: false, reason: 'expired' }
  if (!resourceMatches(row.audience, audience)) return { ok: false, reason: 'wrong_audience' }
  return { ok: true, token: row }
}

/** Revokes every token sharing a grant family. */
export async function revokeFamily(familyId: string, now = Date.now()): Promise<void> {
  await db
    .update(oauthTokens)
    .set({ revokedAt: new Date(now).toISOString() })
    .where(and(eq(oauthTokens.familyId, familyId), isNull(oauthTokens.revokedAt)))
}

export type RefreshResult =
  | { ok: true; tokens: IssuedTokens }
  | { ok: false; reason: 'unknown' | 'expired' | 'revoked' | 'wrong_type' | 'client_mismatch' | 'reused' }

/**
 * Rotating refresh. The old token is revoked as it is spent; presenting an
 * already-revoked refresh token means it leaked, so the whole family dies
 * rather than letting attacker and user race for new tokens.
 */
export async function refreshTokens(params: {
  refreshToken: string
  clientId: string
  now?: number
}): Promise<RefreshResult> {
  const now = params.now ?? Date.now()
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.tokenHash, sha256(params.refreshToken)))
    .limit(1)
  if (!row) return { ok: false, reason: 'unknown' }
  if (row.type !== 'refresh') return { ok: false, reason: 'wrong_type' }
  if (row.clientId !== params.clientId) return { ok: false, reason: 'client_mismatch' }

  if (row.revokedAt) {
    await revokeFamily(row.familyId, now)
    return { ok: false, reason: 'reused' }
  }
  if (new Date(row.expiresAt).getTime() <= now) return { ok: false, reason: 'expired' }

  await revokeFamily(row.familyId, now)
  const tokens = await issueTokens({
    clientId: row.clientId,
    userId: row.userId,
    scope: row.scope,
    audience: row.audience,
    withRefresh: true,
    familyId: row.familyId,
    now,
  })
  return { ok: true, tokens }
}

/** RFC 7009. Revoking either half of a pair kills the whole grant. */
export async function revokeToken(raw: string, now = Date.now()): Promise<boolean> {
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.tokenHash, sha256(raw)))
    .limit(1)
  if (!row) return false
  await revokeFamily(row.familyId, now)
  return true
}

/** Where a tool's test email should land — the admin who approved the grant. */
export async function tokenOwnerEmail(token: OAuthToken): Promise<string | null> {
  if (!token.userId) return null
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, token.userId))
    .limit(1)
  return row?.email ?? null
}
