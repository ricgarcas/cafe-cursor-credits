import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from './users'

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
