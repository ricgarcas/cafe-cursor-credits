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
  requireApiKey,
} from './api-key'
import { resetRateLimits } from '@/lib/rate-limit'

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
