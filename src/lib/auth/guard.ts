import 'server-only'
import { NextResponse } from 'next/server'
import { currentUser } from './users'
import type { User } from '@/lib/db/schema'

/**
 * Route-handler helper. Returns `{ user }` on success, or a NextResponse 401
 * the caller should return directly. Use:
 *
 *   const gate = await requireUser()
 *   if ('response' in gate) return gate.response
 *   const { user } = gate
 */
export async function requireUser(opts?: {
  role?: 'admin'
}): Promise<{ user: User } | { response: NextResponse }> {
  const user = await currentUser()
  if (!user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (opts?.role === 'admin' && user.role !== 'admin') {
    return { response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }
  return { user }
}

/** Pure decision used by requireUser — exported for tests. */
export function gateFor(user: User | null, opts?: { role?: 'admin' }): 401 | 403 | 'ok' {
  if (!user) return 401
  if (opts?.role === 'admin' && user.role !== 'admin') return 403
  return 'ok'
}
