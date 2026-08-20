import 'server-only'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
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
