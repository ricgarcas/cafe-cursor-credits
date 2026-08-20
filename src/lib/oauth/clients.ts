import 'server-only'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { and, eq, isNull, lt, desc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { oauthClients, oauthTokens, type OAuthClient } from '@/lib/db/schema'
import { SCOPE_READ, SCOPE_WRITE } from './config'

const SALT_ROUNDS = 10

const rand = (bytes = 24) => randomBytes(bytes).toString('base64url')

export function parseRedirectUris(client: OAuthClient): string[] {
  try {
    const parsed = JSON.parse(client.redirectUris)
    return Array.isArray(parsed) ? parsed.filter((u) => typeof u === 'string') : []
  } catch {
    return []
  }
}

export function parseGrantTypes(client: OAuthClient): string[] {
  return client.grantTypes.split(',').map((g) => g.trim()).filter(Boolean)
}

/**
 * Exact match only. Prefix or wildcard matching on redirect URIs is how open
 * redirectors turn into token exfiltration, so it is deliberately absent.
 */
export function redirectUriAllowed(client: OAuthClient, uri: string): boolean {
  return parseRedirectUris(client).includes(uri)
}

export async function findClient(clientId: string): Promise<OAuthClient | null> {
  if (!clientId) return null
  const [row] = await db
    .select()
    .from(oauthClients)
    .where(and(eq(oauthClients.clientId, clientId), isNull(oauthClients.revokedAt)))
    .limit(1)
  return row ?? null
}

/** RFC 7591 dynamic registration — public client, PKCE, no secret. */
export async function registerPublicClient(params: {
  name: string
  redirectUris: string[]
  scope?: string
}): Promise<OAuthClient> {
  const [row] = await db
    .insert(oauthClients)
    .values({
      clientId: `cc_client_${rand(16)}`,
      name: params.name,
      redirectUris: JSON.stringify(params.redirectUris),
      grantTypes: 'authorization_code,refresh_token',
      scope: params.scope ?? `${SCOPE_READ} ${SCOPE_WRITE}`,
      isConfidential: false,
    })
    .returning()
  return row
}

/**
 * Admin-created confidential client for CI and cron. The secret is returned
 * once and stored only as a bcrypt hash.
 */
export async function createConfidentialClient(params: {
  name: string
  scope: string
  createdBy: number
}): Promise<{ record: OAuthClient; clientSecret: string }> {
  const clientSecret = `cc_secret_${rand(32)}`
  const [record] = await db
    .insert(oauthClients)
    .values({
      clientId: `cc_client_${rand(16)}`,
      clientSecretHash: await bcrypt.hash(clientSecret, SALT_ROUNDS),
      name: params.name,
      redirectUris: '[]',
      grantTypes: 'client_credentials',
      scope: params.scope,
      isConfidential: true,
      createdBy: params.createdBy,
    })
    .returning()
  return { record, clientSecret }
}

export async function verifyClientSecret(
  client: OAuthClient,
  secret: string,
): Promise<boolean> {
  if (!client.clientSecretHash || !secret) return false
  return bcrypt.compare(secret, client.clientSecretHash)
}

export async function revokeClient(id: number): Promise<boolean> {
  const now = new Date().toISOString()
  const [row] = await db
    .update(oauthClients)
    .set({ revokedAt: now })
    .where(eq(oauthClients.id, id))
    .returning()
  if (!row) return false
  // A revoked client's live tokens must die with it, not linger until expiry.
  await db
    .update(oauthTokens)
    .set({ revokedAt: now })
    .where(and(eq(oauthTokens.clientId, row.clientId), isNull(oauthTokens.revokedAt)))
  return true
}

export async function listClients(): Promise<OAuthClient[]> {
  return db.select().from(oauthClients).orderBy(desc(oauthClients.createdAt))
}

export async function touchClient(clientId: string): Promise<void> {
  // Best-effort: a failed timestamp write must not fail the request.
  try {
    await db
      .update(oauthClients)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(oauthClients.clientId, clientId))
  } catch {}
}

/**
 * Open DCR means anyone can create a client row. One that never completed a
 * grant is junk after a day, so it gets pruned — a client only becomes durable
 * once an admin has actually approved it.
 */
export async function pruneStaleClients(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  const rows = await db
    .delete(oauthClients)
    .where(
      and(
        eq(oauthClients.isConfidential, false),
        isNull(oauthClients.lastUsedAt),
        lt(oauthClients.createdAt, cutoff),
      ),
    )
    .returning({ id: oauthClients.id })
  return rows.length
}
