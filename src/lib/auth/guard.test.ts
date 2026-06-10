import { describe, it, expect } from 'vitest'
import { gateFor } from './guard'
import type { User } from '@/lib/db/schema'

const mk = (role: 'admin' | 'host') => ({ role }) as User

describe('gateFor', () => {
  it('rejects anonymous', () => expect(gateFor(null)).toBe(401))
  it('admits any user without a role requirement', () => expect(gateFor(mk('host'))).toBe('ok'))
  it('blocks hosts from admin-only routes', () => expect(gateFor(mk('host'), { role: 'admin' })).toBe(403))
  it('admits admins to admin-only routes', () => expect(gateFor(mk('admin'), { role: 'admin' })).toBe('ok'))
})
