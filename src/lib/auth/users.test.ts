import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import {
  hashPassword,
  verifyPassword,
  createUser,
  findUserByEmail,
  issueResetToken,
  resetPasswordWithToken,
} from './users'

describe('password hashing', () => {
  it('produces a bcrypt hash that is not the plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash).not.toBe('correct horse battery staple')
    expect(hash).toMatch(/^\$2[aby]\$/) // bcrypt identifier
  })

  it('salts: the same password hashes differently each time', async () => {
    const a = await hashPassword('hunter2')
    const b = await hashPassword('hunter2')
    expect(a).not.toBe(b)
  })

  it('verifies a correct password', async () => {
    const hash = await hashPassword('s3cret!')
    expect(await verifyPassword('s3cret!', hash)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('s3cret!')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })
})

describe('reset tokens', () => {
  beforeEach(async () => {
    await db.delete(users)
  })

  it('issues a token, resets once, and rejects reuse', async () => {
    const user = await createUser({ name: 'A', email: 'a@x.com', password: 'original-pass' })
    const token = await issueResetToken(user.email)
    expect(token).toBeTruthy()
    expect(await resetPasswordWithToken(token!, 'brand-new-pass')).toBe(true)
    const fresh = await findUserByEmail('a@x.com')
    expect(await verifyPassword('brand-new-pass', fresh!.passwordHash)).toBe(true)
    expect(await resetPasswordWithToken(token!, 'again')).toBe(false) // single-use
  })

  it('returns null for unknown emails and false for expired tokens', async () => {
    expect(await issueResetToken('ghost@x.com')).toBeNull()
    const user = await createUser({ name: 'B', email: 'b@x.com', password: 'pass-word' })
    const token = await issueResetToken(user.email)
    await db
      .update(users)
      .set({ resetTokenExpiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(users.id, user.id))
    expect(await resetPasswordWithToken(token!, 'nope-nope')).toBe(false)
  })
})
