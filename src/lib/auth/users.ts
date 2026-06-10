import 'server-only'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users, type User } from '@/lib/db/schema'
import { getSession } from './session'

const SALT_ROUNDS = 10

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
