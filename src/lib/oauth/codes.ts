import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { oauthAuthCodes } from '@/lib/db/schema'
import { AUTH_CODE_TTL_MS } from './config'

/**
 * Codes and tokens are 256-bit random strings, so SHA-256 is the right hash:
 * there is no low-entropy secret to slow an attacker down against, and bcrypt
 * on every MCP request would be a real latency cost. Client secrets, which are
 * checked rarely, still use bcrypt.
 */
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** RFC 7636 S256: BASE64URL(SHA256(ASCII(verifier))). */
export function s256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function verifyPkce(verifier: string, challenge: string): boolean {
  const a = Buffer.from(s256Challenge(verifier))
  const b = Buffer.from(challenge)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function issueAuthCode(params: {
  clientId: string
  userId: number
  redirectUri: string
  scope: string
  resource: string | null
  codeChallenge: string
  now?: number
}): Promise<string> {
  const now = params.now ?? Date.now()
  const code = randomBytes(32).toString('base64url')
  await db.insert(oauthAuthCodes).values({
    codeHash: sha256(code),
    clientId: params.clientId,
    userId: params.userId,
    redirectUri: params.redirectUri,
    scope: params.scope,
    resource: params.resource,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: 'S256',
    expiresAt: new Date(now + AUTH_CODE_TTL_MS).toISOString(),
  })
  return code
}

export type CodeResult =
  | { ok: true; userId: number; scope: string; resource: string | null }
  | { ok: false; reason: 'unknown' | 'expired' | 'consumed' | 'client_mismatch' | 'redirect_mismatch' | 'pkce_failed' }

/**
 * Single-use exchange. The row is marked consumed before PKCE is checked, so a
 * failed verifier still burns the code — otherwise an attacker holding a
 * stolen code could brute-force the verifier against a code that stays live.
 */
export async function consumeAuthCode(params: {
  code: string
  clientId: string
  redirectUri: string
  codeVerifier: string
  now?: number
}): Promise<CodeResult> {
  const now = params.now ?? Date.now()
  if (!params.code) return { ok: false, reason: 'unknown' }

  const [row] = await db
    .select()
    .from(oauthAuthCodes)
    .where(eq(oauthAuthCodes.codeHash, sha256(params.code)))
    .limit(1)
  if (!row) return { ok: false, reason: 'unknown' }
  if (row.consumedAt) return { ok: false, reason: 'consumed' }

  const consumed = await db
    .update(oauthAuthCodes)
    .set({ consumedAt: new Date(now).toISOString() })
    .where(and(eq(oauthAuthCodes.id, row.id), isNull(oauthAuthCodes.consumedAt)))
    .returning({ id: oauthAuthCodes.id })
  // Lost the race against a concurrent exchange of the same code.
  if (consumed.length === 0) return { ok: false, reason: 'consumed' }

  if (new Date(row.expiresAt).getTime() <= now) return { ok: false, reason: 'expired' }
  if (row.clientId !== params.clientId) return { ok: false, reason: 'client_mismatch' }
  if (row.redirectUri !== params.redirectUri) return { ok: false, reason: 'redirect_mismatch' }
  if (!verifyPkce(params.codeVerifier ?? '', row.codeChallenge)) {
    return { ok: false, reason: 'pkce_failed' }
  }
  return { ok: true, userId: row.userId, scope: row.scope, resource: row.resource }
}
