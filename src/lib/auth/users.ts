import 'server-only'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users, type User } from '@/lib/db/schema'
import { getSession } from './session'

const SALT_ROUNDS = 10
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)
  return rows[0]
}

export async function createUser(params: {
  name: string
  email: string
  password: string
  role?: 'admin' | 'host'
  mustChangePassword?: boolean
}): Promise<User> {
  const passwordHash = await hashPassword(params.password)
  const [row] = await db
    .insert(users)
    .values({
      name: params.name,
      email: params.email.toLowerCase(),
      passwordHash,
      role: params.role ?? 'admin',
      mustChangePassword: params.mustChangePassword ?? false,
    })
    .returning()
  return row
}

/**
 * Current user helper for server components + route handlers.
 * Returns null if no session or user not found.
 */
export async function currentUser(): Promise<User | null> {
  const session = await getSession()
  if (!session.userId) return null
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1)
  return rows[0] ?? null
}

export async function countUsers(): Promise<number> {
  const rows = await db.select({ id: users.id }).from(users)
  return rows.length
}

/** Returns the raw token to email, or null when no such user. Stored hashed. */
export async function issueResetToken(email: string): Promise<string | null> {
  const user = await findUserByEmail(email)
  if (!user) return null
  const token = randomBytes(32).toString('hex')
  await db
    .update(users)
    .set({
      resetTokenHash: sha256(token),
      resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, user.id))
  return token
}

/** Single-use: consumes the token whether by success or by the row update. */
export async function resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
  const nowIso = new Date().toISOString()
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.resetTokenHash, sha256(token)), gt(users.resetTokenExpiresAt, nowIso)))
    .limit(1)
  if (!user) return false
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      mustChangePassword: false,
      updatedAt: nowIso,
    })
    .where(eq(users.id, user.id))
  return true
}
